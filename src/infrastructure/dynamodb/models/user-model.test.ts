import { z } from "zod";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createUserModel } from "./user-model.js";
import { documentClient, tableName } from "../client.js";

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

void test("ElectroDB は既存 id キーと重複防止・楽観ロック条件を生成する", () => {
  const model = createUserModel(documentClient, tableName);
  const item = {
    id: "00000000-0000-4000-8000-000000000000",
    name: "例",
    passwordHash: "params-only-placeholder",
    status: "active" as const,
    version: 0,
  };
  const get = ParamsSchema.parse(model.get({ id: item.id }).params({ consistent: true }));
  assert.deepEqual(get.Key, { id: item.id });
  assert.equal(get.ConsistentRead, true);
  const create = ParamsSchema.parse(model.create(item).params());
  assert.match(create.ConditionExpression ?? "", /attribute_not_exists/);
  const put = ParamsSchema.parse(
    model
      .put({ ...item, version: 1 })
      .where((attributes, operations) => operations.eq(attributes.version, 0))
      .params(),
  );
  assert.match(put.ConditionExpression ?? "", /=/);
  assert(Object.values(put.ExpressionAttributeNames ?? {}).includes("version"));
  assert(Object.values(put.ExpressionAttributeValues ?? {}).includes(0));
});
