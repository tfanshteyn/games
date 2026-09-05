import test from 'node:test';
import assert from 'node:assert/strict';
import { PURE } from './pure.mjs';
const { mulberry32, V, yawDir } = PURE;

test('mulberry32 is deterministic and in [0,1)', () => {
  const a = mulberry32(42), b = mulberry32(42);
  const seqA = [a(), a(), a()], seqB = [b(), b(), b()];
  assert.deepEqual(seqA, seqB);
  for (const v of seqA) assert.ok(v >= 0 && v < 1);
  assert.notDeepEqual(seqA, [mulberry32(43)(), mulberry32(43)(), mulberry32(43)()]);
});

test('V basic ops', () => {
  const a = { x: 1, y: 2, z: 3 }, b = { x: 4, y: 5, z: 6 };
  assert.deepEqual(V.add(a, b), { x: 5, y: 7, z: 9 });
  assert.deepEqual(V.sub(b, a), { x: 3, y: 3, z: 3 });
  assert.deepEqual(V.scale(a, 2), { x: 2, y: 4, z: 6 });
  assert.equal(V.dot(a, b), 32);
  assert.deepEqual(V.cross({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }), { x: 0, y: 0, z: 1 });
  assert.equal(V.len({ x: 3, y: 4, z: 0 }), 5);
  assert.equal(V.dist(a, { x: 1, y: 2, z: 8 }), 5);
  const n = V.norm({ x: 0, y: 0, z: -7 });
  assert.deepEqual(n, { x: 0, y: 0, z: -1 });
  assert.deepEqual(V.norm({ x: 0, y: 0, z: 0 }), { x: 0, y: 0, z: 0 });
  assert.deepEqual(V.lerp(a, b, 0.5), { x: 2.5, y: 3.5, z: 4.5 });
  assert.deepEqual(V.horiz(a), { x: 1, y: 0, z: 3 });
  const c = V.clone(a); c.x = 9; assert.equal(a.x, 1);
  const s = { x: 0, y: 0, z: 0 }; V.set(s, b); assert.deepEqual(s, b);
});

test('yawDir: yaw 0 faces -Z, yaw +90deg faces -X', () => {
  const d0 = yawDir(0);
  assert.ok(Math.abs(d0.x) < 1e-9 && Math.abs(d0.z + 1) < 1e-9);
  const d90 = yawDir(Math.PI / 2);
  assert.ok(Math.abs(d90.x + 1) < 1e-9 && Math.abs(d90.z) < 1e-9);
});
