import assert from "node:assert/strict";
import { test } from "node:test";
import { DeleteCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { User } from "../../../domain/entities/user.js";
import { ConflictError } from "../../../domain/errors/conflict-error.js";
import {
  NewPasswordSchema,
  UserNameSchema,
  PasswordCandidateSchema,
  EmailAddressSchema,
} from "../../../domain/value-objects/index.js";
import { documentClient, rawClient, tableName } from "../client.js";
import { passwordHasher } from "../../security/argon2-password-hasher.js";
import { createUserRepository } from "./user-repository.js";

void test(
  "ElectroDB + 実 DynamoDB: 集約操作・楽観ロック・旧形式互換・破損レコード拒否",
  {
    skip: process.env.RUN_DYNAMODB_TESTS !== "1",
  },
  async () => {
    const repository = createUserRepository(documentClient, tableName);
    const user = await User.create(
      UserNameSchema.parse("DB サンプル"),
      NewPasswordSchema.parse("demo-only-long-password"),
      passwordHasher,
    );
    const id = user.snapshot().id;
    try {
      await repository.insert(user);
      await assert.rejects(repository.insert(user), ConflictError);
      const restored = await repository.findById(id);
      assert(restored);
      assert(
        await restored.verifyPassword(
          PasswordCandidateSchema.parse("demo-only-long-password"),
          passwordHasher,
        ),
      );
      await repository.update(restored.rename(UserNameSchema.parse("改名")), 0);
      await assert.rejects(
        repository.update(restored.rename(UserNameSchema.parse("競合")), 0),
        ConflictError,
      );
      const renamed = await repository.findById(id);
      assert(renamed);
      assert.equal(renamed.snapshot().name, "改名");
      await repository.update(renamed.changeEmail(EmailAddressSchema.parse("db@example.com")), 1);
      const emailed = await repository.findById(id);
      assert(emailed);
      assert.equal(emailed.snapshot().email, "db@example.com");
      const passwordChanged = await emailed.changePassword(
        PasswordCandidateSchema.parse("demo-only-long-password"),
        NewPasswordSchema.parse("different-demo-password"),
        passwordHasher,
      );
      await repository.update(passwordChanged, 2);
      const updated = await repository.findById(id);
      assert(updated);
      assert(
        await updated.verifyPassword(
          PasswordCandidateSchema.parse("different-demo-password"),
          passwordHasher,
        ),
      );
      assert.equal(
        await updated.verifyPassword(
          PasswordCandidateSchema.parse("demo-only-long-password"),
          passwordHasher,
        ),
        false,
      );
      await repository.update(updated.disable(), 3);
      const disabled = await repository.findById(id);
      assert(disabled);
      assert.equal(disabled.snapshot().status, "disabled");
      assert.equal(
        await disabled.verifyPassword(
          PasswordCandidateSchema.parse("different-demo-password"),
          passwordHasher,
        ),
        false,
      );
      await repository.update(disabled.reactivate(), 4);
      assert.equal((await repository.findById(id))?.snapshot().status, "active");
      // ElectroDB メタデータのない旧形式も維持し、未知項目・別モデルを黙って捨てない。
      const state = User.toPersistenceSnapshot(user);
      const legacy = {
        id: state.id,
        name: state.name,
        passwordHash: state.passwordHash,
        version: state.version,
      };
      await documentClient.send(new PutCommand({ TableName: tableName, Item: legacy }));
      assert.equal((await repository.findById(id))?.snapshot().status, "active");
      for (const invalid of [
        { ...legacy, unexpected: true },
        { ...legacy, __edb_e__: "other", __edb_v__: "1" },
        { ...legacy, __edb_e__: "user", __edb_v__: "2" },
      ]) {
        await documentClient.send(new PutCommand({ TableName: tableName, Item: invalid }));
        await assert.rejects(repository.findById(id), /復元に失敗/);
      }
      await documentClient.send(
        new PutCommand({
          TableName: tableName,
          Item: { id, name: "", passwordHash: "bad", version: 0 },
        }),
      );
      await assert.rejects(repository.findById(id), /復元に失敗/);
      await documentClient.send(new DeleteCommand({ TableName: tableName, Key: { id } }));
      assert.equal(await repository.findById(id), null);
      await assert.rejects(
        repository.update(user.rename(UserNameSchema.parse("存在しない")), 0),
        ConflictError,
      );
    } finally {
      await documentClient.send(new DeleteCommand({ TableName: tableName, Key: { id } }));
      rawClient.destroy();
    }
  },
);
