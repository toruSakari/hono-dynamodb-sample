import { createOrderService } from '../../application/order-service.js';
import { memoryOrderRepository } from '../../testing/memory-order-repository.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../../app.js';
import { createUserService } from '../../application/user-service.js';
import { passwordHasher } from '../../infrastructure/password-hasher.js';
import { memoryRepository } from '../../testing/memory-user-repository.js';

test('手動DIした相関IDと時計を使い、成功・エラーにも安全な共通ヘッダを付ける', async () => {
  const users = memoryRepository();
  const service = createUserService(users, passwordHasher);
  let clock = 0;
  let id = 0;
  const app = createApp(service, createOrderService(memoryOrderRepository(), users), {
    newRequestId: () => '00000000-0000-4000-8000-' + String(++id).padStart(12, '0'),
    now: () => { clock += 2; return clock; },
  });
  const cases = [
    await app.request('/health', { headers: { 'X-Request-ID': 'attacker-supplied', 'X-User-ID': 'pretend-admin' } }),
    await app.request('/users/not-uuid'),
    await app.request('/not-found'),
    await app.request('/users', { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'x'.repeat(5000) }),
  ];
  assert.deepEqual(cases.map((response) => response.status), [200, 400, 404, 413]);
  for (const entry of cases.entries()) {
    const index = entry[0];
    const response = entry[1];
    assert.equal(response.headers.get('X-Request-ID'), '00000000-0000-4000-8000-' + String(index + 1).padStart(12, '0'));
    assert.equal(response.headers.get('Server-Timing'), 'app;dur=2.0');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
    assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
  }
});

test('下位層の例外も機密を漏らさず500と共通ヘッダに変換する', async () => {
  const repository = memoryRepository();
  const app = createApp(createUserService({
    ...repository, async findById() { throw new Error('do-not-expose-password-or-record'); },
  }, passwordHasher), createOrderService(memoryOrderRepository(), repository));
  const response = await app.request('/users/00000000-0000-4000-8000-000000000000');
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: '内部エラーです' });
  assert.match(response.headers.get('X-Request-ID') ?? '', /^[a-f0-9-]{36}$/);
  assert.match(response.headers.get('Server-Timing') ?? '', /^app;dur=/);
});
