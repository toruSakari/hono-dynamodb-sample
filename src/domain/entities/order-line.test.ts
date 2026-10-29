import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OrderLine } from './order-line.js';
import { ProductCodeSchema } from '../value-objects/product-code.js';
import { QuantitySchema, type Quantity } from '../value-objects/quantity.js';
import { UnitPriceYenSchema } from '../value-objects/unit-price-yen.js';

test('OrderLine は数量変更後も ID を保ち、元の子エンティティを変更しない', () => {
  const line = OrderLine.create(ProductCodeSchema.parse('BOOK_01'), UnitPriceYenSchema.parse(1200), QuantitySchema.parse(2));
  const changed = line.changeQuantity(QuantitySchema.parse(3));
  assert.equal(line.snapshot().quantity, 2);
  assert.equal(changed.snapshot().quantity, 3);
  assert.equal(changed.snapshot().id, line.snapshot().id);
  assert.equal(line.snapshot().lineTotalYen, 2400);
  assert.equal(changed.snapshot().lineTotalYen, 3600);
  assert.notEqual(changed, line);
  assert(Object.isFrozen(OrderLine));
  assert(Object.isFrozen(line));
  assert(Object.isFrozen(line.snapshot()));
  assert.equal(JSON.stringify(line), '{}');
  assert.throws(() => line.changeQuantity(0 as Quantity));
});

test('OrderLine の復元は子の全項目を検証し、派生金額や未知項目を保存しない', () => {
  const line = OrderLine.create(ProductCodeSchema.parse('GIFT'), UnitPriceYenSchema.parse(0), QuantitySchema.parse(1));
  const stored = OrderLine.toPersistenceSnapshot(line);
  assert.equal('lineTotalYen' in stored, false);
  assert.deepEqual(OrderLine.restore(stored).snapshot(), line.snapshot());
  for (const invalid of [
    { ...stored, quantity: 0 }, { ...stored, quantity: 100 },
    { ...stored, quantity: 1.5 }, { ...stored, unitPriceYen: -1 },
    { ...stored, unitPriceYen: 1_000_001 }, { ...stored, unitPriceYen: 0.5 },
    { ...stored, id: 'invalid' }, { ...stored, productCode: 'lower-case' },
    { ...stored, lineTotalYen: 0 },
  ]) assert.throws(() => OrderLine.restore(invalid));
  assert.throws(() => OrderLine.toPersistenceSnapshot({} as OrderLine));
});
