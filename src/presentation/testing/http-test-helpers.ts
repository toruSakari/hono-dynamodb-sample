import { z } from "zod";

const ObjectSchema = z.record(z.string(), z.unknown());

// Response.json() の戻り値を unknown に閉じ込め、テストでも境界検証を省略しない。
export async function readJson(response: Response): Promise<unknown> {
  const value: unknown = await response.json();
  return value;
}
export function readObject(value: unknown): Record<string, unknown> {
  return ObjectSchema.parse(value);
}
// OpenAPI の各階層を object と確認して進む。未検証のプロパティ参照や any を使わない。
export function readPath(value: unknown, ...keys: readonly string[]): unknown {
  let current: unknown = value;
  for (const key of keys) {
    current = readObject(current)[key];
  }
  return current;
}
