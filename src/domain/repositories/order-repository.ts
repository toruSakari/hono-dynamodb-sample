import type { Order } from "../entities/order.js";
import type { OrderId } from "../value-objects/order-id.js";

// 集約ルート単位で保存・復元する。OrderLine 専用の Repository は作らない。
export interface OrderRepository {
  findById(id: OrderId): Promise<Order | null>;
  insert(order: Order): Promise<void>;
  update(order: Order, expectedVersion: number): Promise<void>;
}
