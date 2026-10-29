import { User } from '../domain/entities/user.js';
import type { PasswordHasher } from '../domain/services/password-hasher.js';
import type { UserRepository } from '../domain/repositories/user-repository.js';
import type { EmailAddress, NewPassword, PasswordCandidate, UserId, UserName } from '../domain/value-objects/index.js';

// HTTP / DynamoDB を知らず、集約の取得・ドメイン操作・保存を調整する。
export function createUserService(repository: UserRepository, hasher: PasswordHasher) {
  async function update(id: UserId, operation: (user: User) => User | Promise<User>) {
    const user = await repository.findById(id);
    if (!user) return null;
    const changed = await operation(user);
    await repository.update(changed, user.snapshot().version);
    return changed.snapshot();
  }
  return Object.freeze({
    async register(name: UserName, password: NewPassword, email?: EmailAddress) {
      const user = await User.create(name, password, hasher, email);
      await repository.insert(user);
      return user.snapshot();
    },
    async find(id: UserId) {
      return (await repository.findById(id))?.snapshot() ?? null;
    },
    rename: (id: UserId, name: UserName) => update(id, (user) => user.rename(name)),
    changeEmail: (id: UserId, email: EmailAddress) => update(id, (user) => user.changeEmail(email)),
    changePassword: (id: UserId, current: PasswordCandidate, next: NewPassword) =>
      update(id, (user) => user.changePassword(current, next, hasher)),
    // 管理者認可はアプリ境界で別途実装するため、状態管理を HTTP には公開しない。
    disable: (id: UserId) => update(id, (user) => user.disable()),
    reactivate: (id: UserId) => update(id, (user) => user.reactivate()),
  });
}
