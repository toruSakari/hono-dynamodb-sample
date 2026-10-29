import { randomUUID } from "node:crypto";
import { z } from "zod";
import { OrderLineIdSchema } from "../value-objects/order-line-id.js";
import { ProductCodeSchema } from "../value-objects/product-code.js";
import type { ProductCode } from "../value-objects/product-code.js";
import { QuantitySchema } from "../value-objects/quantity.js";
import type { Quantity } from "../value-objects/quantity.js";
import { UnitPriceYenSchema } from "../value-objects/unit-price-yen.js";
import type { UnitPriceYen } from "../value-objects/unit-price-yen.js";

export const StoredOrderLineSchema = z.strictObject({
  id: OrderLineIdSchema,
  productCode: ProductCodeSchema,
  unitPriceYen: UnitPriceYenSchema,
  quantity: QuantitySchema,
});
export type StoredOrderLine = Readonly<z.infer<typeof StoredOrderLineSchema>>;
// 公開項目の許可リスト。保存用とは異なり、未知項目を除去して不変な DTO にする。
export const PublicOrderLineSchema = z
  .object({
    id: OrderLineIdSchema,
    productCode: ProductCodeSchema,
    unitPriceYen: UnitPriceYenSchema,
    quantity: QuantitySchema,
    lineTotalYen: z.number().int().nonnegative().max(99_000_000),
  })
  .readonly();
export type PublicOrderLine = z.infer<typeof PublicOrderLineSchema>;
export type OrderLine = Readonly<{
  snapshot(): PublicOrderLine;
  changeQuantity(quantity: Quantity): OrderLine;
}>;
const persistence = new WeakMap<OrderLine, StoredOrderLine>();

function build(input: unknown): OrderLine {
  const state = Object.freeze(StoredOrderLineSchema.parse(input));
  const line = Object.freeze<OrderLine>({
    // ID を持つ子エンティティ。変更前後で同一性を保ち、値だけを新しくする。
    changeQuantity(quantity: Quantity): OrderLine {
      return build({ ...state, quantity: QuantitySchema.parse(quantity) });
    },
    // 単価は注文時の値を保持する。合計金額は保存せず、常に数量から算出する。
    snapshot(): PublicOrderLine {
      return PublicOrderLineSchema.parse({
        ...state,
        lineTotalYen: state.unitPriceYen * state.quantity,
      });
    },
  });
  persistence.set(line, state);
  return line;
}

// 子エンティティを単独で保存する Repository は設けない。Order が一括して保存する。
export const OrderLine = Object.freeze({
  create(productCode: ProductCode, unitPriceYen: UnitPriceYen, quantity: Quantity): OrderLine {
    return build({
      id: OrderLineIdSchema.parse(randomUUID()),
      productCode,
      unitPriceYen,
      quantity,
    });
  },
  restore(record: unknown): OrderLine {
    return build(record);
  },
  toPersistenceSnapshot(line: OrderLine): StoredOrderLine {
    const state = persistence.get(line);
    if (!state) {
      throw new TypeError("正規の OrderLine エンティティではありません");
    }
    return Object.freeze({ ...state });
  },
});
