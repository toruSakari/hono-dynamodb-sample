import { z } from 'zod';

// 到達可能性・所有権は構文検証では保証しない。確認メールは別ユースケース。
// local-part の大小文字を勝手に変更しない。
export const EmailAddressSchema = z.string().trim().max(254).pipe(z.email()).brand<'EmailAddress'>();
export type EmailAddress = z.infer<typeof EmailAddressSchema>;
