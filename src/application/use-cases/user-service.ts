import { User } from "../../domain/entities/user.js";
import type { PublicUser } from "../../domain/entities/user.js";
import type { PasswordHasher } from "../../domain/services/password-hasher.js";
import type { UserRepository } from "../../domain/repositories/user-repository.js";
import type {
  EmailAddress,
  NewPassword,
  PasswordCandidate,
  UserId,
  UserName,
} from "../../domain/value-objects/index.js";

export type UserService = Readonly<{
  register(name: UserName, password: NewPassword, email?: EmailAddress): Promise<PublicUser>;
  find(id: UserId): Promise<PublicUser | null>;
  rename(id: UserId, name: UserName): Promise<PublicUser | null>;
  changeEmail(id: UserId, email: EmailAddress): Promise<PublicUser | null>;
  changePassword(
    id: UserId,
    current: PasswordCandidate,
    next: NewPassword,
  ): Promise<PublicUser | null>;
  disable(id: UserId): Promise<PublicUser | null>;
  reactivate(id: UserId): Promise<PublicUser | null>;
}>;

// HTTP / DynamoDB を知らず、集約の取得・ドメイン操作・保存を調整する。
export function createUserService(repository: UserRepository, hasher: PasswordHasher): UserService {
  async function update(
    id: UserId,
    operation: (user: User) => User | Promise<User>,
  ): Promise<PublicUser | null> {
    const user = await repository.findById(id);
    if (!user) {
      return null;
    }
    const changed = await operation(user);
    await repository.update(changed, user.snapshot().version);
    return changed.snapshot();
  }
  return Object.freeze<UserService>({
    async register(
      name: UserName,
      password: NewPassword,
      email?: EmailAddress,
    ): Promise<PublicUser> {
      const user = await User.create(name, password, hasher, email);
      await repository.insert(user);
      return user.snapshot();
    },
    async find(id: UserId): Promise<PublicUser | null> {
      return (await repository.findById(id))?.snapshot() ?? null;
    },
    rename(id: UserId, name: UserName): Promise<PublicUser | null> {
      return update(id, (user) => user.rename(name));
    },
    changeEmail(id: UserId, email: EmailAddress): Promise<PublicUser | null> {
      return update(id, (user) => user.changeEmail(email));
    },
    changePassword(
      id: UserId,
      current: PasswordCandidate,
      next: NewPassword,
    ): Promise<PublicUser | null> {
      return update(id, (user) => user.changePassword(current, next, hasher));
    },
    // 管理者認可はアプリ境界で別途実装するため、状態管理を HTTP には公開しない。
    disable(id: UserId): Promise<PublicUser | null> {
      return update(id, (user) => user.disable());
    },
    reactivate(id: UserId): Promise<PublicUser | null> {
      return update(id, (user) => user.reactivate());
    },
  });
}
