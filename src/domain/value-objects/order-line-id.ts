import { z } from 'zod';

// 注文明細の識別子。明細の数量が変わっても同じ ID を保つ。
export const OrderLineIdSchema = z.uuid().brand<'OrderLineId'>();
export type OrderLineId = z.infer<typeof OrderLineIdSchema>;
