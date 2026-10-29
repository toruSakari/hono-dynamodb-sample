import { z } from 'zod';

// 商品マスターとの接続は省略し、デモ内の商品コード形式だけを検証する。
export const ProductCodeSchema = z.string().trim().min(1).max(32)
  .regex(/^[A-Z0-9_-]+$/).brand<'ProductCode'>();
export type ProductCode = z.infer<typeof ProductCodeSchema>;
