import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOrderModel } from './order-model.js';
import { documentClient, ordersTableName } from '../dynamodb.js';

test('保存モデルは集約ルートのキーとversion条件で全明細を1回のPutにまとめる', () => {
  const model = createOrderModel(documentClient, ordersTableName);
  const input = {
    id: '00000000-0000-4000-8000-000000000000',
    customerId: '00000000-0000-4000-8000-000000000001',
    status: 'draft' as const, version: 1,
    lines: [{
      id: '00000000-0000-4000-8000-000000000002',
      productCode: 'PEN', unitPriceYen: 150, quantity: 2,
    }],
  };
  const params = model.put(input)
    .where((attributes, operations) => operations.eq(attributes.version, 0)).params();
  assert.equal(params.TableName, ordersTableName);
  assert.equal(params.Item?.id, input.id);
  assert.deepEqual(params.Item?.lines, input.lines);
  assert.match(params.ConditionExpression ?? '', /=/);
  assert(Object.values(params.ExpressionAttributeNames ?? {}).includes('version'));
  assert(Object.values(params.ExpressionAttributeValues ?? {}).includes(0));
  assert.match(model.create(input).params().ConditionExpression ?? '', /attribute_not_exists/);
});
