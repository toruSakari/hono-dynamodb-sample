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

// 依存は生成時に閉じ込め、各操作は業務引数だけを受け取る。
function build(repository: UserRepository, hasher: PasswordHasher): UserService {
  return Object.freeze<UserService>({
    async register(name: UserName, password: NewPassword, email?: EmailAddress) {
      const user = await User.create(name, password, hasher, email);
      await repository.insert(user);
      return user.snapshot();
    },
    async find(id: UserId) {
      return (await repository.findById(id))?.snapshot() ?? null;
    },
    async rename(id: UserId, name: UserName) {
      const user = await repository.findById(id);
      if (!user) {
        return null;
      }
      const changed = user.rename(name);
      await repository.update(changed, user.snapshot().version);
      return changed.snapshot();
    },
    async changeEmail(id: UserId, email: EmailAddress) {
      const user = await repository.findById(id);
      if (!user) {
        return null;
      }
      const changed = user.changeEmail(email);
      await repository.update(changed, user.snapshot().version);
      return changed.snapshot();
    },
    async changePassword(id: UserId, current: PasswordCandidate, next: NewPassword) {
      const user = await repository.findById(id);
      if (!user) {
        return null;
      }
      const changed = await user.changePassword(current, next, hasher);
      await repository.update(changed, user.snapshot().version);
      return changed.snapshot();
    },
    // 状態管理の認可は呼び出し側で行う。HTTPには公開しない。
    async disable(id: UserId) {
      const user = await repository.findById(id);
      if (!user) {
        return null;
      }
      const changed = user.disable();
      await repository.update(changed, user.snapshot().version);
      return changed.snapshot();
    },
    // 状態管理の認可は呼び出し側で行う。HTTPには公開しない。
    async reactivate(id: UserId) {
      const user = await repository.findById(id);
      if (!user) {
        return null;
      }
      const changed = user.reactivate();
      await repository.update(changed, user.snapshot().version);
      return changed.snapshot();
    },
  });
}

export const UserService = Object.freeze({
  create(repository: UserRepository, hasher: PasswordHasher): UserService {
    return build(repository, hasher);
  },
});
