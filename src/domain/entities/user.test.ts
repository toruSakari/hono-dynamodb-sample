import { EmailAddressSchema } from "../value-objects/email-address.js";
import { DomainRuleError, InvalidCurrentPasswordError } from "../errors/domain-rule-error.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { User } from "./user.js";
import {
  NewPasswordSchema,
  UserNameSchema,
  PasswordCandidateSchema,
} from "../value-objects/index.js";
import { passwordHasher } from "../../infrastructure/security/argon2-password-hasher.js";

const name = UserNameSchema.parse("サンプル");
const password = NewPasswordSchema.parse("demo-only-long-password");
void test("User はクロージャに状態を閉じ込め、変更時に新しい集約を返す", async () => {
  const original = await User.create(name, password, passwordHasher);
  const renamed = original.rename(UserNameSchema.parse("変更後"));
  assert.notEqual(original, renamed);
  assert.equal(original.snapshot().name, "サンプル");
  assert.equal(renamed.snapshot().name, "変更後");
  assert.equal(renamed.snapshot().version, 1);
  assert.equal(original.snapshot().id, renamed.snapshot().id);
  assert(Object.isFrozen(User));
  assert(Object.isFrozen(original));
  // 故意にブランド/インスタンス型を偽装し、実行時検証が迂回できないことを確認する。
  assert.throws(() => User.toPersistenceSnapshot({} as User));
  assert(Object.isFrozen(original.snapshot()));
  assert.equal("passwordHash" in original, false);
  assert.equal("passwordHash" in original.snapshot(), false);
  assert.equal(JSON.stringify(original), "{}");
  assert.throws(() => Object.assign(original, { name: "破壊" }));
});
void test("Argon2id で検証し、復元で再ハッシュせず、パスワード変更は不変", async () => {
  const user = await User.create(name, password, passwordHasher);
  const record = User.toPersistenceSnapshot(user);
  assert.match(record.passwordHash, /^\$argon2id\$/);
  assert(!record.passwordHash.includes(password));
  const restored = User.restore(record);
  assert.equal(User.toPersistenceSnapshot(restored).passwordHash, record.passwordHash);
  assert(await restored.verifyPassword(PasswordCandidateSchema.parse(password), passwordHasher));
  assert.equal(
    await restored.verifyPassword(PasswordCandidateSchema.parse("wrong"), passwordHasher),
    false,
  );
  const changed = await restored.changePassword(
    PasswordCandidateSchema.parse(password),
    NewPasswordSchema.parse("different-demo-password"),
    passwordHasher,
  );
  assert(await restored.verifyPassword(PasswordCandidateSchema.parse(password), passwordHasher));
  assert.equal(
    await changed.verifyPassword(PasswordCandidateSchema.parse(password), passwordHasher),
    false,
  );
  assert(
    await changed.verifyPassword(
      PasswordCandidateSchema.parse("different-demo-password"),
      passwordHasher,
    ),
  );
});
void test("DB復元時も不正な値と余分なプロパティを拒否する", async () => {
  const record = User.toPersistenceSnapshot(await User.create(name, password, passwordHasher));
  for (const invalid of [
    { ...record, name: "" },
    { ...record, id: "invalid" },
    { ...record, passwordHash: "plaintext" },
    { ...record, version: -1 },
    { ...record, extra: true },
  ]) {
    assert.throws(() => User.restore(invalid));
  }
});
void test("同じパスワードでも異なるソルトで保存される", async () => {
  const a = await passwordHasher.hash(password);
  const b = await passwordHasher.hash(password);
  assert.notEqual(a, b);
});
void test("不正な型アサーションでも集約生成境界の検証を迂回できない", async () => {
  await assert.rejects(User.create("" as typeof name, password, passwordHasher));
  await assert.rejects(User.create(name, "short" as typeof password, passwordHasher));
});

void test("メール変更は元の User を変えず、状態遷移は不正な操作を拒否する", async () => {
  const original = await User.create(
    name,
    password,
    passwordHasher,
    EmailAddressSchema.parse("demo@example.com"),
  );
  const changed = original.changeEmail(EmailAddressSchema.parse("changed@example.com"));
  assert.equal(original.snapshot().email, "demo@example.com");
  assert.equal(changed.snapshot().email, "changed@example.com");
  const disabled = changed.disable();
  assert.equal(changed.snapshot().status, "active");
  assert.equal(disabled.snapshot().status, "disabled");
  assert.equal(
    await disabled.verifyPassword(PasswordCandidateSchema.parse(password), passwordHasher),
    false,
  );
  assert.throws(() => disabled.rename(name), DomainRuleError);
  assert.throws(
    () => disabled.changeEmail(EmailAddressSchema.parse("no@example.com")),
    DomainRuleError,
  );
  assert.throws(() => disabled.disable(), DomainRuleError);
  assert.throws(() => original.reactivate(), DomainRuleError);
  await assert.rejects(
    disabled.changePassword(PasswordCandidateSchema.parse(password), password, passwordHasher),
    DomainRuleError,
  );
  const reactivated = disabled.reactivate();
  assert.equal(reactivated.snapshot().version, 3);
  assert(await reactivated.verifyPassword(PasswordCandidateSchema.parse(password), passwordHasher));
});

void test("パスワード変更は現在のパスワード照合を必須にする", async () => {
  const user = await User.create(name, password, passwordHasher);
  await assert.rejects(
    user.changePassword(
      PasswordCandidateSchema.parse("wrong"),
      NewPasswordSchema.parse("different-demo-password"),
      passwordHasher,
    ),
    InvalidCurrentPasswordError,
  );
  assert.equal(user.snapshot().version, 0);
  assert(await user.verifyPassword(PasswordCandidateSchema.parse(password), passwordHasher));
});

void test("初版レコードを復元でき、新しい状態の不正値は拒否する", async () => {
  const current = User.toPersistenceSnapshot(await User.create(name, password, passwordHasher));
  const legacy = {
    id: current.id,
    name: current.name,
    passwordHash: current.passwordHash,
    version: current.version,
  };
  const restored = User.restore(legacy);
  assert.equal(restored.snapshot().email, null);
  assert.equal(restored.snapshot().status, "active");
  assert.throws(() => User.restore({ ...current, email: "invalid" }));
  assert.throws(() => User.restore({ ...current, status: "deleted" }));
});
