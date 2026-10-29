import { createUser, type PasswordHasher } from '../domain/user.js';
import type { UserRepository } from '../domain/user-repository.js';
import type { NewPassword, UserId, UserName } from '../domain/value-objects.js';

// アプリケーション層はユースケースを調整する。HTTP / DynamoDB の詳細は知らない。
// 名前の変更などのルールは User 集約に任せ、保存のタイミングだけを決める。
export function createUserService(repository: UserRepository, hasher: PasswordHasher) {
  return Object.freeze({
    async register(name: UserName, password: NewPassword) {
      const user = await createUser(name, password, hasher);
      await repository.insert(user);
      return user.snapshot();
    },
    async find(id: UserId) {
      return (await repository.findById(id))?.snapshot() ?? null;
    },
    async rename(id: UserId, name: UserName) {
      const user = await repository.findById(id);
      if (!user) return null;
      const renamed = user.rename(name);
      await repository.update(renamed, user.snapshot().version);
      return renamed.snapshot();
    },
  });
}
