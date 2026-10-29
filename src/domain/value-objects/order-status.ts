import { z } from 'zod';

// 確定は不可逆のサンプル。キャンセル・返金・出荷はこのモデルの対象外。
export const OrderStatusSchema = z.enum(['draft', 'confirmed']).brand<'OrderStatus'>();
export type OrderStatus = z.infer<typeof OrderStatusSchema>;
export const DraftOrderStatus = OrderStatusSchema.parse('draft');
export const ConfirmedOrderStatus = OrderStatusSchema.parse('confirmed');
