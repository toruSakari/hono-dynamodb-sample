import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { passwordHasher } from '../src/infrastructure/password-hasher.js';
import { memoryRepository } from './helpers.js';
import { ConflictError } from '../src/domain/user-repository.js';

const json = (body: unknown) => ({
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
test('HTTP 登録・取得・改名は公開スナップショットのみ返す', async () => {
  const app = createApp(memoryRepository(), passwordHasher);
  const created = await app.request('/users', json({ name: 'サンプル', password: 'demo-only-long-password' }));
  assert.equal(created.status, 201);
  const user = await created.json();
  assert.deepEqual(Object.keys(user).sort(), ['id', 'name', 'version']);
  const fetched = await app.request('/users/' + user.id);
  assert.deepEqual(await fetched.json(), user);
  const renamed = await app.request('/users/' + user.id + '/name', {
    ...json({ name: '新しい名前' }), method: 'PATCH',
  });
  assert.equal(renamed.status, 200);
  assert.deepEqual(await renamed.json(), { ...user, name: '新しい名前', version: 1 });
});
test('不正入力・不正JSON・未存在・巨大入力を区別する', async () => {
  const app = createApp(memoryRepository(), passwordHasher);
  assert.equal((await app.request('/users', json({ name: '', password: 'short' }))).status, 400);
  assert.equal((await app.request('/users', { ...json({}), body: '{' })).status, 400);
  assert.equal((await app.request('/users/not-uuid')).status, 400);
  assert.equal((await app.request('/users/00000000-0000-4000-8000-000000000000')).status, 404);
  assert.equal((await app.request('/users', json({ name: 'x'.repeat(5000) }))).status, 413);
});
test('内部エラーの詳細を漏らさず、競合は409を返す', async () => {
  const repository = memoryRepository();
  const app = createApp({
    ...repository, async findById() { throw new Error('secret-data'); },
    async insert() { throw new ConflictError('secret-data'); },
  }, passwordHasher);
  const failure = await app.request('/users/00000000-0000-4000-8000-000000000000');
  assert.equal(failure.status, 500);
  assert(! (await failure.text()).includes('secret-data'));
  const conflict = await app.request('/users', json({ name: '例', password: 'demo-only-long-password' }));
  assert.equal(conflict.status, 409);
});
