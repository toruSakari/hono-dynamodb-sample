import { AggregateVersionSchema } from "../../domain/value-objects/aggregate-version.js";
import { z } from "@hono/zod-openapi";
import { UserIdSchema } from "../../domain/value-objects/user-id.js";
import { OrderIdSchema } from "../../domain/value-objects/order-id.js";
import { OrderLineIdSchema } from "../../domain/value-objects/order-line-id.js";
import { ProductCodeSchema } from "../../domain/value-objects/product-code.js";
import { QuantitySchema } from "../../domain/value-objects/quantity.js";
import { UnitPriceYenSchema } from "../../domain/value-objects/unit-price-yen.js";
import { OrderStatusSchema } from "../../domain/value-objects/order-status.js";

// 合計はクライアント入力でなく集約の計算結果。JPY整数だけを扱う。
export const PublicOrderLineSchema = z
  .strictObject({
    id: OrderLineIdSchema,
    productCode: ProductCodeSchema,
    unitPriceYen: UnitPriceYenSchema,
    quantity: QuantitySchema,
    lineTotalYen: z.number().int().min(0).max(99_000_000),
  })
  .openapi("PublicOrderLine");
export const PublicOrderSchema = z
  .strictObject({
    id: OrderIdSchema,
    customerId: UserIdSchema,
    status: OrderStatusSchema,
    version: AggregateVersionSchema,
    lines: z.array(PublicOrderLineSchema).max(20),
    totalYen: z.number().int().min(0).max(1_980_000_000),
  })
  .openapi("PublicOrder");
export const CreateOrderSchema = z
  .strictObject({ customerId: UserIdSchema })
  .openapi("CreateOrder");
export const AddOrderLineSchema = z
  .strictObject({
    productCode: ProductCodeSchema,
    unitPriceYen: UnitPriceYenSchema,
    quantity: QuantitySchema,
  })
  .openapi("AddOrderLine");
export const ChangeOrderQuantitySchema = z
  .strictObject({ quantity: QuantitySchema })
  .openapi("ChangeOrderQuantity");

export const OrderParamsSchema = z.object({
  id: OrderIdSchema.clone().openapi({ param: { name: "id", in: "path" } }),
});
export const OrderLineParamsSchema = OrderParamsSchema.extend({
  lineId: OrderLineIdSchema.clone().openapi({ param: { name: "lineId", in: "path" } }),
});
