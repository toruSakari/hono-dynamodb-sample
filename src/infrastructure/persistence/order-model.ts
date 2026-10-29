import { Entity } from 'electrodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

// 明細ごとのアイテムに分解せず、Order集約全体を1アイテムとして保存する。
// これによりルートのversion条件と全明細の変更を1回のPutで原子的に適用できる。
export function createOrderModel(client: DynamoDBDocumentClient, table: string) {
  return new Entity({
    model: { entity: 'order', version: '1', service: 'closure-sample' },
    attributes: {
      id: { type: 'string', required: true },
      customerId: { type: 'string', required: true },
      status: { type: ['draft', 'confirmed'] as const, required: true },
      version: { type: 'number', required: true },
      lines: {
        type: 'list', required: true,
        items: {
          type: 'map',
          properties: {
            id: { type: 'string', required: true },
            productCode: { type: 'string', required: true },
            unitPriceYen: { type: 'number', required: true },
            quantity: { type: 'number', required: true },
          },
        },
      },
    },
    indexes: {
      byId: { pk: { field: 'id', composite: ['id'], template: '${id}', casing: 'none' } },
    },
  }, { client, table });
}
