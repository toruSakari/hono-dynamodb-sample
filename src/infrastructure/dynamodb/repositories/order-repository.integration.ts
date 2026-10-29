import { z } from "zod";
import { StoredOrderLineSchema } from "../../../domain/entities/order-line.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { DeleteCommand, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { Order } from "../../../domain/entities/order.js";
import { UserIdSchema } from "../../../domain/value-objects/user-id.js";
import { ProductCodeSchema } from "../../../domain/value-objects/product-code.js";
import { QuantitySchema } from "../../../domain/value-objects/quantity.js";
import { UnitPriceYenSchema } from "../../../domain/value-objects/unit-price-yen.js";
import { ConflictError } from "../../../domain/errors/conflict-error.js";
import { documentClient, rawClient, ordersTableName } from "../client.js";
import { DynamoOrderRepository } from "./order-repository.js";

void test(
  "実DB: 集約1アイテムの原子保存・競合時の明細保護・厳格復元",
  {
    skip: process.env.RUN_DYNAMODB_TESTS !== "1",
  },
  async () => {
    const repository = DynamoOrderRepository.create({
      client: documentClient,
      tableName: ordersTableName,
    });
    assert(Object.isFrozen(DynamoOrderRepository));
    assert(Object.isFrozen(repository));
    assert.deepEqual(Object.keys(repository).sort(), ["findById", "insert", "update"]);
    const empty = Order.create(UserIdSchema.parse(randomUUID()));
    const id = empty.snapshot().id;
    try {
      assert.equal(await repository.findById(id), null);
      await repository.insert(empty);
      await assert.rejects(repository.insert(empty), ConflictError);
      const initial = await repository.findById(id);
      assert(initial);
      const added = initial.addLine(
        ProductCodeSchema.parse("PEN"),
        UnitPriceYenSchema.parse(150),
        QuantitySchema.parse(2),
      );
      await repository.update(added, 0);
      const firstReader = await repository.findById(id);
      const secondReader = await repository.findById(id);
      assert(firstReader);
      assert(secondReader);
      const line = firstReader.snapshot().lines[0];
      assert(line);
      await repository.update(firstReader.changeQuantity(line.id, QuantitySchema.parse(3)), 1);
      // 別の読み手による新規明細追加は競合。集約を一括保存するので一部だけ残らない。
      const stale = secondReader.addLine(
        ProductCodeSchema.parse("NOTEBOOK"),
        UnitPriceYenSchema.parse(300),
        QuantitySchema.parse(1),
      );
      await assert.rejects(repository.update(stale, 1), ConflictError);
      const current = await repository.findById(id);
      assert(current);
      assert.equal(current.snapshot().version, 2);
      assert.equal(current.snapshot().lines.length, 1);
      assert.equal(current.snapshot().lines[0]?.quantity, 3);
      assert.equal(current.snapshot().totalYen, 450);
      await repository.update(current.confirm(), 2);
      const confirmed = await repository.findById(id);
      assert(confirmed);
      assert.equal(confirmed.snapshot().status, "confirmed");
      assert.equal(confirmed.snapshot().totalYen, 450);

      const raw = await documentClient.send(
        new GetCommand({ TableName: ordersTableName, Key: { id } }),
      );
      const record = z
        .object({
          __edb_e__: z.literal("order"),
          __edb_v__: z.literal("1"),
          lines: z.array(StoredOrderLineSchema),
        })
        .passthrough()
        .parse(raw.Item);
      const firstLine = record.lines[0];
      assert(firstLine);
      assert.equal(record.__edb_e__, "order");
      assert.equal("totalYen" in record, false);
      assert.equal("lineTotalYen" in firstLine, false);
      assert(Buffer.byteLength(JSON.stringify(record), "utf8") < 32 * 1024);

      // DBに存在するだけでは正当な集約ではない。明細と状態の不整合を拒否する。
      for (const invalid of [
        { ...record, lines: [] },
        { ...record, lines: [firstLine, firstLine] },
        { ...record, lines: [{ ...record.lines[0], quantity: 0 }] },
        { ...record, totalYen: 1 },
        { ...record, __edb_e__: "user" },
      ]) {
        await documentClient.send(new PutCommand({ TableName: ordersTableName, Item: invalid }));
        await assert.rejects(repository.findById(id), /復元に失敗/);
      }
      await documentClient.send(new DeleteCommand({ TableName: ordersTableName, Key: { id } }));
      await assert.rejects(repository.update(added, 0), ConflictError);
    } finally {
      await documentClient.send(new DeleteCommand({ TableName: ordersTableName, Key: { id } }));
      rawClient.destroy();
    }
  },
);
