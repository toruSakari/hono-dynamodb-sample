import { createRoute } from "@hono/zod-openapi";
import {
  CreateOrderSchema,
  PublicOrderSchema,
  AddOrderLineSchema,
  ChangeOrderQuantitySchema,
  OrderParamsSchema,
  OrderLineParamsSchema,
} from "../schemas/order-schemas.js";
import {
  jsonResponse as response,
  jsonBody as body,
  errorResponse,
  commonErrors as baseErrors,
} from "./responses.js";
const commonErrors = {
  ...baseErrors,
  404: errorResponse("注文または顧客が存在しません"),
  409: errorResponse("集約ルール違反または並行更新の競合"),
};
const bodyErrors = {
  ...commonErrors,
  415: errorResponse("Content-Typeはapplication/jsonを指定してください"),
};

export const createOrderRoute = createRoute({
  method: "post",
  path: "/orders",
  operationId: "createOrder",
  tags: ["Orders"],
  description:
    "有効なUserを顧客として空の下書き注文を作成。認証・在庫・決済は行わないローカルデモ。",
  request: { body: body(CreateOrderSchema) },
  responses: { 201: response(PublicOrderSchema, "下書き注文を作成"), ...bodyErrors },
});
export const getOrderRoute = createRoute({
  method: "get",
  path: "/orders/{id}",
  operationId: "getOrder",
  tags: ["Orders"],
  request: { params: OrderParamsSchema },
  responses: {
    200: response(PublicOrderSchema, "注文全体の公開スナップショット"),
    ...commonErrors,
  },
});
export const addOrderLineRoute = createRoute({
  method: "post",
  path: "/orders/{id}/lines",
  operationId: "addOrderLine",
  tags: ["Orders"],
  description:
    "下書き注文に明細を追加。商品コード重複と20明細超は拒否。単価は学習用入力であり本番の価格確定処理ではない。",
  request: { params: OrderParamsSchema, body: body(AddOrderLineSchema) },
  responses: { 200: response(PublicOrderSchema, "明細と合計を再計算した注文"), ...bodyErrors },
});
export const changeOrderQuantityRoute = createRoute({
  method: "patch",
  path: "/orders/{id}/lines/{lineId}",
  operationId: "changeOrderQuantity",
  tags: ["Orders"],
  request: { params: OrderLineParamsSchema, body: body(ChangeOrderQuantitySchema) },
  responses: { 200: response(PublicOrderSchema, "数量と合計を更新した注文"), ...bodyErrors },
});
export const removeOrderLineRoute = createRoute({
  method: "delete",
  path: "/orders/{id}/lines/{lineId}",
  operationId: "removeOrderLine",
  tags: ["Orders"],
  description: "下書き注文から明細を削除。存在しない明細指定は409。",
  request: { params: OrderLineParamsSchema },
  responses: { 200: response(PublicOrderSchema, "明細削除後の注文"), ...commonErrors },
});
export const confirmOrderRoute = createRoute({
  method: "post",
  path: "/orders/{id}/confirm",
  operationId: "confirmOrder",
  tags: ["Orders"],
  description: "空でない下書きを確定。確定後の明細変更は禁止。決済・在庫引当ではありません。",
  request: { params: OrderParamsSchema },
  responses: { 200: response(PublicOrderSchema, "確定済み注文"), ...commonErrors },
});
