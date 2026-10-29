import { createMiddleware } from 'hono/factory';

export type HttpEnvironment = { Variables: { requestId: string } };
export type RequestContextDependencies = Readonly<{
  newRequestId(): string;
  now(): number;
}>;

// HTTP 横断関心事のみを扱う。ID は本人確認でも UserId でもない。
// ユーザーの X-Request-ID は信用せず、サーバーで新規生成する。
export function requestContext(dependencies: RequestContextDependencies) {
  return createMiddleware<HttpEnvironment>(async (c, next) => {
    const started = dependencies.now();
    const requestId = dependencies.newRequestId();
    c.set('requestId', requestId);
    c.header('X-Request-ID', requestId);
    c.header('Cache-Control', 'no-store');
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header('Referrer-Policy', 'no-referrer');
    // パスワード・メール・body をログに出さない。観測用にはIDと時間だけを公開する。
    await next();
    c.header('Server-Timing', `app;dur=${Math.max(0, dependencies.now() - started).toFixed(1)}`);
  });
}
