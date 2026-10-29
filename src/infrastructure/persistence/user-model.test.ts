import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createUserModel } from './user-model.js';
import { documentClient, tableName } from '../dynamodb.js';

test('ElectroDB は既存 id キーと重複防止・楽観ロック条件を生成する', () => {
  const model = createUserModel(documentClient, tableName);
  const item = {
    id: '00000000-0000-4000-8000-000000000000',
    name: '例', passwordHash: 'params-only-placeholder', status: 'active' as const, version: 0,
  };
  const get = model.get({ id: item.id }).params({ consistent: true });
  assert.deepEqual(get.Key, { id: item.id });
  assert.equal(get.ConsistentRead, true);
  const create = model.create(item).params();
  assert.match(create.ConditionExpression ?? '', /attribute_not_exists/);
  const put = model.put({ ...item, version: 1 })
    .where((attributes, operations) => operations.eq(attributes.version, 0)).params();
  assert.match(put.ConditionExpression ?? '', /=/);
  assert(Object.values(put.ExpressionAttributeNames ?? {}).includes('version'));
  assert(Object.values(put.ExpressionAttributeValues ?? {}).includes(0));
});
