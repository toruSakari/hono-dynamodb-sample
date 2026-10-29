import { DynamoUserRepository } from "../../infrastructure/dynamodb/repositories/user-repository.js";
import { DynamoOrderRepository } from "../../infrastructure/dynamodb/repositories/order-repository.js";
import type { AppOptions } from "../dependencies.js";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { HttpEnvironment } from "../middleware/request-context.js";
import { OrderService } from "../../application/use-cases/order-service.js";
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
  options: AppOptions,
): void {
  app.openapi(createOrderRoute, async (c) => {
    const db = c.get("db");
    const userRepository = (options.userRepositoryFactory ?? DynamoUserRepository).create(db.users);
    const repository = (options.orderRepositoryFactory ?? DynamoOrderRepository).create(db.orders);
    const order = await (options.orderService ?? OrderService).create(
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
    const repository = (options.orderRepositoryFactory ?? DynamoOrderRepository).create(db.orders);
    const order = await (options.orderService ?? OrderService).find(
      repository,
      c.req.valid("param").id,
    );
    return order
      ? c.json(PublicOrderSchema.parse(order), 200)
      : c.json({ error: "注文が見つかりません" }, 404);
  });
  app.openapi(confirmOrderRoute, async (c) => {
    const db = c.get("db");
    const repository = (options.orderRepositoryFactory ?? DynamoOrderRepository).create(db.orders);
    const order = await (options.orderService ?? OrderService).confirm(
      repository,
      c.req.valid("param").id,
    );
    return order
      ? c.json(PublicOrderSchema.parse(order), 200)
      : c.json({ error: "注文が見つかりません" }, 404);
  });
}

function registerOrderLineRoutes(app: OpenAPIHono<HttpEnvironment>, options: AppOptions): void {
  app.openapi(addOrderLineRoute, async (c) => {
    const db = c.get("db");
    const repository = (options.orderRepositoryFactory ?? DynamoOrderRepository).create(db.orders);
    const input = c.req.valid("json");
    const order = await (options.orderService ?? OrderService).addLine(
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
    const repository = (options.orderRepositoryFactory ?? DynamoOrderRepository).create(db.orders);
    const input = c.req.valid("param");
    const order = await (options.orderService ?? OrderService).changeQuantity(
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
    const repository = (options.orderRepositoryFactory ?? DynamoOrderRepository).create(db.orders);
    const input = c.req.valid("param");
    const order = await (options.orderService ?? OrderService).removeLine(
      repository,
      input.id,
      input.lineId,
    );
    return order
      ? c.json(PublicOrderSchema.parse(order), 200)
      : c.json({ error: "注文が見つかりません" }, 404);
  });
}

// 全ての明細操作をOrderユースケースへ渡し、子エンティティをHTTPから直接操作しない。
export function registerOrderRoutes(
  app: OpenAPIHono<HttpEnvironment>,
  options: AppOptions = {},
): void {
  registerOrderLifecycleRoutes(app, options);
  registerOrderLineRoutes(app, options);
}
