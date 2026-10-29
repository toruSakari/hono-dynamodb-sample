import { z } from "zod";

// User / Order の楽観ロックで共通の保存バージョン規則。
// 既存の数値型と上限を保ち、集約固有の状態遷移とは分離する。
export const AggregateVersionSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER - 1);
export type AggregateVersion = z.infer<typeof AggregateVersionSchema>;
