import { PublicOrderSchema as DomainPublicOrderSchema } from "../../domain/entities/order.js";
import { z } from "@hono/zod-openapi";
import { UserIdSchema } from "../../domain/value-objects/user-id.js";
import { OrderIdSchema } from "../../domain/value-objects/order-id.js";
import { OrderLineIdSchema } from "../../domain/value-objects/order-line-id.js";
import { ProductCodeSchema } from "../../domain/value-objects/product-code.js";
import { QuantitySchema } from "../../domain/value-objects/quantity.js";
import { UnitPriceYenSchema } from "../../domain/value-objects/unit-price-yen.js";

// 公開形状はドメインの許可リストを再利用する。HTTPで再parseしない。
export const PublicOrderSchema = DomainPublicOrderSchema.clone().openapi("PublicOrder", {
  additionalProperties: false,
});
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
