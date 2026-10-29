import { Entity } from 'electrodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

// ElectroDB の Entity は保存モデル。DDD の User 集約とは別の責務。
// 既存の id 単独パーティションキーを維持し、テーブルの再作成を不要にする。
export function createUserModel(client: DynamoDBDocumentClient, table: string) {
  return new Entity({
    model: { entity: 'user', version: '1', service: 'closure-sample' },
    attributes: {
      id: { type: 'string', required: true },
      name: { type: 'string', required: true },
      passwordHash: { type: 'string', required: true },
      email: { type: 'string' },
      status: { type: ['active', 'disabled'] as const, required: true },
      version: { type: 'number', required: true },
    },
    indexes: {
      byId: { pk: { field: 'id', composite: ['id'], template: '${id}', casing: 'none' } },
    },
  }, { client, table });
}
