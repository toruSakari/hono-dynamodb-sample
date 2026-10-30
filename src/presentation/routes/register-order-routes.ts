import type { OrderRouteDependencies } from "../dependencies.js";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { HttpEnvironment } from "../middleware/request-context.js";
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
    const repository = dependencies.orderRepositoryFactory.create(db.orders);
    const userRepository = dependencies.userRepositoryFactory.create(db.users);
    const service = dependencies.orderServiceFactory.create(repository, userRepository);
    const order = await service.create(c.req.valid("json").customerId);
    return order ? c.json(order, 201) : c.json({ error: "顧客が見つかりません" }, 404);
  });
  app.openapi(getOrderRoute, async (c) => {
    const db = c.get("db");
    const repository = dependencies.orderRepositoryFactory.create(db.orders);
    const userRepository = dependencies.userRepositoryFactory.create(db.users);
    const service = dependencies.orderServiceFactory.create(repository, userRepository);
    const order = await service.find(c.req.valid("param").id);
    return order ? c.json(order, 200) : c.json({ error: "注文が見つかりません" }, 404);
  });
  app.openapi(confirmOrderRoute, async (c) => {
    const db = c.get("db");
    const repository = dependencies.orderRepositoryFactory.create(db.orders);
    const userRepository = dependencies.userRepositoryFactory.create(db.users);
    const service = dependencies.orderServiceFactory.create(repository, userRepository);
    const order = await service.confirm(c.req.valid("param").id);
    return order ? c.json(order, 200) : c.json({ error: "注文が見つかりません" }, 404);
  });
}

function registerOrderLineRoutes(
  app: OpenAPIHono<HttpEnvironment>,
  dependencies: OrderRouteDependencies,
): void {
  app.openapi(addOrderLineRoute, async (c) => {
    const db = c.get("db");
    const repository = dependencies.orderRepositoryFactory.create(db.orders);
    const userRepository = dependencies.userRepositoryFactory.create(db.users);
    const service = dependencies.orderServiceFactory.create(repository, userRepository);
    const input = c.req.valid("json");
    const order = await service.addLine(
      c.req.valid("param").id,
      input.productCode,
      input.unitPriceYen,
      input.quantity,
    );
    return order ? c.json(order, 200) : c.json({ error: "注文が見つかりません" }, 404);
  });
  app.openapi(changeOrderQuantityRoute, async (c) => {
    const db = c.get("db");
    const repository = dependencies.orderRepositoryFactory.create(db.orders);
    const userRepository = dependencies.userRepositoryFactory.create(db.users);
    const service = dependencies.orderServiceFactory.create(repository, userRepository);
    const input = c.req.valid("param");
    const order = await service.changeQuantity(
      input.id,
      input.lineId,
      c.req.valid("json").quantity,
    );
    return order ? c.json(order, 200) : c.json({ error: "注文が見つかりません" }, 404);
  });
  app.openapi(removeOrderLineRoute, async (c) => {
    const db = c.get("db");
    const repository = dependencies.orderRepositoryFactory.create(db.orders);
    const userRepository = dependencies.userRepositoryFactory.create(db.users);
    const service = dependencies.orderServiceFactory.create(repository, userRepository);
    const input = c.req.valid("param");
    const order = await service.removeLine(input.id, input.lineId);
    return order ? c.json(order, 200) : c.json({ error: "注文が見つかりません" }, 404);
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
