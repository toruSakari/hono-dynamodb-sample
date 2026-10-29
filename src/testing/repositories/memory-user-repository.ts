import type { UserId } from "../../domain/value-objects/user-id.js";
import { ConflictError } from "../../domain/errors/conflict-error.js";
import type { UserRepository } from "../../domain/repositories/user-repository.js";
import { User } from "../../domain/entities/user.js";
import type { StoredUser } from "../../domain/entities/user.js";

// テスト用アダプターもスナップショットで保存し、毎回エンティティに復元する。
function build(): UserRepository {
  const records = new Map<string, StoredUser>();
  return Object.freeze<UserRepository>({
    async findById(id: UserId): Promise<User | null> {
      return records.has(id) ? User.restore(records.get(id)) : null;
    },
    async insert(user: User): Promise<void> {
      const record = User.toPersistenceSnapshot(user);
      if (records.has(record.id) || record.version !== 0) {
        throw new ConflictError();
      }
      records.set(record.id, record);
    },
    async update(user: User, expectedVersion: number): Promise<void> {
      const record = User.toPersistenceSnapshot(user);
      if (
        records.get(record.id)?.version !== expectedVersion ||
        record.version !== expectedVersion + 1
      ) {
        throw new ConflictError();
      }
      records.set(record.id, record);
    },
  });
}

// 呼び出すたびにbuild内で独立したMapを生成し、テスト間で状態を共有しない。
export const MemoryUserRepository = Object.freeze({
  create(): UserRepository {
    return build();
  },
});
