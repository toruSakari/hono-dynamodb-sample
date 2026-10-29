import { z } from 'zod';

// このサンプルの Argon2id PHC 形式だけを復元する。
// パラメータを制限し、破損データが極端なメモリ消費を要求することを防ぐ。
export const PasswordHashSchema = z.string()
  .regex(/^\$argon2id\$v=19\$m=65536,(?:t=3,p=1|p=1,t=3)\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/)
  .brand<'PasswordHash'>();
export type PasswordHash = z.infer<typeof PasswordHashSchema>;
