import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOrderService } from './order-service.js';
import { createUserService } from './user-service.js';
import { memoryOrderRepository } from '../testing/memory-order-repository.js';
import { memoryRepository } from '../testing/memory-user-repository.js';
import { passwordHasher } from '../infrastructure/password-hasher.js';
import { UserNameSchema } from '../domain/value-objects/user-name.js';
import { NewPasswordSchema } from '../domain/value-objects/new-password.js';
import { UserIdSchema } from '../domain/value-objects/user-id.js';
import { ProductCodeSchema } from '../domain/value-objects/product-code.js';
import { UnitPriceYenSchema } from '../domain/value-objects/unit-price-yen.js';
import { QuantitySchema } from '../domain/value-objects/quantity.js';
import { ConflictError } from '../domain/repositories/user-repository.js';
import { DomainRuleError } from '../domain/errors/domain-rule-error.js';

test('注文ユースケースは有効顧客の確認後だけ保存を行う', async () => {
  const users = memoryRepository();
  const orders = memoryOrderRepository();
  let inserts = 0;
  const service = createOrderService({
    ...orders, async insert(order) { inserts += 1; await orders.insert(order); },
  }, users);
  assert.equal(await service.create(UserIdSchema.parse('00000000-0000-4000-8000-000000000000')), null);
  assert.equal(inserts, 0);
  const customer = await createUserService(users, passwordHasher).register(
    UserNameSchema.parse('顧客サンプル'), NewPasswordSchema.parse('demo-only-long-password'),
  );
  const entity = await users.findById(customer.id);
  assert(entity);
  await users.update(entity.disable(), 0);
  await assert.rejects(service.create(customer.id), DomainRuleError);
  assert.equal(inserts, 0);
  await users.update(entity.disable().reactivate(), 1);
  const order = await service.create(customer.id);
  assert(order);
  assert.equal(order.customerId, customer.id);
  assert.equal(inserts, 1);
});

test('並行ユースケースは読込versionを保存条件に渡し、競合側を勝手に再実行しない', async () => {
  const users = memoryRepository();
  const orders = memoryOrderRepository();
  const customer = await createUserService(users, passwordHasher).register(
    UserNameSchema.parse('並行処理サンプル'), NewPasswordSchema.parse('demo-only-long-password'),
  );
  let updates = 0;
  const service = createOrderService({
    ...orders,
    async update(order, expectedVersion) {
      updates += 1;
      await orders.update(order, expectedVersion);
    },
  }, users);
  const created = await service.create(customer.id);
  assert(created);
  const outcomes = await Promise.allSettled([
    service.addLine(created.id, ProductCodeSchema.parse('FIRST'), UnitPriceYenSchema.parse(100), QuantitySchema.parse(1)),
    service.addLine(created.id, ProductCodeSchema.parse('SECOND'), UnitPriceYenSchema.parse(200), QuantitySchema.parse(1)),
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
  const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
  assert(rejected && rejected.status === 'rejected');
  assert(rejected.reason instanceof ConflictError);
  assert.equal(updates, 2);
  const stored = await service.find(created.id);
  assert(stored);
  assert.equal(stored.version, 1);
  assert.equal(stored.lines.length, 1);
});
