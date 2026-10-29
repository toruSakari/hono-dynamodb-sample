import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from '@babel/parser';

// import/export の名前付き指定は許可し、宣言・引数・代入・catch等の分割代入を禁止する。
const files = readdirSync('.', { recursive: true, encoding: 'utf8' })
  .filter((path) => !path.split(/[\\/]/).includes('node_modules') && !path.split(/[\\/]/).includes('.git'))
  .filter((path) => /\.(?:[cm]?[jt]sx?)$/.test(path));
const javascriptFiles = files.filter((path) => /\.[cm]?jsx?$/.test(path));
if (javascriptFiles.length > 0) {
  throw new Error('管理対象のJavaScriptは禁止です: ' + javascriptFiles.join(', '));
}
const violations: string[] = [];
function visit(node: unknown, file: string): void {
  if (!node || typeof node !== 'object') return;
  const value = node as Record<string, unknown>;
  if (value.type === 'ObjectPattern' || value.type === 'ArrayPattern') {
    const location = value.loc as { start?: { line?: number } } | null | undefined;
    violations.push(file + ':' + (location?.start?.line ?? '?'));
  }
  for (const key of Object.keys(value)) {
    const child = value[key];
    if (Array.isArray(child)) {
      for (const entry of child) visit(entry, file);
    } else if (child && typeof child === 'object') {
      visit(child, file);
    }
  }
}
for (const file of files) {
  const source = readFileSync(join('.', file), 'utf8');
  visit(parse(source, { sourceType: 'unambiguous', plugins: ['typescript'] }), file);
}
if (violations.length > 0) {
  console.error('分割代入は禁止です:\n' + violations.join('\n'));
  process.exit(1);
}
console.log('分割代入なし: ' + files.length + ' ファイルをAST検査しました');
