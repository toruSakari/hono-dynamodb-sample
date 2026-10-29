import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DeleteCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { createUser } from '../src/domain/user.js';
import { ConflictError } from '../src/domain/user-repository.js';
import { NewPasswordSchema, UserNameSchema } from '../src/domain/value-objects.js';
import { documentClient, rawClient, tableName } from '../src/infrastructure/dynamodb.js';
import { passwordHasher } from '../src/infrastructure/password-hasher.js';
import { createUserRepository } from '../src/infrastructure/user-repository.js';

test('実 DynamoDB: 保存・復元・改名・楽観ロック・破損レコード拒否', {
  skip: process.env.RUN_DYNAMODB_TESTS !== '1',
}, async () => {
  const repository = createUserRepository(documentClient, tableName);
  const user = await createUser(UserNameSchema.parse('DB サンプル'), NewPasswordSchema.parse('demo-only-long-password'), passwordHasher);
  const id = user.snapshot().id;
  try {
    await repository.insert(user);
    await assert.rejects(repository.insert(user), ConflictError);
    const restored = await repository.findById(id);
    assert(restored);
    assert(await restored.verifyPassword('demo-only-long-password', passwordHasher));
    await repository.update(restored.rename(UserNameSchema.parse('改名')), 0);
    await assert.rejects(repository.update(restored.rename(UserNameSchema.parse('競合')), 0), ConflictError);
    assert.equal((await repository.findById(id))?.snapshot().name, '改名');
    await documentClient.send(new PutCommand({ TableName: tableName, Item: { id, name: '', passwordHash: 'bad', version: 0 } }));
    await assert.rejects(repository.findById(id), /復元に失敗/);
  } finally {
    await documentClient.send(new DeleteCommand({ TableName: tableName, Key: { id } }));
    rawClient.destroy();
  }
});
