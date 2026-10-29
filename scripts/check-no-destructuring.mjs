import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from '@babel/parser';

// import/export の名前付き指定は許可し、宣言・引数・代入・catch等の分割代入を禁止する。
const files = readdirSync('.', { recursive: true })
  .filter((path) => !path.split(/[\\/]/).includes('node_modules') && !path.split(/[\\/]/).includes('.git'))
  .filter((path) => /\.(?:[cm]?[jt]sx?)$/.test(path));
const violations = [];
function visit(node, file) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'ObjectPattern' || node.type === 'ArrayPattern') {
    violations.push(file + ':' + node.loc.start.line);
  }
  for (const key of Object.keys(node)) {
    const child = node[key];
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
