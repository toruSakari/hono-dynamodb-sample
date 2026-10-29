import { z } from "zod";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { ConflictError } from "../../../domain/errors/conflict-error.js";

// 保存方式やモデル型は各Repositoryに残し、共通の競合処理だけをまとめる。
export const ConditionalWrite = Object.freeze({
  requireNextVersion(version: number, expectedVersion?: number): void {
    if (expectedVersion === undefined ? version !== 0 : version !== expectedVersion + 1) {
      throw new ConflictError("不正なバージョン遷移です");
    }
  },
  // originalErr: trueで取得したAWS例外だけを変換する。他の障害を競合に隠さない。
  // 再試行は行わず、古い読み取りに基づく業務判断を呼び出し側へ返す。
  rethrow(error: unknown, message: string): never {
    if (error instanceof ConditionalCheckFailedException) {
      throw new ConflictError(message);
    }
    throw error;
  },
});

// SDK/ElectroDBの応答はunknownとして検証する。Itemの業務検証は各集約が担当する。
export const RawGetResultSchema = z.object({
  data: z.object({ Item: z.unknown().optional() }),
});
