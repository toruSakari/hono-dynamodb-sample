import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

// 本番 AWS への誤接続を避けるため、接続先とダミー認証情報はローカル専用に固定。
export const tableName = 'ClosureSampleUsers';
export const ordersTableName = 'ClosureSampleOrders';
export const rawClient = new DynamoDBClient({
  endpoint: 'http://127.0.0.1:8000', region: 'local',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  maxAttempts: 2,
});
export const documentClient = DynamoDBDocumentClient.from(rawClient);
