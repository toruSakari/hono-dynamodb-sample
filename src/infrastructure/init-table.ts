import { CreateTableCommand, ResourceInUseException, waitUntilTableExists } from '@aws-sdk/client-dynamodb';
import { rawClient, tableName } from './dynamodb.js';

try {
  await rawClient.send(new CreateTableCommand({
    TableName: tableName, BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
    KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
  }));
} catch (error) {
  if (!(error instanceof ResourceInUseException)) throw error;
}
await waitUntilTableExists({ client: rawClient, maxWaitTime: 30 }, { TableName: tableName });
console.log('ローカルのサンプルテーブルを準備しました');
rawClient.destroy();
