import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPassword, restorePassword, passwordHashForPersistence } from './password.js';
import { EmailAddressSchema, UserStatusSchema, PasswordCandidateSchema, NewPasswordSchema } from './index.js';
import { passwordHasher } from '../../infrastructure/password-hasher.js';

test('メール・状態・照合候補はそれぞれ独自のルールを持つ', () => {
  assert.equal(EmailAddressSchema.parse(' Demo@example.com '), 'Demo@example.com');
  assert.throws(() => EmailAddressSchema.parse('not-an-address'));
  assert.throws(() => EmailAddressSchema.parse('a\nb@example.com'));
  assert.throws(() => UserStatusSchema.parse('deleted'));
  assert.equal(PasswordCandidateSchema.parse('short'), 'short');
  assert.throws(() => NewPasswordSchema.parse('short'));
  assert.throws(() => PasswordCandidateSchema.parse('x'.repeat(129)));
});

test('Password はハッシュだけを非公開に保持し、生成・復元・照合を担当する', async () => {
  const input = NewPasswordSchema.parse('demo-only-long-password');
  const password = await createPassword(input, passwordHasher);
  assert(Object.isFrozen(password));
  assert.equal(JSON.stringify(password), '{}');
  assert.equal('hash' in password, false);
  assert.equal('plaintext' in password, false);
  const stored = passwordHashForPersistence(password);
  const restored = restorePassword(stored);
  assert.equal(passwordHashForPersistence(restored), stored);
  assert(await restored.matches(PasswordCandidateSchema.parse(input), passwordHasher));
  assert.equal(await restored.matches(PasswordCandidateSchema.parse('wrong'), passwordHasher), false);
  assert.throws(() => restorePassword('plaintext'));
});
