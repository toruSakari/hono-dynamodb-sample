import { z } from 'zod';

// 照合時は新規登録の最小長ルールを課さず、将来のポリシー変更に備える。
// 上限は高コストなハッシュ照合への過大入力を防ぐために設ける。
export const PasswordCandidateSchema = z.string().min(1).max(128).brand<'PasswordCandidate'>();
export type PasswordCandidate = z.infer<typeof PasswordCandidateSchema>;
