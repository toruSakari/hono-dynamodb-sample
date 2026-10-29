import type { User } from './user.js';
import type { UserId } from './value-objects.js';

export class ConflictError extends Error {}
export interface UserRepository {
  findById(id: UserId): Promise<User | null>;
  insert(user: User): Promise<void>;
  // 読み込んだバージョンを条件にして、並行更新による上書きを防ぐ。
  update(user: User, expectedVersion: number): Promise<void>;
}
