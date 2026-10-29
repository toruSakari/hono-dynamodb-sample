import { randomUUID } from 'node:crypto';
import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import type { createOrderService } from './application/order-service.js';
import type { createUserService } from './application/user-service.js';
import { DomainRuleError, InvalidCurrentPasswordError } from './domain/errors/domain-rule-error.js';
import { ConflictError } from './domain/repositories/user-repository.js';
import { requestContext, type HttpEnvironment, type RequestContextDependencies } from './presentation/middleware/request-context.js';
import {
  healthRoute, createUserRoute, getUserRoute, renameRoute, changeEmailRoute, changePasswordRoute,
} from './presentation/http/contracts.js';

import { PublicOrderSchema, createOrderRoute, getOrderRoute, addOrderLineRoute, changeOrderQuantityRoute, removeOrderLineRoute, confirmOrderRoute } from './presentation/http/order-contracts.js';

// 手動 DI: composition root がユースケースを組み立てて渡す。
// HTTP 層は Repository / ハッシュ実装を生成しない。認証・認可は未実装、外部公開禁止。
export function createApp(
  service: ReturnType<typeof createUserService>,
  orderService: ReturnType<typeof createOrderService>,
  contextDependencies: RequestContextDependencies = { newRequestId: randomUUID, now: () => performance.now() },
) {
  const app = new OpenAPIHono<HttpEnvironment>({
    defaultHook: (result, c) => {
      // Zod の issues は入力された機密情報を含む可能性があるためそのまま返さない。
      if (!result.success) return c.json({ error: '入力が不正です' }, 400);
    },
  });
  app.use('*', requestContext(contextDependencies));
  app.use('*', bodyLimit({
    maxSize: 4096,
    onError: (c) => c.json({ error: 'リクエスト本文が大きすぎます' }, 413),
  }));
  app.openapi(healthRoute, (c) => c.json({ status: 'ok' as const }, 200));
  app.openapi(createUserRoute, async (c) => {
    const input = c.req.valid('json');
    return c.json(await service.register(input.name, input.password, input.email), 201);
  });
  app.openapi(getUserRoute, async (c) => {
    const user = await service.find(c.req.valid('param').id);
    return user ? c.json(user, 200) : c.json({ error: '見つかりません' }, 404);
  });
  app.openapi(renameRoute, async (c) => {
    const user = await service.rename(c.req.valid('param').id, c.req.valid('json').name);
    return user ? c.json(user, 200) : c.json({ error: '見つかりません' }, 404);
  });
  app.openapi(changeEmailRoute, async (c) => {
    const user = await service.changeEmail(c.req.valid('param').id, c.req.valid('json').email);
    return user ? c.json(user, 200) : c.json({ error: '見つかりません' }, 404);
  });
  app.openapi(changePasswordRoute, async (c) => {
    const input = c.req.valid('json');
    const user = await service.changePassword(c.req.valid('param').id, input.currentPassword, input.newPassword);
    return user ? c.json(user, 200) : c.json({ error: '見つかりません' }, 404);
  });
  app.openapi(createOrderRoute, async (c) => {
    const order = await orderService.create(c.req.valid('json').customerId);
    return order ? c.json(PublicOrderSchema.parse(order), 201) : c.json({ error: '顧客が見つかりません' }, 404);
  });
  app.openapi(getOrderRoute, async (c) => {
    const order = await orderService.find(c.req.valid('param').id);
    return order ? c.json(PublicOrderSchema.parse(order), 200) : c.json({ error: '注文が見つかりません' }, 404);
  });
  app.openapi(addOrderLineRoute, async (c) => {
    const input = c.req.valid('json');
    const order = await orderService.addLine(c.req.valid('param').id, input.productCode, input.unitPriceYen, input.quantity);
    return order ? c.json(PublicOrderSchema.parse(order), 200) : c.json({ error: '注文が見つかりません' }, 404);
  });
  app.openapi(changeOrderQuantityRoute, async (c) => {
    const input = c.req.valid('param');
    const order = await orderService.changeQuantity(input.id, input.lineId, c.req.valid('json').quantity);
    return order ? c.json(PublicOrderSchema.parse(order), 200) : c.json({ error: '注文が見つかりません' }, 404);
  });
  app.openapi(removeOrderLineRoute, async (c) => {
    const input = c.req.valid('param');
    const order = await orderService.removeLine(input.id, input.lineId);
    return order ? c.json(PublicOrderSchema.parse(order), 200) : c.json({ error: '注文が見つかりません' }, 404);
  });
  app.openapi(confirmOrderRoute, async (c) => {
    const order = await orderService.confirm(c.req.valid('param').id);
    return order ? c.json(PublicOrderSchema.parse(order), 200) : c.json({ error: '注文が見つかりません' }, 404);
  });
  app.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: {
      version: '1.2.0', title: 'DDD User and Order Sample API',
      description: 'Hono + Zod + ElectroDB のローカル学習用API。認証・認可・レート制限未実装。実情報の入力・外部公開は禁止。',
    },
    servers: [{ url: 'http://127.0.0.1:3000', description: 'ローカル専用' }],
  });
  // Swagger UI はCDNから静的JS/CSSを取得する。実データ・実パスワードを入力しない。
  app.get('/docs', swaggerUI({ url: '/openapi.json', persistAuthorization: false }));
  app.notFound((c) => c.json({ error: '見つかりません' }, 404));
  app.onError((error, c) => {
    if (error instanceof InvalidCurrentPasswordError) return c.json({ error: '現在のパスワードが一致しません' }, 403);
    if (error instanceof DomainRuleError) return c.json({ error: '現在の状態では操作できません' }, 409);
    if (error instanceof ConflictError) return c.json({ error: '更新が競合しました' }, 409);
    if (error instanceof HTTPException && error.status === 400) return c.json({ error: 'JSONまたは入力が不正です' }, 400);
    if (error instanceof HTTPException && error.status === 415) return c.json({ error: 'Content-Typeはapplication/jsonを指定してください' }, 415);
    return c.json({ error: '内部エラーです' }, 500);
  });
  return app;
}
