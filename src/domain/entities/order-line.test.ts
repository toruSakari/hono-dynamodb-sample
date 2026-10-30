import assert from "node:assert/strict";
import { test } from "node:test";
import { OrderLine, PublicOrderLineSchema } from "./order-line.js";
import { ProductCodeSchema } from "../value-objects/product-code.js";
import { QuantitySchema } from "../value-objects/quantity.js";
import { UnitPriceYenSchema } from "../value-objects/unit-price-yen.js";

void test("OrderLine は数量変更後も ID を保ち、元の子エンティティを変更しない", () => {
  const line = OrderLine.create(
    ProductCodeSchema.parse("BOOK_01"),
    UnitPriceYenSchema.parse(1200),
    QuantitySchema.parse(2),
  );
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
  assert.equal(JSON.stringify(line), "{}");
  // 不正な数量は子エンティティに渡す前のVO境界で拒否する。
  assert.throws(() => QuantitySchema.parse(0));
});

void test("OrderLine の復元は子の全項目を検証し、派生金額や未知項目を保存しない", () => {
  const line = OrderLine.create(
    ProductCodeSchema.parse("GIFT"),
    UnitPriceYenSchema.parse(0),
    QuantitySchema.parse(1),
  );
  const stored = OrderLine.toPersistenceSnapshot(line);
  assert.equal("lineTotalYen" in stored, false);
  assert.deepEqual(OrderLine.restore(stored).snapshot(), line.snapshot());
  for (const invalid of [
    { ...stored, quantity: 0 },
    { ...stored, quantity: 100 },
    { ...stored, quantity: 1.5 },
    { ...stored, unitPriceYen: -1 },
    { ...stored, unitPriceYen: 1_000_001 },
    { ...stored, unitPriceYen: 0.5 },
    { ...stored, id: "invalid" },
    { ...stored, productCode: "lower-case" },
    { ...stored, lineTotalYen: 0 },
  ]) {
    assert.throws(() => OrderLine.restore(invalid));
  }
  assert.throws(() => OrderLine.toPersistenceSnapshot({} as OrderLine));
});

void test("公開明細スキーマは許可項目だけを残し、入力を変えず凍結したコピーを返す", () => {
  const line = OrderLine.create(
    ProductCodeSchema.parse("BOOK_01"),
    UnitPriceYenSchema.parse(1200),
    QuantitySchema.parse(2),
  );
  const input = { ...line.snapshot(), internalNote: "公開しない内部メモ" };
  const projected = PublicOrderLineSchema.parse(input);
  assert.deepEqual(projected, line.snapshot());
  assert.equal("internalNote" in projected, false);
  assert.equal("internalNote" in input, true);
  assert(Object.isFrozen(projected));
  assert.throws(() => Object.assign(projected, { quantity: 99 }));
  assert.throws(() => PublicOrderLineSchema.parse({ ...input, quantity: 0 }));
});
