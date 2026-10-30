import { Order } from "../../domain/entities/order.js";
import type { PublicOrder } from "../../domain/entities/order.js";
import type { OrderRepository } from "../../domain/repositories/order-repository.js";
import type { UserRepository } from "../../domain/repositories/user-repository.js";
import { DomainRuleError } from "../../domain/errors/domain-rule-error.js";
import type { UserId } from "../../domain/value-objects/user-id.js";
import type { OrderId } from "../../domain/value-objects/order-id.js";
import type { OrderLineId } from "../../domain/value-objects/order-line-id.js";
import type { ProductCode } from "../../domain/value-objects/product-code.js";
import type { Quantity } from "../../domain/value-objects/quantity.js";
import type { UnitPriceYen } from "../../domain/value-objects/unit-price-yen.js";

export type OrderService = Readonly<{
  create(customerId: UserId): Promise<PublicOrder | null>;
  find(id: OrderId): Promise<PublicOrder | null>;
  addLine(
    id: OrderId,
    productCode: ProductCode,
    unitPriceYen: UnitPriceYen,
    quantity: Quantity,
  ): Promise<PublicOrder | null>;
  changeQuantity(id: OrderId, lineId: OrderLineId, quantity: Quantity): Promise<PublicOrder | null>;
  removeLine(id: OrderId, lineId: OrderLineId): Promise<PublicOrder | null>;
  confirm(id: OrderId): Promise<PublicOrder | null>;
}>;

// 依存は生成時に閉じ込め、各操作は業務引数だけを受け取る。
function build(repository: OrderRepository, users: UserRepository): OrderService {
  return Object.freeze<OrderService>({
    async create(customerId: UserId): Promise<PublicOrder | null> {
      const customer = await users.findById(customerId);
      if (!customer) {
        return null;
      }
      if (customer.snapshot().status !== "active") {
        throw new DomainRuleError("無効なユーザーは注文を作成できません");
      }
      // User確認とOrder保存は別操作。集約をまたぐ原子性は提供しない。
      const order = Order.create(customerId);
      await repository.insert(order);
      return order.snapshot();
    },
    async find(id: OrderId): Promise<PublicOrder | null> {
      return (await repository.findById(id))?.snapshot() ?? null;
    },
    async addLine(
      id: OrderId,
      productCode: ProductCode,
      unitPriceYen: UnitPriceYen,
      quantity: Quantity,
    ): Promise<PublicOrder | null> {
      const order = await repository.findById(id);
      if (!order) {
        return null;
      }
      const changed = order.addLine(productCode, unitPriceYen, quantity);
      await repository.update(changed, order.snapshot().version);
      return changed.snapshot();
    },
    async changeQuantity(
      id: OrderId,
      lineId: OrderLineId,
      quantity: Quantity,
    ): Promise<PublicOrder | null> {
      const order = await repository.findById(id);
      if (!order) {
        return null;
      }
      const changed = order.changeQuantity(lineId, quantity);
      await repository.update(changed, order.snapshot().version);
      return changed.snapshot();
    },
    async removeLine(id: OrderId, lineId: OrderLineId): Promise<PublicOrder | null> {
      const order = await repository.findById(id);
      if (!order) {
        return null;
      }
      const changed = order.removeLine(lineId);
      await repository.update(changed, order.snapshot().version);
      return changed.snapshot();
    },
    async confirm(id: OrderId): Promise<PublicOrder | null> {
      const order = await repository.findById(id);
      if (!order) {
        return null;
      }
      const changed = order.confirm();
      await repository.update(changed, order.snapshot().version);
      return changed.snapshot();
    },
  });
}

export const OrderService = Object.freeze({
  create(repository: OrderRepository, users: UserRepository): OrderService {
    return build(repository, users);
  },
});
