import { createOrderService } from './application/order-service.js';
import { createOrderRepository } from './infrastructure/order-repository.js';
import { createUserService } from './application/user-service.js';
import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { documentClient, tableName, ordersTableName } from './infrastructure/dynamodb.js';
import { passwordHasher } from './infrastructure/password-hasher.js';
import { createUserRepository } from './infrastructure/user-repository.js';

// Composition Root: 具象アダプターをここで選び、手動で依存関係を組み立てる。
const repository = createUserRepository(documentClient, tableName);
const userService = createUserService(repository, passwordHasher);
const orderRepository = createOrderRepository(documentClient, ordersTableName);
const orderService = createOrderService(orderRepository, repository);
const app = createApp(userService, orderService);
serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 3000 });
console.log('学習用 API: http://127.0.0.1:3000（外部公開禁止）');
