import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AggregateVersionSchema } from "../value-objects/aggregate-version.js";
import { DomainRuleError } from "../errors/domain-rule-error.js";
import { UserIdSchema } from "../value-objects/user-id.js";
import type { UserId } from "../value-objects/user-id.js";
import { OrderIdSchema } from "../value-objects/order-id.js";
import type { OrderLineId } from "../value-objects/order-line-id.js";
import type { ProductCode } from "../value-objects/product-code.js";
import type { Quantity } from "../value-objects/quantity.js";
import type { UnitPriceYen } from "../value-objects/unit-price-yen.js";
import {
  OrderStatusSchema,
  DraftOrderStatus,
  ConfirmedOrderStatus,
} from "../value-objects/order-status.js";
import { OrderLine, StoredOrderLineSchema, PublicOrderLineSchema } from "./order-line.js";
import type { StoredOrderLine } from "./order-line.js";

const StoredOrderSchema = z
  .strictObject({
    id: OrderIdSchema,
    customerId: UserIdSchema,
    status: OrderStatusSchema,
    version: AggregateVersionSchema,
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
// ルート・明細・配列それぞれを公開スキーマで射影し、未知項目の除去と凍結を行う。
export const PublicOrderSchema = z
  .object({
    id: OrderIdSchema,
    customerId: UserIdSchema,
    status: OrderStatusSchema,
    version: AggregateVersionSchema,
    lines: z.array(PublicOrderLineSchema).max(20).readonly(),
    totalYen: z.number().int().nonnegative().max(1_980_000_000),
  })
  .readonly();
export type PublicOrder = z.infer<typeof PublicOrderSchema>;
export type Order = Readonly<{
  snapshot(): PublicOrder;
  addLine(productCode: ProductCode, unitPriceYen: UnitPriceYen, quantity: Quantity): Order;
  changeQuantity(lineId: OrderLineId, quantity: Quantity): Order;
  removeLine(lineId: OrderLineId): Order;
  confirm(): Order;
}>;
// 実行中の集約は子エンティティをstate内に持つ。保存レコードとは型を分ける。
type OrderState = Readonly<Omit<StoredOrder, "lines"> & { lines: readonly OrderLine[] }>;
const states = new WeakMap<Order, OrderState>();

function build(input: OrderState): Order {
  const state: OrderState = Object.freeze({
    ...input,
    version: AggregateVersionSchema.parse(input.version),
    lines: Object.freeze([...input.lines]),
  });
  const requireDraft = (): void => {
    if (state.status !== "draft") {
      throw new DomainRuleError("確定した注文は変更できません");
    }
  };
  const requireLine = (id: OrderLineId): OrderLine => {
    const line = state.lines.find((candidate) => candidate.snapshot().id === id);
    if (!line) {
      throw new DomainRuleError("注文内に対象の明細がありません");
    }
    return line;
  };
  const order = Object.freeze<Order>({
    // 子の操作オブジェクトは渡さず、深く凍結した公開スナップショットだけを返す。
    snapshot() {
      const snapshots = state.lines.map((line) => line.snapshot());
      return PublicOrderSchema.parse({
        ...state,
        lines: snapshots,
        totalYen: snapshots.reduce((sum, line) => sum + line.lineTotalYen, 0),
      });
    },
    // 同一商品の重複・20明細超をルートで防ぐ。子だけでは判定できない集約ルール。
    addLine(productCode: ProductCode, unitPriceYen: UnitPriceYen, quantity: Quantity) {
      requireDraft();
      if (state.lines.length >= 20) {
        throw new DomainRuleError("注文は20明細までです");
      }
      if (state.lines.some((line) => line.snapshot().productCode === productCode)) {
        throw new DomainRuleError("同じ商品は数量変更で更新してください");
      }
      const added = OrderLine.create(productCode, unitPriceYen, quantity);
      return build({
        ...state,
        version: state.version + 1,
        lines: [...state.lines, added],
      });
    },
    // 所属を確認してから子の振る舞いを呼ぶ。変更された子も新しい注文にだけ所属する。
    changeQuantity(lineId: OrderLineId, quantity: Quantity) {
      requireDraft();
      const existing = requireLine(lineId);
      const changed = existing.changeQuantity(quantity);
      return build({
        ...state,
        version: state.version + 1,
        lines: state.lines.map((line) => (line === existing ? changed : line)),
      });
    },
    // 明細の削除もルートを経由し、確定後の変更を一律に拒否する。
    removeLine(lineId: OrderLineId) {
      requireDraft();
      const existing = requireLine(lineId);
      return build({
        ...state,
        version: state.version + 1,
        lines: state.lines.filter((line) => line !== existing),
      });
    },
    // 注文全体に対する確定。空注文は不可で、確定後は子の数量も変更できない。
    confirm() {
      requireDraft();
      if (state.lines.length === 0) {
        throw new DomainRuleError("空の注文は確定できません");
      }
      return build({ ...state, status: ConfirmedOrderStatus, version: state.version + 1 });
    },
  });
  states.set(order, state);
  return order;
}

// User 集約そのものは内包せず、その識別子を参照する。別集約の整合性は別の境界で扱う。
export const Order = Object.freeze({
  create(customerId: UserId): Order {
    return build({
      id: OrderIdSchema.parse(randomUUID()),
      customerId,
      status: DraftOrderStatus,
      version: 0,
      lines: [],
    });
  },
  restore(record: unknown): Order {
    // DB境界では明細形式だけでなく、重複・上限・確定条件も再検証する。
    const stored = StoredOrderSchema.parse(record);
    return build({ ...stored, lines: stored.lines.map((line) => OrderLine.restore(line)) });
  },
  toPersistenceSnapshot(order: Order): StoredOrder {
    const state = states.get(order);
    if (!state) {
      throw new TypeError("正規の Order 集約ではありません");
    }
    return Object.freeze({
      ...state,
      lines: Object.freeze(state.lines.map((line) => OrderLine.toPersistenceSnapshot(line))),
    });
  },
});
