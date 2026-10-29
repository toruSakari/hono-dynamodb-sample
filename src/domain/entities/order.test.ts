import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Order } from './order.js';
import { DomainRuleError } from '../errors/domain-rule-error.js';
import { UserIdSchema, type UserId } from '../value-objects/user-id.js';
import { OrderLineIdSchema } from '../value-objects/order-line-id.js';
import { ProductCodeSchema, type ProductCode } from '../value-objects/product-code.js';
import { QuantitySchema } from '../value-objects/quantity.js';
import { UnitPriceYenSchema, type UnitPriceYen } from '../value-objects/unit-price-yen.js';

const customerId = UserIdSchema.parse('00000000-0000-4000-8000-000000000001');
const code = ProductCodeSchema.parse('BOOK_01');
const price = UnitPriceYenSchema.parse(1200);
const quantity = QuantitySchema.parse(2);

test('Order がルートとして明細の追加・数量変更・削除と金額計算を調整する', () => {
  const empty = Order.create(customerId);
  const added = empty.addLine(code, price, quantity);
  const firstLine = added.snapshot().lines[0];
  assert(firstLine);
  const changed = added.changeQuantity(firstLine.id, QuantitySchema.parse(3));
  assert.equal(empty.snapshot().lines.length, 0);
  assert.equal(added.snapshot().totalYen, 2400);
  assert.equal(changed.snapshot().totalYen, 3600);
  assert.equal(changed.snapshot().lines[0]?.id, firstLine.id);
  assert.equal(changed.snapshot().id, empty.snapshot().id);
  assert.equal(changed.snapshot().customerId, customerId);
  assert.equal(changed.snapshot().version, 2);
  assert.equal('changeQuantity' in firstLine, false);
  const removed = changed.removeLine(firstLine.id);
  assert.equal(removed.snapshot().lines.length, 0);
  assert.equal(removed.snapshot().totalYen, 0);
  assert.equal(changed.snapshot().lines.length, 1);
  assert.equal(removed.snapshot().version, 3);
});

test('明細間の重複・上限・所属チェックは子ではなく Order 集約で保証する', () => {
  let order = Order.create(customerId).addLine(code, price, quantity);
  assert.throws(() => order.addLine(code, price, quantity), DomainRuleError);
  const missingId = OrderLineIdSchema.parse('00000000-0000-4000-8000-000000000099');
  assert.throws(() => order.changeQuantity(missingId, quantity), DomainRuleError);
  assert.throws(() => order.removeLine(missingId), DomainRuleError);
  for (let index = 1; index < 20; index += 1) {
    order = order.addLine(ProductCodeSchema.parse('PRODUCT_' + index), UnitPriceYenSchema.parse(1_000_000), QuantitySchema.parse(99));
  }
  assert.equal(order.snapshot().lines.length, 20);
  assert(Number.isSafeInteger(order.snapshot().totalYen));
  assert.throws(() => order.addLine(ProductCodeSchema.parse('OVER_LIMIT'), price, quantity), DomainRuleError);
});

test('確定は空注文を拒否し、確定後はルート経由の全ての明細変更を拒否する', () => {
  const empty = Order.create(customerId);
  assert.throws(() => empty.confirm(), DomainRuleError);
  const draft = empty.addLine(code, price, quantity);
  const confirmed = draft.confirm();
  const line = confirmed.snapshot().lines[0];
  assert(line);
  assert.equal(draft.snapshot().status, 'draft');
  assert.equal(confirmed.snapshot().status, 'confirmed');
  assert.equal(confirmed.snapshot().version, 2);
  assert.throws(() => confirmed.addLine(ProductCodeSchema.parse('OTHER'), price, quantity), DomainRuleError);
  assert.throws(() => confirmed.changeQuantity(line.id, quantity), DomainRuleError);
  assert.throws(() => confirmed.removeLine(line.id), DomainRuleError);
  assert.throws(() => confirmed.confirm(), DomainRuleError);
});

test('公開・保存スナップショットは子の配列まで不変で、外部参照を保持しない', () => {
  const order = Order.create(customerId).addLine(code, price, quantity);
  const snapshot = order.snapshot();
  const record = Order.toPersistenceSnapshot(order);
  assert(Object.isFrozen(Order));
  assert(Object.isFrozen(order));
  assert(Object.isFrozen(snapshot));
  assert(Object.isFrozen(snapshot.lines));
  assert(Object.isFrozen(snapshot.lines[0]));
  assert(Object.isFrozen(record));
  assert(Object.isFrozen(record.lines));
  assert(Object.isFrozen(record.lines[0]));
  assert.throws(() => Object.assign(snapshot.lines, { length: 0 }));
  assert.throws(() => Object.assign(snapshot.lines[0]!, { quantity: 99 }));
  const mutable = JSON.parse(JSON.stringify(record));
  const restored = Order.restore(mutable);
  mutable.lines[0].quantity = 99;
  mutable.lines.length = 0;
  assert.equal(restored.snapshot().totalYen, 2400);
  assert.equal('totalYen' in record, false);
  assert.equal('lineTotalYen' in record.lines[0]!, false);
  assert.equal(JSON.stringify(order), '{}');
  assert.throws(() => Order.toPersistenceSnapshot({} as Order));
});

test('DB 復元は子だけでなく集約全体の不変条件と未知項目も検証する', () => {
  const order = Order.create(customerId).addLine(code, price, quantity);
  const record = Order.toPersistenceSnapshot(order);
  const line = record.lines[0];
  assert(line);
  const otherId = OrderLineIdSchema.parse('00000000-0000-4000-8000-000000000099');
  for (const invalid of [
    { ...record, status: 'confirmed', lines: [] },
    { ...record, status: 'shipped' },
    { ...record, version: -1 },
    { ...record, id: 'invalid' },
    { ...record, customerId: 'invalid' },
    { ...record, totalYen: 2400 },
    { ...record, lines: [{ ...line, quantity: 0 }] },
    { ...record, lines: [{ ...line, extra: true }] },
    { ...record, lines: [line, { ...line, id: otherId }] },
    { ...record, lines: [line, { ...line, productCode: 'OTHER' }] },
    { ...record, lines: Array.from({ length: 21 }, () => line) },
  ]) assert.throws(() => Order.restore(invalid));
  assert.deepEqual(Order.restore(record).snapshot(), order.snapshot());
});

test('型アサーションでブランド値を偽装しても生成・追加時に再検証する', () => {
  assert.throws(() => Order.create('invalid' as UserId));
  const order = Order.create(customerId);
  assert.throws(() => order.addLine('invalid lowercase' as ProductCode, price, quantity));
  assert.throws(() => order.addLine(code, -1 as UnitPriceYen, quantity));
  assert.equal(ProductCodeSchema.parse(' BOOK_01 '), 'BOOK_01');
});
