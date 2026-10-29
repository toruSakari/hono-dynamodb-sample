import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createUser, persistenceSnapshot, restoreUser } from '../src/domain/user.js';
import { NewPasswordSchema, UserNameSchema } from '../src/domain/value-objects.js';
import { passwordHasher } from '../src/infrastructure/password-hasher.js';

const name = UserNameSchema.parse('サンプル');
const password = NewPasswordSchema.parse('demo-only-long-password');
test('値オブジェクトは不正値を拒否し、名前だけを trim する', () => {
  assert.equal(UserNameSchema.parse(' 名前 '), '名前');
  assert.throws(() => UserNameSchema.parse(' '));
  assert.throws(() => UserNameSchema.parse('a\nb'));
  assert.throws(() => NewPasswordSchema.parse('short'));
  assert.equal(NewPasswordSchema.parse(' demo-only-password '), ' demo-only-password ');
});
test('User はクロージャに状態を閉じ込め、変更時に新しい集約を返す', async () => {
  const original = await createUser(name, password, passwordHasher);
  const renamed = original.rename(UserNameSchema.parse('変更後'));
  assert.notEqual(original, renamed);
  assert.equal(original.snapshot().name, 'サンプル');
  assert.equal(renamed.snapshot().name, '変更後');
  assert.equal(renamed.snapshot().version, 1);
  assert.equal(original.snapshot().id, renamed.snapshot().id);
  assert(Object.isFrozen(original));
  assert(Object.isFrozen(original.snapshot()));
  assert.equal('passwordHash' in original, false);
  assert.equal('passwordHash' in original.snapshot(), false);
  assert.equal(JSON.stringify(original), '{}');
  assert.throws(() => Object.assign(original, { name: '破壊' }));
});
test('Argon2id で検証し、復元で再ハッシュせず、パスワード変更は不変', async () => {
  const user = await createUser(name, password, passwordHasher);
  const record = persistenceSnapshot(user);
  assert.match(record.passwordHash, /^\$argon2id\$/);
  assert(!record.passwordHash.includes(password));
  const restored = restoreUser(record);
  assert.equal(persistenceSnapshot(restored).passwordHash, record.passwordHash);
  assert(await restored.verifyPassword(password, passwordHasher));
  assert.equal(await restored.verifyPassword('wrong', passwordHasher), false);
  const changed = await restored.changePassword(NewPasswordSchema.parse('different-demo-password'), passwordHasher);
  assert(await restored.verifyPassword(password, passwordHasher));
  assert.equal(await changed.verifyPassword(password, passwordHasher), false);
  assert(await changed.verifyPassword('different-demo-password', passwordHasher));
});
test('DB復元時も不正な値と余分なプロパティを拒否する', async () => {
  const record = persistenceSnapshot(await createUser(name, password, passwordHasher));
  for (const invalid of [
    { ...record, name: '' }, { ...record, id: 'invalid' },
    { ...record, passwordHash: 'plaintext' }, { ...record, version: -1 },
    { ...record, extra: true },
  ]) assert.throws(() => restoreUser(invalid));
});
test('同じパスワードでも異なるソルトで保存される', async () => {
  const a = await passwordHasher.hash(password);
  const b = await passwordHasher.hash(password);
  assert.notEqual(a, b);
});
test('不正な型アサーションでも集約生成境界の検証を迂回できない', async () => {
  await assert.rejects(createUser('' as typeof name, password, passwordHasher));
  await assert.rejects(createUser(name, 'short' as typeof password, passwordHasher));
});
