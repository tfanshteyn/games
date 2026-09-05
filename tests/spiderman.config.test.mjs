import test from 'node:test';
import assert from 'node:assert/strict';
import { PURE, evalPure } from './pure.mjs';

test('pure block exports CONFIG with city and hero constants', () => {
  const { CONFIG } = PURE;
  assert.equal(CONFIG.citySeed, 20260904);
  assert.equal(CONFIG.gridN, 12);
  assert.equal(CONFIG.blockSize, 40);
  assert.equal(CONFIG.streetW, 10);
  assert.equal(CONFIG.gravity, 22);
  assert.equal(CONFIG.heroRadius, 0.5);
  assert.equal(CONFIG.heroHeight, 1.8);
});

test('harness forbids THREE, window, document and performance inside the pure block', () => {
  for (const name of ['THREE', 'window', 'document', 'performance']) {
    assert.throws(() => evalPure(`return ${name}.now;`), TypeError, name);
  }
  assert.equal(evalPure('return 1 + 1;'), 2);
});
