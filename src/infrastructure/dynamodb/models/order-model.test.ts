import { z } from "zod";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createOrderModel } from "./order-model.js";
import { documentClient, ordersTableName } from "../client.js";

// ElectroDBのparams()はSDK由来のanyを含むため、検証してから参照する。
const ParamsSchema = z.object({
  TableName: z.string().optional(),
  Item: z.unknown().optional(),
  Key: z.object({ id: z.string() }).optional(),
  ConsistentRead: z.boolean().optional(),
  ConditionExpression: z.string().optional(),
  ExpressionAttributeNames: z.record(z.string(), z.string()).optional(),
  ExpressionAttributeValues: z.record(z.string(), z.unknown()).optional(),
});

void test("保存モデルは集約ルートのキーとversion条件で全明細を1回のPutにまとめる", () => {
  const model = createOrderModel(documentClient, ordersTableName);
  const input = {
    id: "00000000-0000-4000-8000-000000000000",
    customerId: "00000000-0000-4000-8000-000000000001",
    status: "draft" as const,
    version: 1,
    lines: [
      {
        id: "00000000-0000-4000-8000-000000000002",
        productCode: "PEN",
        unitPriceYen: 150,
        quantity: 2,
      },
    ],
  };
  const params = ParamsSchema.parse(
    model
      .put(input)
      .where((attributes, operations) => operations.eq(attributes.version, 0))
      .params(),
  );
  assert.equal(params.TableName, ordersTableName);
  assert.partialDeepStrictEqual(params.Item, { id: input.id, lines: input.lines });
  assert.match(params.ConditionExpression ?? "", /=/);
  assert(Object.values(params.ExpressionAttributeNames ?? {}).includes("version"));
  assert(Object.values(params.ExpressionAttributeValues ?? {}).includes(0));
  assert.match(
    ParamsSchema.parse(model.create(input).params()).ConditionExpression ?? "",
    /attribute_not_exists/,
  );
});
