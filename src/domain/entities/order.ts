import { randomUUID } from "node:crypto";
import { z } from "zod";
import { DomainRuleError } from "../errors/domain-rule-error.js";
import { UserIdSchema } from "../value-objects/user-id.js";
import type { UserId } from "../value-objects/user-id.js";
import { OrderIdSchema } from "../value-objects/order-id.js";
import { OrderLineIdSchema } from "../value-objects/order-line-id.js";
import type { OrderLineId } from "../value-objects/order-line-id.js";
import { ProductCodeSchema } from "../value-objects/product-code.js";
import type { ProductCode } from "../value-objects/product-code.js";
import { QuantitySchema } from "../value-objects/quantity.js";
import type { Quantity } from "../value-objects/quantity.js";
import type { UnitPriceYen } from "../value-objects/unit-price-yen.js";
import {
  OrderStatusSchema,
  DraftOrderStatus,
  ConfirmedOrderStatus,
} from "../value-objects/order-status.js";
import { OrderLine, StoredOrderLineSchema } from "./order-line.js";
import type { StoredOrderLine, PublicOrderLine } from "./order-line.js";

const StoredOrderSchema = z
  .strictObject({
    id: OrderIdSchema,
    customerId: UserIdSchema,
    status: OrderStatusSchema,
    version: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER - 1),
    lines: z.array(StoredOrderLineSchema).max(20),
  })
  .superRefine((order, context) => {
    // 復元時も集約全体の不変条件を検証する。子の形式検証だけでは不十分。
    if (order.status === "confirmed" && order.lines.length === 0) {
      context.addIssue({ code: "custom", message: "空の注文は確定できません", path: ["lines"] });
    }
    if (new Set(order.lines.map((line) => line.id)).size !== order.lines.length) {
      context.addIssue({ code: "custom", message: "明細 ID が重複しています", path: ["lines"] });
    }
    if (new Set(order.lines.map((line) => line.productCode)).size !== order.lines.length) {
      context.addIssue({ code: "custom", message: "商品コードが重複しています", path: ["lines"] });
    }
  });
export type StoredOrder = Readonly<
  Omit<z.infer<typeof StoredOrderSchema>, "lines"> & {
    lines: readonly StoredOrderLine[];
  }
>;
export type PublicOrder = Readonly<
  Pick<StoredOrder, "id" | "customerId" | "status" | "version"> & {
    lines: readonly PublicOrderLine[];
    totalYen: number;
  }
>;
export type Order = Readonly<{
  snapshot(): PublicOrder;
  addLine(productCode: ProductCode, unitPriceYen: UnitPriceYen, quantity: Quantity): Order;
  changeQuantity(lineId: OrderLineId, quantity: Quantity): Order;
  removeLine(lineId: OrderLineId): Order;
  confirm(): Order;
}>;
const persistence = new WeakMap<Order, StoredOrder>();

function build(input: unknown): Order {
  const parsed = StoredOrderSchema.parse(input);
  const state: StoredOrder = Object.freeze({
    ...parsed,
    lines: Object.freeze(parsed.lines.map((line) => Object.freeze({ ...line }))),
  });
  const lines = Object.freeze(state.lines.map((line) => OrderLine.restore(line)));
  const requireDraft = (): void => {
    if (state.status !== "draft") {
      throw new DomainRuleError("確定した注文は変更できません");
    }
  };
  const requireLine = (inputId: OrderLineId): OrderLine => {
    const id = OrderLineIdSchema.parse(inputId);
    const line = lines.find((candidate) => candidate.snapshot().id === id);
    if (!line) {
      throw new DomainRuleError("注文内に対象の明細がありません");
    }
    return line;
  };
  const order = Object.freeze<Order>({
    // 子の操作オブジェクトは渡さず、深く凍結した公開スナップショットだけを返す。
    snapshot(): PublicOrder {
      const snapshots = Object.freeze(lines.map((line) => line.snapshot()));
      return Object.freeze({
        id: state.id,
        customerId: state.customerId,
        status: state.status,
        version: state.version,
        lines: snapshots,
        totalYen: snapshots.reduce((sum, line) => sum + line.lineTotalYen, 0),
      });
    },
    // 同一商品の重複・20明細超をルートで防ぐ。子だけでは判定できない集約ルール。
    addLine(productCode: ProductCode, unitPriceYen: UnitPriceYen, quantity: Quantity): Order {
      requireDraft();
      const validCode = ProductCodeSchema.parse(productCode);
      if (lines.length >= 20) {
        throw new DomainRuleError("注文は20明細までです");
      }
      if (lines.some((line) => line.snapshot().productCode === validCode)) {
        throw new DomainRuleError("同じ商品は数量変更で更新してください");
      }
      const added = OrderLine.create(validCode, unitPriceYen, quantity);
      return build({
        ...state,
        version: state.version + 1,
        lines: [...state.lines, OrderLine.toPersistenceSnapshot(added)],
      });
    },
    // 所属を確認してから子の振る舞いを呼ぶ。変更された子も新しい注文にだけ所属する。
    changeQuantity(lineId: OrderLineId, quantity: Quantity): Order {
      requireDraft();
      const existing = requireLine(lineId);
      const changed = existing.changeQuantity(QuantitySchema.parse(quantity));
      return build({
        ...state,
        version: state.version + 1,
        lines: lines.map((line) =>
          OrderLine.toPersistenceSnapshot(line === existing ? changed : line),
        ),
      });
    },
    // 明細の削除もルートを経由し、確定後の変更を一律に拒否する。
    removeLine(lineId: OrderLineId): Order {
      requireDraft();
      const existing = requireLine(lineId);
      return build({
        ...state,
        version: state.version + 1,
        lines: lines
          .filter((line) => line !== existing)
          .map((line) => OrderLine.toPersistenceSnapshot(line)),
      });
    },
    // 注文全体に対する確定。空注文は不可で、確定後は子の数量も変更できない。
    confirm(): Order {
      requireDraft();
      if (lines.length === 0) {
        throw new DomainRuleError("空の注文は確定できません");
      }
      return build({ ...state, status: ConfirmedOrderStatus, version: state.version + 1 });
    },
  });
  persistence.set(order, state);
  return order;
}

// User 集約そのものは内包せず、その識別子を参照する。別集約の整合性は別の境界で扱う。
export const Order = Object.freeze({
  create(customerId: UserId): Order {
    return build({
      id: OrderIdSchema.parse(randomUUID()),
      customerId: UserIdSchema.parse(customerId),
      status: DraftOrderStatus,
      version: 0,
      lines: [],
    });
  },
  restore(record: unknown): Order {
    return build(record);
  },
  toPersistenceSnapshot(order: Order): StoredOrder {
    const state = persistence.get(order);
    if (!state) {
      throw new TypeError("正規の Order 集約ではありません");
    }
    return Object.freeze({
      ...state,
      lines: Object.freeze(state.lines.map((line) => Object.freeze({ ...line }))),
    });
  },
});
