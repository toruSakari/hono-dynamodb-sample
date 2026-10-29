import type { OrderId } from "../../../domain/value-objects/order-id.js";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { z } from "zod";
import { Order } from "../../../domain/entities/order.js";
import type { OrderRepository } from "../../../domain/repositories/order-repository.js";
import { ConflictError } from "../../../domain/errors/conflict-error.js";
import { DomainRuleError } from "../../../domain/errors/domain-rule-error.js";
import { createOrderModel } from "../models/order-model.js";

const MetadataSchema = z
  .object({
    __edb_e__: z.literal("order"),
    __edb_v__: z.literal("1"),
  })
  .passthrough();

export function createOrderRepository(
  client: DynamoDBDocumentClient,
  tableName: string,
): OrderRepository {
  const model = createOrderModel(client, tableName);
  async function write(order: Order, expectedVersion?: number): Promise<void> {
    const snapshot = Order.toPersistenceSnapshot(order);
    const item = {
      id: snapshot.id,
      customerId: snapshot.customerId,
      status: snapshot.status,
      version: snapshot.version,
      lines: snapshot.lines.map((line) => ({
        id: line.id,
        productCode: line.productCode,
        unitPriceYen: line.unitPriceYen,
        quantity: line.quantity,
      })),
    };
    if (expectedVersion === undefined ? item.version !== 0 : item.version !== expectedVersion + 1) {
      throw new ConflictError("不正なバージョン遷移です");
    }
    // 20明細＋短いASCII識別子の業務制限に加え、将来の変更時にも巨大化を防ぐ。
    // 32KiBのJSON上限は400KBのDynamoDB上限より十分小さく、正確な課金サイズ計算ではない。
    if (Buffer.byteLength(JSON.stringify(item), "utf8") > 32 * 1024) {
      throw new DomainRuleError("注文集約の保存サイズ上限を超えました");
    }
    try {
      if (expectedVersion === undefined) {
        await model.create(item).go({ originalErr: true });
      } else {
        await model
          .put(item)
          .where((attributes, operations) => operations.eq(attributes.version, expectedVersion))
          .go({ originalErr: true });
      }
    } catch (error) {
      // 競合は呼び出し側に返す。古い読み取りに基づく業務判断を自動でやり直さない。
      if (error instanceof ConditionalCheckFailedException) {
        throw new ConflictError("注文の更新が競合しました");
      }
      throw error;
    }
  }
  return Object.freeze<OrderRepository>({
    async findById(id: OrderId): Promise<Order | null> {
      const raw: unknown = await model
        .get({ id })
        .go({ data: "raw", consistent: true, originalErr: true });
      const result = z.object({ data: z.object({ Item: z.unknown().optional() }) }).parse(raw).data;
      if (!result.Item) {
        return null;
      }
      try {
        const record: Record<string, unknown> = { ...MetadataSchema.parse(result.Item) };
        delete record.__edb_e__;
        delete record.__edb_v__;
        return Order.restore(record);
      } catch {
        throw new Error("注文集約の復元に失敗しました");
      }
    },
    insert(order: Order): Promise<void> {
      return write(order);
    },
    update(order: Order, expectedVersion: number): Promise<void> {
      return write(order, expectedVersion);
    },
  });
}
