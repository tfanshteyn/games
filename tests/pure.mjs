import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../SpiderMan/index.html', import.meta.url), 'utf8');
const begin = html.indexOf('// ==== PURE BEGIN ====');
const end = html.indexOf('// ==== PURE END ====');
if (begin < 0 || end < 0) throw new Error('PURE markers not found in SpiderMan/index.html');
const src = html.slice(begin, end) + '\n;PURE';
export const PURE = vm.runInThisContext(src, { filename: 'SpiderMan/pure.js' });
