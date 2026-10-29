import type { OpenAPIHono } from "@hono/zod-openapi";
import type { HttpEnvironment } from "../middleware/request-context.js";
import type { OrderService } from "../../application/use-cases/order-service.js";
import { PublicOrderSchema } from "../schemas/order-schemas.js";
import {
  createOrderRoute,
  getOrderRoute,
  addOrderLineRoute,
  changeOrderQuantityRoute,
  removeOrderLineRoute,
  confirmOrderRoute,
} from "./order-routes.js";

function registerOrderLifecycleRoutes(
  app: OpenAPIHono<HttpEnvironment>,
  orderService: OrderService,
): void {
  app.openapi(createOrderRoute, async (c) => {
    const order = await orderService.create(c.req.valid("json").customerId);
    return order
      ? c.json(PublicOrderSchema.parse(order), 201)
      : c.json({ error: "顧客が見つかりません" }, 404);
  });
  app.openapi(getOrderRoute, async (c) => {
    const order = await orderService.find(c.req.valid("param").id);
    return order
      ? c.json(PublicOrderSchema.parse(order), 200)
      : c.json({ error: "注文が見つかりません" }, 404);
  });
  app.openapi(confirmOrderRoute, async (c) => {
    const order = await orderService.confirm(c.req.valid("param").id);
    return order
      ? c.json(PublicOrderSchema.parse(order), 200)
      : c.json({ error: "注文が見つかりません" }, 404);
  });
}

function registerOrderLineRoutes(
  app: OpenAPIHono<HttpEnvironment>,
  orderService: OrderService,
): void {
  app.openapi(addOrderLineRoute, async (c) => {
    const input = c.req.valid("json");
    const order = await orderService.addLine(
      c.req.valid("param").id,
      input.productCode,
      input.unitPriceYen,
      input.quantity,
    );
    return order
      ? c.json(PublicOrderSchema.parse(order), 200)
      : c.json({ error: "注文が見つかりません" }, 404);
  });
  app.openapi(changeOrderQuantityRoute, async (c) => {
    const input = c.req.valid("param");
    const order = await orderService.changeQuantity(
      input.id,
      input.lineId,
      c.req.valid("json").quantity,
    );
    return order
      ? c.json(PublicOrderSchema.parse(order), 200)
      : c.json({ error: "注文が見つかりません" }, 404);
  });
  app.openapi(removeOrderLineRoute, async (c) => {
    const input = c.req.valid("param");
    const order = await orderService.removeLine(input.id, input.lineId);
    return order
      ? c.json(PublicOrderSchema.parse(order), 200)
      : c.json({ error: "注文が見つかりません" }, 404);
  });
}

// 全ての明細操作をOrderユースケースへ渡し、子エンティティをHTTPから直接操作しない。
export function registerOrderRoutes(
  app: OpenAPIHono<HttpEnvironment>,
  service: OrderService,
): void {
  registerOrderLifecycleRoutes(app, service);
  registerOrderLineRoutes(app, service);
}
