import { z } from "zod";

// 登録・変更時のルール。入力されたパスワードを trim / normalize しない。
export const NewPasswordSchema = z.string().min(15).max(128).brand<"NewPassword">();
export type NewPassword = z.infer<typeof NewPasswordSchema>;
