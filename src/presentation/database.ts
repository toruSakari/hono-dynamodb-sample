import type { UserModel } from "../infrastructure/dynamodb/models/user-model.js";
import type { OrderModel } from "../infrastructure/dynamodb/models/order-model.js";

// 接続先とテーブルを設定済みのElectroDBモデル。HTTP入力から組み立てない。
export type DatabaseModels = Readonly<{
  users: UserModel;
  orders: OrderModel;
}>;
