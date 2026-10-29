import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// シェルの glob や環境変数構文に依存せず、実装横のテストを収集する。
const integration = process.argv.includes('--integration');
const suffix = integration ? '.integration.ts' : '.test.ts';
const files = readdirSync('src', { recursive: true })
  .filter((path) => path.endsWith(suffix))
  .map((path) => join('src', path))
  .sort();
if (files.length === 0) throw new Error('対象のテストがありません');
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...files], {
  stdio: 'inherit',
  env: { ...process.env, ...(integration ? { RUN_DYNAMODB_TESTS: '1' } : {}) },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
