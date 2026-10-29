import { z } from 'zod';

// このサンプルのライフサイクルは有効/無効のみ。削除とは区別する。
export const UserStatusSchema = z.enum(['active', 'disabled']).brand<'UserStatus'>();
export type UserStatus = z.infer<typeof UserStatusSchema>;
export const ActiveUserStatus = UserStatusSchema.parse('active');
export const DisabledUserStatus = UserStatusSchema.parse('disabled');
