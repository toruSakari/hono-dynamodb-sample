import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { documentClient, tableName } from './infrastructure/dynamodb.js';
import { passwordHasher } from './infrastructure/password-hasher.js';
import { createUserRepository } from './infrastructure/user-repository.js';

const app = createApp(createUserRepository(documentClient, tableName), passwordHasher);
serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 3000 });
console.log('学習用 API: http://127.0.0.1:3000（外部公開禁止）');
