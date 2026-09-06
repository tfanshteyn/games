import test from 'node:test';
import assert from 'node:assert/strict';
import { PURE } from './pure-tesseract.mjs';
const { CONFIG, V4, chord, mulberry32 } = PURE;

test('CONFIG carries the spec dimensions', () => {
  assert.equal(CONFIG.pitch.halfX, 52.5);
  assert.equal(CONFIG.pitch.halfZ, 34);
  assert.equal(CONFIG.pitch.halfW, 3);
  assert.equal(CONFIG.goal.halfZ, 3.66);
  assert.equal(CONFIG.goal.height, 2.44);
  assert.equal(CONFIG.thickness.player, 1.2);
  assert.equal(CONFIG.thickness.keeper, 2.2);
  assert.equal(CONFIG.thickness.ball, 0.3);
  assert.equal(CONFIG.speed.sprint, 7.5);
  assert.equal(CONFIG.speed.jog, 5.2);
  assert.equal(CONFIG.speed.wSlide, 2.5);
  assert.equal(CONFIG.match.halfSeconds, 240);
  assert.equal(CONFIG.sim.dt, 1 / 120);
});

test('V4 basic ops', () => {
  const a = V4.make(1, 2, 3, 4), b = V4.make(5, 6, 7, 8);
  assert.deepEqual(V4.add(a, b), { x: 6, y: 8, z: 10, w: 12 });
  assert.deepEqual(V4.sub(b, a), { x: 4, y: 4, z: 4, w: 4 });
  assert.deepEqual(V4.scale(a, 2), { x: 2, y: 4, z: 6, w: 8 });
  assert.equal(V4.dot(a, b), 5 + 12 + 21 + 32);
  assert.equal(V4.len(V4.make(1, 2, 2, 4)), 5);
  assert.equal(V4.dist(a, V4.make(1, 2, 3, 9)), 5);
  assert.deepEqual(V4.norm(V4.make(0, 0, 0, -7)), { x: 0, y: 0, z: 0, w: -1 });
  assert.deepEqual(V4.norm(V4.make(0, 0, 0, 0)), { x: 0, y: 0, z: 0, w: 0 });
  assert.deepEqual(V4.lerp(a, b, 0.5), { x: 3, y: 4, z: 5, w: 6 });
  assert.deepEqual(V4.ground(a), { x: 1, y: 0, z: 3, w: 4 });
  const c = V4.clone(a); c.x = 99; assert.equal(a.x, 1);
  const s = V4.make(); V4.set(s, b); assert.deepEqual(s, { x: 5, y: 6, z: 7, w: 8 });
});

test('chord is 1 in your slice and 0 past the thickness', () => {
  assert.equal(chord(0, 1.2), 1);
  assert.equal(chord(1.2, 1.2), 0);
  assert.equal(chord(-1.2, 1.2), 0);
  assert.equal(chord(99, 1.2), 0);
  // half the thickness leaves sqrt(3)/2 of the body in your slice
  assert.ok(Math.abs(chord(0.6, 1.2) - Math.sqrt(3) / 2) < 1e-12);
  assert.equal(chord(-0.6, 1.2), chord(0.6, 1.2));
});

test('mulberry32 is deterministic and in [0,1)', () => {
  const a = mulberry32(7), b = mulberry32(7);
  const seqA = [a(), a(), a()], seqB = [b(), b(), b()];
  assert.deepEqual(seqA, seqB);
  for (const v of seqA) assert.ok(v >= 0 && v < 1);
});
