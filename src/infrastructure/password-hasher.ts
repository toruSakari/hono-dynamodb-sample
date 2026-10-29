import argon2 from 'argon2';
import type { PasswordHasher } from '../domain/user.js';
import { PasswordHashSchema } from '../domain/value-objects.js';

export const passwordHasher: PasswordHasher = Object.freeze<PasswordHasher>({
  async hash(password) {
    return PasswordHashSchema.parse(await argon2.hash(password, {
      type: argon2.argon2id, memoryCost: 65536, timeCost: 3,
      parallelism: 1, hashLength: 32,
    }));
  },
  async verify(hash, candidate) {
    return argon2.verify(hash, candidate);
  },
});
