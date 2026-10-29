import { z } from 'zod';

// 注文集約ルートの識別子。UserId・OrderLineId と混同しない。
export const OrderIdSchema = z.uuid().brand<'OrderId'>();
export type OrderId = z.infer<typeof OrderIdSchema>;
