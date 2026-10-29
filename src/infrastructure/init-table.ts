import { CreateTableCommand, ResourceInUseException, waitUntilTableExists } from '@aws-sdk/client-dynamodb';
import { rawClient, tableName, ordersTableName } from './dynamodb.js';

// UserとOrderは別集約・別テーブル。テーブル作成はElectroDBではなくSDKの責務。
try {
  for (const name of [tableName, ordersTableName]) {
    try {
      await rawClient.send(new CreateTableCommand({
        TableName: name, BillingMode: 'PAY_PER_REQUEST',
        AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
        KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
      }));
    } catch (error) {
      if (!(error instanceof ResourceInUseException)) throw error;
    }
    await waitUntilTableExists({ client: rawClient, maxWaitTime: 30 }, { TableName: name });
  }
  console.log('ローカルのサンプルテーブルを準備しました');
} finally {
  rawClient.destroy();
}
