import { Hono } from 'hono';
import { createUserService } from './application/user-service.js';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { type PasswordHasher } from './domain/user.js';
import { ConflictError, type UserRepository } from './domain/user-repository.js';
import { NewPasswordSchema, UserIdSchema, UserNameSchema } from './domain/value-objects.js';

function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) throw new HTTPException(400, { message: '入力が不正です' });
  return result.data;
}

const CreateBody = z.strictObject({ name: UserNameSchema, password: NewPasswordSchema });
const RenameBody = z.strictObject({ name: UserNameSchema });

async function readJson(request: { json(): Promise<unknown> }): Promise<unknown> {
  try { return await request.json(); }
  catch { throw new HTTPException(400, { message: 'JSON が不正です' }); }
}

// 学習用 API。認証・認可は未実装なので公開サーバーで起動してはいけない。
export function createApp(repository: UserRepository, hasher: PasswordHasher) {
  const app = new Hono();
  const service = createUserService(repository, hasher);
  app.use('*', bodyLimit({ maxSize: 4096 }));
  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.post('/users', async (c) => {
    const input = parseInput(CreateBody, await readJson(c.req));
    const user = await service.register(input.name, input.password);
    return c.json(user, 201);
  });
  app.get('/users/:id', async (c) => {
    const user = await service.find(parseInput(UserIdSchema, c.req.param('id')));
    return user ? c.json(user) : c.json({ error: '見つかりません' }, 404);
  });
  app.patch('/users/:id/name', async (c) => {
    const id = parseInput(UserIdSchema, c.req.param('id'));
    const input = parseInput(RenameBody, await readJson(c.req));
    const user = await service.rename(id, input.name);
    return user ? c.json(user) : c.json({ error: '見つかりません' }, 404);
  });
  app.onError((error, c) => {
    // 入力検証だけを400に変換し、集約・DB・ハッシュ処理の失敗は500にする。
    if (error instanceof ConflictError) return c.json({ error: '更新が競合しました' }, 409);
    if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
    // パスワード・DB レコード・スタックをレスポンスやログに出さない。
    return c.json({ error: '内部エラーです' }, 500);
  });
  return app;
}
