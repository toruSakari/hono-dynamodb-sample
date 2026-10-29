import type { OrderRouteDependencies } from "../dependencies.js";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { HttpEnvironment } from "../middleware/request-context.js";
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
  dependencies: OrderRouteDependencies,
): void {
  app.openapi(createOrderRoute, async (c) => {
    const db = c.get("db");
    const userRepository = dependencies.userRepositoryFactory.create(db.users);
    const repository = dependencies.orderRepositoryFactory.create(db.orders);
    const order = await dependencies.orderService.create(
      repository,
      userRepository,
      c.req.valid("json").customerId,
    );
    return order
      ? c.json(PublicOrderSchema.parse(order), 201)
      : c.json({ error: "顧客が見つかりません" }, 404);
  });
  app.openapi(getOrderRoute, async (c) => {
    const db = c.get("db");
    const repository = dependencies.orderRepositoryFactory.create(db.orders);
    const order = await dependencies.orderService.find(repository, c.req.valid("param").id);
    return order
      ? c.json(PublicOrderSchema.parse(order), 200)
      : c.json({ error: "注文が見つかりません" }, 404);
  });
  app.openapi(confirmOrderRoute, async (c) => {
    const db = c.get("db");
    const repository = dependencies.orderRepositoryFactory.create(db.orders);
    const order = await dependencies.orderService.confirm(repository, c.req.valid("param").id);
    return order
      ? c.json(PublicOrderSchema.parse(order), 200)
      : c.json({ error: "注文が見つかりません" }, 404);
  });
}

function registerOrderLineRoutes(
  app: OpenAPIHono<HttpEnvironment>,
  dependencies: OrderRouteDependencies,
): void {
  app.openapi(addOrderLineRoute, async (c) => {
    const db = c.get("db");
    const repository = dependencies.orderRepositoryFactory.create(db.orders);
    const input = c.req.valid("json");
    const order = await dependencies.orderService.addLine(
      repository,
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
    const db = c.get("db");
    const repository = dependencies.orderRepositoryFactory.create(db.orders);
    const input = c.req.valid("param");
    const order = await dependencies.orderService.changeQuantity(
      repository,
      input.id,
      input.lineId,
      c.req.valid("json").quantity,
    );
    return order
      ? c.json(PublicOrderSchema.parse(order), 200)
      : c.json({ error: "注文が見つかりません" }, 404);
  });
  app.openapi(removeOrderLineRoute, async (c) => {
    const db = c.get("db");
    const repository = dependencies.orderRepositoryFactory.create(db.orders);
    const input = c.req.valid("param");
    const order = await dependencies.orderService.removeLine(repository, input.id, input.lineId);
    return order
      ? c.json(PublicOrderSchema.parse(order), 200)
      : c.json({ error: "注文が見つかりません" }, 404);
  });
}

// 全ての明細操作をOrderユースケースへ渡し、子エンティティをHTTPから直接操作しない。
export function registerOrderRoutes(
  app: OpenAPIHono<HttpEnvironment>,
  dependencies: OrderRouteDependencies,
): void {
  registerOrderLifecycleRoutes(app, dependencies);
  registerOrderLineRoutes(app, dependencies);
}
