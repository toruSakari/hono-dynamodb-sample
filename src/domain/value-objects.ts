import { z } from 'zod';

// 外部入力は必ずスキーマを通す。brand は型上の区別であり、実行時検証の代わりではない。
export const UserNameSchema = z.string().trim().min(1).max(50)
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value), '制御文字は使用できません')
  .brand<'UserName'>();
export type UserName = z.infer<typeof UserNameSchema>;

// パスワードは trim / normalize しない。入力された値をそのままハッシュ化する。
export const NewPasswordSchema = z.string().min(15).max(128).brand<'NewPassword'>();
export type NewPassword = z.infer<typeof NewPasswordSchema>;
export const UserIdSchema = z.uuid().brand<'UserId'>();
export type UserId = z.infer<typeof UserIdSchema>;

// このサンプルが生成する Argon2id PHC 形式だけを復元対象にする。
// パラメータも固定し、破損レコードから極端なメモリ消費を要求されることを防ぐ。
export const PasswordHashSchema = z.string()
  .regex(/^\$argon2id\$v=19\$m=65536,(?:t=3,p=1|p=1,t=3)\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/)
  .brand<'PasswordHash'>();
export type PasswordHash = z.infer<typeof PasswordHashSchema>;
