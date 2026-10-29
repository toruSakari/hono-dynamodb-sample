import type { NewPassword } from "../../domain/value-objects/new-password.js";
import type { PasswordCandidate } from "../../domain/value-objects/password-candidate.js";
import type { PasswordHash } from "../../domain/value-objects/password-hash.js";
import argon2 from "argon2";
import type { PasswordHasher } from "../../domain/services/password-hasher.js";
import { PasswordHashSchema } from "../../domain/value-objects/password-hash.js";

export const passwordHasher: PasswordHasher = Object.freeze<PasswordHasher>({
  async hash(password: NewPassword): Promise<PasswordHash> {
    return PasswordHashSchema.parse(
      await argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 1,
        hashLength: 32,
      }),
    );
  },
  async verify(hash: PasswordHash, candidate: PasswordCandidate): Promise<boolean> {
    return argon2.verify(hash, candidate);
  },
});
