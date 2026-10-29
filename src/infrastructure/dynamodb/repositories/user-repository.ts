import type { UserId } from "../../../domain/value-objects/user-id.js";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { z } from "zod";
import { ConflictError } from "../../../domain/errors/conflict-error.js";
import type { UserRepository } from "../../../domain/repositories/user-repository.js";
import { User } from "../../../domain/entities/user.js";
import { createUserModel } from "../models/user-model.js";

// 生データから除去してよいのは既知の ElectroDB メタデータだけ。
// 別エンティティ/別モデル版は拒否。初版（両方なし）は互換性のため許可する。
const MetadataSchema = z
  .object({
    __edb_e__: z.literal("user").optional(),
    __edb_v__: z.literal("1").optional(),
  })
  .passthrough()
  .refine((row) => (row.__edb_e__ === undefined) === (row.__edb_v__ === undefined));

export function createUserRepository(
  client: DynamoDBDocumentClient,
  tableName: string,
): UserRepository {
  const model = createUserModel(client, tableName);
  async function write(user: User, expectedVersion?: number): Promise<void> {
    const state = User.toPersistenceSnapshot(user);
    const item = {
      id: state.id,
      name: state.name,
      passwordHash: state.passwordHash,
      status: state.status,
      version: state.version,
      ...(state.email === null ? {} : { email: state.email }),
    };
    if (expectedVersion === undefined ? item.version !== 0 : item.version !== expectedVersion + 1) {
      throw new ConflictError("不正なバージョン遷移です");
    }
    try {
      if (expectedVersion === undefined) {
        // create は attribute_not_exists を付加し、既存レコードを上書きしない。
        await model.create(item).go({ originalErr: true });
      } else {
        // put に version 条件を付ける。条件なしの上書き・upsert にしない。
        await model
          .put(item)
          .where((attributes, operations) => operations.eq(attributes.version, expectedVersion))
          .go({ originalErr: true });
      }
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        throw new ConflictError("競合しました");
      }
      throw error;
    }
  }
  return Object.freeze<UserRepository>({
    async findById(id: UserId): Promise<User | null> {
      // 整形済み結果では未知フィールド等が落ちるため raw で読み、ドメインで再検証する。
      const raw: unknown = await model
        .get({ id })
        .go({ data: "raw", consistent: true, originalErr: true });
      const result = z.object({ data: z.object({ Item: z.unknown().optional() }) }).parse(raw).data;
      if (!result.Item) {
        return null;
      }
      try {
        const record = { ...MetadataSchema.parse(result.Item) };
        delete record.__edb_e__;
        delete record.__edb_v__;
        return User.restore(record);
      } catch {
        throw new Error("保存レコードの復元に失敗しました");
      }
    },
    insert(user: User): Promise<void> {
      return write(user);
    },
    update(user: User, expectedVersion: number): Promise<void> {
      return write(user, expectedVersion);
    },
  });
}
