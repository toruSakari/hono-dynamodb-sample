import { createOrderService } from './application/order-service.js';
import { memoryOrderRepository } from './testing/memory-order-repository.js';
import type { UserRepository } from './domain/repositories/user-repository.js';
import { UserIdSchema, PasswordCandidateSchema } from './domain/value-objects/index.js';
import { createUserService } from './application/user-service.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from './app.js';
import { passwordHasher } from './infrastructure/password-hasher.js';
import { memoryRepository } from './testing/memory-user-repository.js';
import { ConflictError } from './domain/repositories/user-repository.js';

function makeApp(repository: UserRepository = memoryRepository()) {
  return createApp(
    createUserService(repository, passwordHasher),
    createOrderService(memoryOrderRepository(), repository),
  );
}

const json = (body: unknown) => ({
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
test('HTTP 登録・取得・改名は公開スナップショットのみ返す', async () => {
  const app = makeApp();
  const created = await app.request('/users', json({ name: 'サンプル', password: 'demo-only-long-password' }));
  assert.equal(created.status, 201);
  const user = await created.json();
  assert.deepEqual(Object.keys(user).sort(), ['email', 'id', 'name', 'status', 'version']);
  const fetched = await app.request('/users/' + user.id);
  assert.deepEqual(await fetched.json(), user);
  const renamed = await app.request('/users/' + user.id + '/name', {
    ...json({ name: '新しい名前' }), method: 'PATCH',
  });
  assert.equal(renamed.status, 200);
  assert.deepEqual(await renamed.json(), { ...user, name: '新しい名前', version: 1 });
});
test('不正入力・不正JSON・未存在・巨大入力を区別する', async () => {
  const app = makeApp();
  assert.equal((await app.request('/users', json({ name: '', password: 'short' }))).status, 400);
  assert.equal((await app.request('/users', { ...json({}), body: '{' })).status, 400);
  assert.equal((await app.request('/users/not-uuid')).status, 400);
  assert.equal((await app.request('/users/00000000-0000-4000-8000-000000000000')).status, 404);
  assert.equal((await app.request('/users', json({ name: 'x'.repeat(5000) }))).status, 413);
});
test('内部エラーの詳細を漏らさず、競合は409を返す', async () => {
  const repository = memoryRepository();
  const app = makeApp({
    ...repository, async findById() { throw new Error('secret-data'); },
    async insert() { throw new ConflictError('secret-data'); },
  });
  const failure = await app.request('/users/00000000-0000-4000-8000-000000000000');
  assert.equal(failure.status, 500);
  assert(! (await failure.text()).includes('secret-data'));
  const conflict = await app.request('/users', json({ name: '例', password: 'demo-only-long-password' }));
  assert.equal(conflict.status, 409);
});

test('メールとパスワードを変更でき、誤った現在パスワードや不正入力は保存しない', async () => {
  const repository = memoryRepository();
  const app = makeApp(repository);
  const response = await app.request('/users', json({ name: '例', email: 'demo@example.com', password: 'demo-only-long-password' }));
  const user = await response.json();
  assert.equal(response.status, 201);
  const email = await app.request('/users/' + user.id + '/email', { ...json({ email: 'changed@example.com' }), method: 'PATCH' });
  assert.equal(email.status, 200);
  assert.equal((await email.json()).email, 'changed@example.com');
  const rejected = await app.request('/users/' + user.id + '/password', {
    ...json({ currentPassword: 'wrong', newPassword: 'different-demo-password' }), method: 'PATCH',
  });
  assert.equal(rejected.status, 403);
  assert.equal((await (await app.request('/users/' + user.id)).json()).version, 1);
  const accepted = await app.request('/users/' + user.id + '/password', {
    ...json({ currentPassword: 'demo-only-long-password', newPassword: 'different-demo-password' }), method: 'PATCH',
  });
  assert.equal(accepted.status, 200);
  const publicUser = await accepted.json();
  assert.equal(publicUser.version, 2);
  assert.deepEqual(Object.keys(publicUser).sort(), ['email', 'id', 'name', 'status', 'version']);
  const stored = await repository.findById(UserIdSchema.parse(user.id));
  assert(stored);
  assert(await stored.verifyPassword(PasswordCandidateSchema.parse('different-demo-password'), passwordHasher));
  assert.equal(await stored.verifyPassword(PasswordCandidateSchema.parse('demo-only-long-password'), passwordHasher), false);
  const invalidEmail = await app.request('/users/' + user.id + '/email', { ...json({ email: 'invalid' }), method: 'PATCH' });
  assert.equal(invalidEmail.status, 400);
});

test('無効 User の HTTP 変更は409、管理者向け状態操作はHTTP非公開', async () => {
  const repository = memoryRepository();
  const app = makeApp(repository);
  const response = await app.request('/users', json({ name: '例', password: 'demo-only-long-password' }));
  const user = await response.json();
  const stored = await repository.findById(UserIdSchema.parse(user.id));
  assert(stored);
  await repository.update(stored.disable(), 0);
  const response2 = await app.request('/users/' + user.id + '/name', { ...json({ name: '変更' }), method: 'PATCH' });
  assert.equal(response2.status, 409);
  assert.equal((await app.request('/users/' + user.id + '/reactivate', { method: 'POST' })).status, 404);
});
