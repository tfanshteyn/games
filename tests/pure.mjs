import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../SpiderMan/index.html', import.meta.url), 'utf8');
const begin = html.indexOf('// ==== PURE BEGIN ====');
const end = html.indexOf('// ==== PURE END ====');
if (begin < 0 || end < 0) throw new Error('PURE markers not found in SpiderMan/index.html');
export const PURE_SRC = html.slice(begin, end);

// Evaluate code in the host realm (so objects share the host prototypes and assert/strict
// deep-equality works) but inside a function whose parameters shadow the names the pure block
// must never touch. Any use of them throws a TypeError. Declarations stay function-scoped.
const FORBIDDEN = ['THREE', 'window', 'document', 'performance'];
export function evalPure(code) {
  const wrapped = `(function (${FORBIDDEN.join(', ')}) {\n${code}\n})`;
  return vm.runInThisContext(wrapped, { filename: 'SpiderMan/pure.js' })();
}
export const PURE = evalPure(PURE_SRC + '\n;return PURE;');
