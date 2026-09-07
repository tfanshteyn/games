import test from 'node:test';
import assert from 'node:assert/strict';
import { PURE } from './pure-tesseract.mjs';
const { createBall, magnusForce, stepBall, createWorld, CONFIG, V4 } = PURE;

const DT = CONFIG.sim.dt;
const spin = o => Object.assign({ xy: 0, xz: 0, xw: 0, yz: 0, yw: 0, zw: 0 }, o);

test('a spin bivector in the xz plane curves a ball moving along x sideways in z', () => {
  const f = magnusForce(spin({ xz: 1 }), V4.make(10, 0, 0, 0), 1);
  assert.equal(f.x, 0);
  assert.equal(f.y, 0);
  assert.equal(f.w, 0);
  assert.notEqual(f.z, 0, 'must push along z');
});

test('a spin bivector in the xw plane curves that same ball through W', () => {
  const f = magnusForce(spin({ xw: 1 }), V4.make(10, 0, 0, 0), 1);
  assert.equal(f.x, 0);
  assert.equal(f.z, 0);
  assert.notEqual(f.w, 0, 'this is the shot that bends around the keeper');
});

test('no spin means no Magnus force at all', () => {
  const f = magnusForce(spin({}), V4.make(10, 3, -2, 1), 1);
  assert.deepEqual(f, { x: 0, y: 0, z: 0, w: 0 });
});

test('the spin matrix is antisymmetric in all six planes, not just xz and xw', () => {
  const axisVec = axis => V4.make(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0,
                                   axis === 'z' ? 1 : 0, axis === 'w' ? 1 : 0);
  const planes = [
    ['xy', 'x', 'y'], ['xz', 'x', 'z'], ['xw', 'x', 'w'],
    ['yz', 'y', 'z'], ['yw', 'y', 'w'], ['zw', 'z', 'w'],
  ];
  for (const [plane, a, b] of planes) {
    const s = spin({ [plane]: 1 });
    const coupledFromA = magnusForce(s, axisVec(a), 1)[b];
    const coupledFromB = magnusForce(s, axisVec(b), 1)[a];
    assert.notEqual(coupledFromA, 0, `plane ${plane}: velocity along ${a} produced no force along ${b}`);
    assert.notEqual(coupledFromB, 0, `plane ${plane}: velocity along ${b} produced no force along ${a}`);
    assert.equal(coupledFromA, -coupledFromB,
      `plane ${plane}: antisymmetry violated (${a}->${b} = ${coupledFromA}, ${b}->${a} = ${coupledFromB})`);
  }
});

test('the Magnus force never does work — it is always perpendicular to velocity', () => {
  const cases = [
    { s: spin({ xy: 3, xz: -2, xw: 5, yz: 1, yw: -4, zw: 2 }), v: V4.make(2, -3, 5, -1) },
    { s: spin({ xy: -7, xz: 4, xw: -1, yz: 6, yw: 2, zw: -3 }), v: V4.make(-4, 1, 2, 6) },
  ];
  for (const { s, v } of cases) {
    const f = magnusForce(s, v, 1);
    const work = V4.dot(f, v);
    assert.ok(Math.abs(work) < 1e-12, `Magnus force did work: dot(F, v) = ${work}`);
  }
});

test('a dropped ball falls, lands and stops bouncing', () => {
  const world = createWorld();
  const b = createBall(V4.make(0, 5, 0, 0));
  for (let i = 0; i < 1200; i++) stepBall(b, world, DT);
  assert.ok(b.pos.y >= 0, 'never sinks through the pitch');
  assert.ok(b.pos.y < 0.4, 'has settled');
  assert.ok(Math.abs(b.vel.y) < 0.5, 'has stopped bouncing');
});

test('the W walls contain the ball — they are walls, not touchlines', () => {
  const world = createWorld();
  const b = createBall(V4.make(0, 0.5, 0, 2.5));
  b.vel = V4.make(0, 0, 0, 9);
  let bounced = false, prev = b.vel.w;
  for (let i = 0; i < 240; i++) {
    stepBall(b, world, DT);
    assert.ok(Math.abs(b.pos.w) <= CONFIG.pitch.halfW + 1e-6,
      `escaped the W wall at step ${i}: w = ${b.pos.w}`);
    if (Math.sign(b.vel.w) !== Math.sign(prev) && prev !== 0) bounced = true;
    prev = b.vel.w;
  }
  assert.ok(bounced, 'must rebound off the wall rather than stopping dead');
});

test('crossing the goal line inside the mouth is a goal, from any slice', () => {
  const world = createWorld();
  for (const w of [0, 2.8, -2.8]) {
    const b = createBall(V4.make(50, 1, 0, w));
    b.vel = V4.make(20, 0, 0, 0);
    let scored = null;
    for (let i = 0; i < 240 && !scored; i++) scored = stepBall(b, world, DT).goal;
    assert.equal(scored, 'home', `a shot at w=${w} must score`);
  }
});

test('a shot wide of the post is not a goal', () => {
  const world = createWorld();
  const b = createBall(V4.make(50, 1, 6, 0));
  b.vel = V4.make(20, 0, 0, 0);
  let scored = null;
  for (let i = 0; i < 240 && !scored; i++) scored = stepBall(b, world, DT).goal;
  assert.equal(scored, null);
});

test('the simulation is deterministic', () => {
  const run = () => {
    const world = createWorld();
    const b = createBall(V4.make(0, 1, 0, 0));
    b.vel = V4.make(12, 6, 3, 1);
    b.spin = spin({ xw: 40, xz: 25 });
    for (let i = 0; i < 600; i++) stepBall(b, world, DT);
    return b.pos;
  };
  assert.deepEqual(run(), run());
});
