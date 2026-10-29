import assert from "node:assert/strict";
import { test } from "node:test";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { ConflictError } from "../../../domain/errors/conflict-error.js";
import { ConditionalWrite, RawGetResultSchema } from "./repository-support.js";

void test("保存versionは新規0または読込version+1だけ許可する", () => {
  assert.doesNotThrow(() => ConditionalWrite.requireNextVersion(0));
  assert.doesNotThrow(() => ConditionalWrite.requireNextVersion(1, 0));
  assert.doesNotThrow(() => ConditionalWrite.requireNextVersion(8, 7));
  assert.throws(() => ConditionalWrite.requireNextVersion(1), ConflictError);
  assert.throws(() => ConditionalWrite.requireNextVersion(7, 7), ConflictError);
  assert.throws(() => ConditionalWrite.requireNextVersion(9, 7), ConflictError);
});

void test("AWS条件不一致だけを集約固有メッセージの競合に変換する", () => {
  const original = new ConditionalCheckFailedException({ message: "dummy", $metadata: {} });
  assert.throws(
    () => ConditionalWrite.rethrow(original, "注文の更新が競合しました"),
    (error: unknown) =>
      error instanceof ConflictError && error.message === "注文の更新が競合しました",
  );
  const unavailable = new Error("接続失敗");
  assert.throws(
    () => ConditionalWrite.rethrow(unavailable, "競合しました"),
    (error: unknown) => error === unavailable,
  );
  const lookalike = { name: "ConditionalCheckFailedException" };
  assert.throws(
    () => ConditionalWrite.rethrow(lookalike, "競合しました"),
    (error: unknown) => error === lookalike,
  );
});

void test("raw get応答は未存在を許し、Itemの未知フィールドを集約の復元まで保つ", () => {
  assert.equal(RawGetResultSchema.parse({ data: {} }).data.Item, undefined);
  const item = { id: "dummy", unexpected: "must-not-disappear" };
  assert.deepEqual(RawGetResultSchema.parse({ data: { Item: item } }).data.Item, item);
  assert.equal(RawGetResultSchema.safeParse({}).success, false);
  assert.equal(RawGetResultSchema.safeParse({ data: null }).success, false);
});
