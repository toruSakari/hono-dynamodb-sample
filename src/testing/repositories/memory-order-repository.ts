import type { OrderId } from "../../domain/value-objects/order-id.js";
import { Order } from "../../domain/entities/order.js";
import type { StoredOrder } from "../../domain/entities/order.js";
import type { OrderRepository } from "../../domain/repositories/order-repository.js";
import { ConflictError } from "../../domain/errors/conflict-error.js";

// テストでも生の集約参照を共有せず、保存スナップショットから復元する。
export function createMemoryOrderRepository(): OrderRepository {
  const records = new Map<string, StoredOrder>();
  return Object.freeze<OrderRepository>({
    async findById(id: OrderId): Promise<Order | null> {
      return records.has(id) ? Order.restore(records.get(id)) : null;
    },
    async insert(order: Order): Promise<void> {
      const record = Order.toPersistenceSnapshot(order);
      if (records.has(record.id) || record.version !== 0) {
        throw new ConflictError("注文の作成が競合しました");
      }
      records.set(record.id, record);
    },
    async update(order: Order, expectedVersion: number): Promise<void> {
      const record = Order.toPersistenceSnapshot(order);
      if (
        records.get(record.id)?.version !== expectedVersion ||
        record.version !== expectedVersion + 1
      ) {
        throw new ConflictError("注文の更新が競合しました");
      }
      records.set(record.id, record);
    },
  });
}
