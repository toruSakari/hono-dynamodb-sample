import { createUserModel } from "../infrastructure/dynamodb/models/user-model.js";
import { createOrderModel } from "../infrastructure/dynamodb/models/order-model.js";
import { serve } from "@hono/node-server";
import { createApp } from "../presentation/app.js";
import { documentClient, tableName, ordersTableName } from "../infrastructure/dynamodb/client.js";
import { passwordHasher } from "../infrastructure/security/argon2-password-hasher.js";

// Composition Root: 具象アダプターをここで選び、手動で依存関係を組み立てる。
const userDb = createUserModel(documentClient, tableName);
const orderDb = createOrderModel(documentClient, ordersTableName);
const app = createApp({ db: { users: userDb, orders: orderDb }, passwordHasher });
serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 3000 });
console.log("学習用 API: http://127.0.0.1:3000（外部公開禁止）");
