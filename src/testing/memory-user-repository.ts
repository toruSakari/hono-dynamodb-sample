import { ConflictError, type UserRepository } from '../domain/repositories/user-repository.js';
import { User, type StoredUser } from '../domain/entities/user.js';

// テスト用アダプターもスナップショットで保存し、毎回エンティティに復元する。
export function memoryRepository(): UserRepository {
  const records = new Map<string, StoredUser>();
  return {
    async findById(id) { return records.has(id) ? User.restore(records.get(id)) : null; },
    async insert(user) {
      const record = User.toPersistenceSnapshot(user);
      if (records.has(record.id)) throw new ConflictError();
      records.set(record.id, record);
    },
    async update(user, expectedVersion) {
      const record = User.toPersistenceSnapshot(user);
      if (records.get(record.id)?.version !== expectedVersion) throw new ConflictError();
      records.set(record.id, record);
    },
  };
}
