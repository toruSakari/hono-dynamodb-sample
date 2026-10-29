import { ConditionalWrite, RawGetResultSchema } from "./repository-support.js";
import type { UserId } from "../../../domain/value-objects/user-id.js";
import type { DynamoRepositoryContext } from "./repository-support.js";
import { z } from "zod";
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

function build(context: DynamoRepositoryContext): UserRepository {
  const model = createUserModel(context.client, context.tableName);
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
    ConditionalWrite.requireNextVersion(item.version, expectedVersion);
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
      ConditionalWrite.rethrow(error, "競合しました");
    }
  }
  return Object.freeze<UserRepository>({
    async findById(id: UserId): Promise<User | null> {
      // 整形済み結果では未知フィールド等が落ちるため raw で読み、ドメインで再検証する。
      const raw: unknown = await model
        .get({ id })
        .go({ data: "raw", consistent: true, originalErr: true });
      const result = RawGetResultSchema.parse(raw).data;
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

// DB接続の詳細は生成時に閉じ込め、ユースケースへはRepository契約だけを渡す。
export const DynamoUserRepository = Object.freeze({
  create(context: DynamoRepositoryContext): UserRepository {
    return build(context);
  },
});
