import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../TesseractFC/index.html', import.meta.url), 'utf8');
const begin = html.indexOf('// ==== PURE BEGIN ====');
const end = html.indexOf('// ==== PURE END ====');
if (begin < 0 || end < 0) throw new Error('PURE markers not found in TesseractFC/index.html');
export const PURE_SRC = html.slice(begin, end);

// Evaluate in the host realm so deep-equality against plain objects works, but inside a
// function whose parameters shadow the names the pure block must never touch.
const FORBIDDEN = ['THREE', 'window', 'document', 'performance'];
export function evalPure(code) {
  const wrapped = `(function (${FORBIDDEN.join(', ')}) {\n${code}\n})`;
  return vm.runInThisContext(wrapped, { filename: 'TesseractFC/pure.js' })();
}
export const PURE = evalPure(PURE_SRC + '\n;return PURE;');
