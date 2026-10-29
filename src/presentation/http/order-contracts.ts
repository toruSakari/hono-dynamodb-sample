import { createRoute, z } from '@hono/zod-openapi';
import { UserIdSchema } from '../../domain/value-objects/user-id.js';
import { OrderIdSchema } from '../../domain/value-objects/order-id.js';
import { OrderLineIdSchema } from '../../domain/value-objects/order-line-id.js';
import { ProductCodeSchema } from '../../domain/value-objects/product-code.js';
import { QuantitySchema } from '../../domain/value-objects/quantity.js';
import { UnitPriceYenSchema } from '../../domain/value-objects/unit-price-yen.js';
import { OrderStatusSchema } from '../../domain/value-objects/order-status.js';
import { ErrorSchema } from './contracts.js';

// 合計はクライアント入力でなく集約の計算結果。JPY整数だけを扱う。
export const PublicOrderLineSchema = z.strictObject({
  id: OrderLineIdSchema,
  productCode: ProductCodeSchema,
  unitPriceYen: UnitPriceYenSchema,
  quantity: QuantitySchema,
  lineTotalYen: z.number().int().min(0).max(99_000_000),
}).openapi('PublicOrderLine');
export const PublicOrderSchema = z.strictObject({
  id: OrderIdSchema,
  customerId: UserIdSchema,
  status: OrderStatusSchema,
  version: z.number().int().nonnegative(),
  lines: z.array(PublicOrderLineSchema).max(20),
  totalYen: z.number().int().min(0).max(1_980_000_000),
}).openapi('PublicOrder');
export const CreateOrderSchema = z.strictObject({ customerId: UserIdSchema }).openapi('CreateOrder');
export const AddOrderLineSchema = z.strictObject({
  productCode: ProductCodeSchema,
  unitPriceYen: UnitPriceYenSchema,
  quantity: QuantitySchema,
}).openapi('AddOrderLine');
export const ChangeOrderQuantitySchema = z.strictObject({ quantity: QuantitySchema }).openapi('ChangeOrderQuantity');

const params = z.object({
  id: OrderIdSchema.clone().openapi({ param: { name: 'id', in: 'path' } }),
});
const lineParams = z.object({
  id: OrderIdSchema.clone().openapi({ param: { name: 'id', in: 'path' } }),
  lineId: OrderLineIdSchema.clone().openapi({ param: { name: 'lineId', in: 'path' } }),
});
const headers = {
  'X-Request-ID': { description: '相関ID（認証には使用しない）', schema: { type: 'string' as const, format: 'uuid' } },
  'Server-Timing': { description: 'HTTP処理時間', schema: { type: 'string' as const } },
};
function response<T extends z.ZodType>(schema: T, description: string) {
  return { description, headers, content: { 'application/json': { schema } } };
}
const commonErrors = {
  400: response(ErrorSchema, '不正なパラメーターまたはJSON'),
  404: response(ErrorSchema, '注文または作成対象の顧客が存在しません'),
  409: response(ErrorSchema, '集約ルール違反または並行更新の競合'),
  413: response(ErrorSchema, 'リクエスト本文が4096 bytesを超過'),
  500: response(ErrorSchema, '内部エラー'),
};
const bodyErrors = { ...commonErrors, 415: response(ErrorSchema, 'Content-Typeはapplication/jsonを指定してください') };
function body<T extends z.ZodType>(schema: T) {
  return { required: true, content: { 'application/json': { schema } } };
}

export const createOrderRoute = createRoute({
  method: 'post', path: '/orders', operationId: 'createOrder', tags: ['Orders'],
  description: '有効なUserを顧客として空の下書き注文を作成。認証・在庫・決済は行わないローカルデモ。',
  request: { body: body(CreateOrderSchema) },
  responses: { 201: response(PublicOrderSchema, '下書き注文を作成'), ...bodyErrors },
});
export const getOrderRoute = createRoute({
  method: 'get', path: '/orders/{id}', operationId: 'getOrder', tags: ['Orders'],
  request: { params },
  responses: { 200: response(PublicOrderSchema, '注文全体の公開スナップショット'), ...commonErrors },
});
export const addOrderLineRoute = createRoute({
  method: 'post', path: '/orders/{id}/lines', operationId: 'addOrderLine', tags: ['Orders'],
  description: '下書き注文に明細を追加。商品コード重複と20明細超は拒否。単価は学習用入力であり本番の価格確定処理ではない。',
  request: { params, body: body(AddOrderLineSchema) },
  responses: { 200: response(PublicOrderSchema, '明細と合計を再計算した注文'), ...bodyErrors },
});
export const changeOrderQuantityRoute = createRoute({
  method: 'patch', path: '/orders/{id}/lines/{lineId}', operationId: 'changeOrderQuantity', tags: ['Orders'],
  request: { params: lineParams, body: body(ChangeOrderQuantitySchema) },
  responses: { 200: response(PublicOrderSchema, '数量と合計を更新した注文'), ...bodyErrors },
});
export const removeOrderLineRoute = createRoute({
  method: 'delete', path: '/orders/{id}/lines/{lineId}', operationId: 'removeOrderLine', tags: ['Orders'],
  description: '下書き注文から明細を削除。存在しない明細指定は409。',
  request: { params: lineParams },
  responses: { 200: response(PublicOrderSchema, '明細削除後の注文'), ...commonErrors },
});
export const confirmOrderRoute = createRoute({
  method: 'post', path: '/orders/{id}/confirm', operationId: 'confirmOrder', tags: ['Orders'],
  description: '空でない下書きを確定。確定後の明細変更は禁止。決済・在庫引当ではありません。',
  request: { params },
  responses: { 200: response(PublicOrderSchema, '確定済み注文'), ...commonErrors },
});
