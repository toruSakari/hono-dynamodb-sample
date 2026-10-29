import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  DomainRuleError,
  InvalidCurrentPasswordError,
} from "../../domain/errors/domain-rule-error.js";
import { ConflictError } from "../../domain/errors/conflict-error.js";
import type { HttpEnvironment } from "./request-context.js";

// エラーの意味だけをHTTPへ変換し、スタック・DBレコード・パスワードは返さない。
export const errorHandler: ErrorHandler<HttpEnvironment> = (error, c) => {
  if (error instanceof InvalidCurrentPasswordError) {
    return c.json({ error: "現在のパスワードが一致しません" }, 403);
  }
  if (error instanceof DomainRuleError) {
    return c.json({ error: "現在の状態では操作できません" }, 409);
  }
  if (error instanceof ConflictError) {
    return c.json({ error: "更新が競合しました" }, 409);
  }
  if (error instanceof HTTPException && error.status === 400) {
    return c.json({ error: "JSONまたは入力が不正です" }, 400);
  }
  if (error instanceof HTTPException && error.status === 415) {
    return c.json({ error: "Content-Typeはapplication/jsonを指定してください" }, 415);
  }
  return c.json({ error: "内部エラーです" }, 500);
};
