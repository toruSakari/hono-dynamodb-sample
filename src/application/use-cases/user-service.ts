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

// 依存を操作ごとに渡す。取得・ドメイン操作・保存をその場で読めるようにする。
export const UserService = Object.freeze({
  async register(
    repository: UserRepository,
    hasher: PasswordHasher,
    name: UserName,
    password: NewPassword,
    email?: EmailAddress,
  ): Promise<PublicUser> {
    const user = await User.create(name, password, hasher, email);
    await repository.insert(user);
    return user.snapshot();
  },
  async find(repository: UserRepository, id: UserId): Promise<PublicUser | null> {
    return (await repository.findById(id))?.snapshot() ?? null;
  },
  async rename(repository: UserRepository, id: UserId, name: UserName): Promise<PublicUser | null> {
    const user = await repository.findById(id);
    if (!user) {
      return null;
    }
    const changed = user.rename(name);
    await repository.update(changed, user.snapshot().version);
    return changed.snapshot();
  },
  async changeEmail(
    repository: UserRepository,
    id: UserId,
    email: EmailAddress,
  ): Promise<PublicUser | null> {
    const user = await repository.findById(id);
    if (!user) {
      return null;
    }
    const changed = user.changeEmail(email);
    await repository.update(changed, user.snapshot().version);
    return changed.snapshot();
  },
  async changePassword(
    repository: UserRepository,
    hasher: PasswordHasher,
    id: UserId,
    current: PasswordCandidate,
    next: NewPassword,
  ): Promise<PublicUser | null> {
    const user = await repository.findById(id);
    if (!user) {
      return null;
    }
    const changed = await user.changePassword(current, next, hasher);
    await repository.update(changed, user.snapshot().version);
    return changed.snapshot();
  },
  // 状態管理の認可は呼び出し側で行う。HTTPには公開しない。
  async disable(repository: UserRepository, id: UserId): Promise<PublicUser | null> {
    const user = await repository.findById(id);
    if (!user) {
      return null;
    }
    const changed = user.disable();
    await repository.update(changed, user.snapshot().version);
    return changed.snapshot();
  },
  // 状態管理の認可は呼び出し側で行う。HTTPには公開しない。
  async reactivate(repository: UserRepository, id: UserId): Promise<PublicUser | null> {
    const user = await repository.findById(id);
    if (!user) {
      return null;
    }
    const changed = user.reactivate();
    await repository.update(changed, user.snapshot().version);
    return changed.snapshot();
  },
});
export type UserService = typeof UserService;
