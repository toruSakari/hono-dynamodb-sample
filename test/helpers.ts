import { ConflictError, type UserRepository } from '../src/domain/user-repository.js';
import { persistenceSnapshot, restoreUser, type StoredUser } from '../src/domain/user.js';

// テスト用アダプターもスナップショットで保存し、毎回エンティティに復元する。
export function memoryRepository(): UserRepository {
  const records = new Map<string, StoredUser>();
  return {
    async findById(id) { return records.has(id) ? restoreUser(records.get(id)) : null; },
    async insert(user) {
      const record = persistenceSnapshot(user);
      if (records.has(record.id)) throw new ConflictError();
      records.set(record.id, record);
    },
    async update(user, expectedVersion) {
      const record = persistenceSnapshot(user);
      if (records.get(record.id)?.version !== expectedVersion) throw new ConflictError();
      records.set(record.id, record);
    },
  };
}
