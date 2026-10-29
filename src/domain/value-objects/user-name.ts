import { z } from "zod";

// 表示名のルール。空白のみ・制御文字・50文字超を拒否する。
export const UserNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  // oxlint-disable-next-line no-control-regex -- 制御文字を拒否するドメインルールのため意図的に検出する。
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value), "制御文字は使用できません")
  .brand<"UserName">();
export type UserName = z.infer<typeof UserNameSchema>;
