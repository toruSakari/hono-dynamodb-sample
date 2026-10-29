import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { GetCommand, PutCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { ConflictError, type UserRepository } from '../domain/user-repository.js';
import { persistenceSnapshot, restoreUser, type User } from '../domain/user.js';

export function createUserRepository(client: DynamoDBDocumentClient, tableName: string): UserRepository {
  async function write(user: User, expectedVersion?: number): Promise<void> {
    const item = persistenceSnapshot(user);
    if (expectedVersion === undefined ? item.version !== 0 : item.version !== expectedVersion + 1) {
      throw new ConflictError('不正なバージョン遷移です');
    }
    try {
      await client.send(new PutCommand({
        TableName: tableName, Item: item,
        ConditionExpression: expectedVersion === undefined
          ? 'attribute_not_exists(id)' : '#version = :expected',
        ...(expectedVersion === undefined ? {} : {
          ExpressionAttributeNames: { '#version': 'version' },
          ExpressionAttributeValues: { ':expected': expectedVersion },
        }),
      }));
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) throw new ConflictError('競合しました');
      throw error;
    }
  }
  return Object.freeze<UserRepository>({
    async findById(id) {
      const result = await client.send(new GetCommand({
        TableName: tableName, Key: { id }, ConsistentRead: true,
      }));
      if (!result.Item) return null;
      try { return restoreUser(result.Item); }
      catch { throw new Error('保存レコードの復元に失敗しました'); }
    },
    insert: (user) => write(user),
    update: (user, expectedVersion) => write(user, expectedVersion),
  });
}
