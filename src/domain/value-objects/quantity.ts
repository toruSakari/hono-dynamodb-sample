import { z } from 'zod';

// 明細の数量は 1〜99 の整数。削除は数量 0 ではなく明示的な操作にする。
export const QuantitySchema = z.number().int().min(1).max(99).brand<'Quantity'>();
export type Quantity = z.infer<typeof QuantitySchema>;
