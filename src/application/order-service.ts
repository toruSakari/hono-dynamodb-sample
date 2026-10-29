import { Order } from '../domain/entities/order.js';
import type { OrderRepository } from '../domain/repositories/order-repository.js';
import type { UserRepository } from '../domain/repositories/user-repository.js';
import { DomainRuleError } from '../domain/errors/domain-rule-error.js';
import type { UserId } from '../domain/value-objects/user-id.js';
import type { OrderId } from '../domain/value-objects/order-id.js';
import type { OrderLineId } from '../domain/value-objects/order-line-id.js';
import type { ProductCode } from '../domain/value-objects/product-code.js';
import type { Quantity } from '../domain/value-objects/quantity.js';
import type { UnitPriceYen } from '../domain/value-objects/unit-price-yen.js';

// 別集約の存在確認と保存を調整する。明細の整合性・確定ルールは Order に任せる。
export function createOrderService(repository: OrderRepository, users: UserRepository) {
  async function update(id: OrderId, operation: (order: Order) => Order) {
    const order = await repository.findById(id);
    if (!order) return null;
    const changed = operation(order);
    await repository.update(changed, order.snapshot().version);
    return changed.snapshot();
  }
  return Object.freeze({
    async create(customerId: UserId) {
      const customer = await users.findById(customerId);
      if (!customer) return null;
      if (customer.snapshot().status !== 'active') throw new DomainRuleError('無効なユーザーは注文を作成できません');
      // User確認とOrder保存は別操作。集約をまたぐ原子性はこのサンプルでは提供しない。
      const order = Order.create(customerId);
      await repository.insert(order);
      return order.snapshot();
    },
    async find(id: OrderId) {
      return (await repository.findById(id))?.snapshot() ?? null;
    },
    addLine: (id: OrderId, productCode: ProductCode, unitPriceYen: UnitPriceYen, quantity: Quantity) =>
      update(id, (order) => order.addLine(productCode, unitPriceYen, quantity)),
    changeQuantity: (id: OrderId, lineId: OrderLineId, quantity: Quantity) =>
      update(id, (order) => order.changeQuantity(lineId, quantity)),
    removeLine: (id: OrderId, lineId: OrderLineId) => update(id, (order) => order.removeLine(lineId)),
    confirm: (id: OrderId) => update(id, (order) => order.confirm()),
  });
}
