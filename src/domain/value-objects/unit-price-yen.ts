import { z } from 'zod';

// 円の整数だけを扱い、浮動小数点の丸めや通貨混在を避ける。税込/税抜計算は省略。
export const UnitPriceYenSchema = z.number().int().min(0).max(1_000_000).brand<'UnitPriceYen'>();
export type UnitPriceYen = z.infer<typeof UnitPriceYenSchema>;
