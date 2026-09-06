import test from 'node:test';
import assert from 'node:assert/strict';
import { PURE } from './pure-tesseract.mjs';
const { createPlayer, makeInput, stepPlayer, createWorld, CONFIG, V4 } = PURE;

const DT = CONFIG.sim.dt;
const run = (p, input, world, secs) => {
  for (let i = 0; i < Math.round(secs / DT); i++) stepPlayer(p, input, world, DT);
};

test('a player accelerates to the jog cap, and to the sprint cap with sprint held', () => {
  const world = createWorld();
  const jog = createPlayer({ pos: V4.make(0, 0, 0, 0), team: 'home', role: 'ST' });
  run(jog, Object.assign(makeInput(), { mx: 1 }), world, 4);
  assert.ok(Math.abs(jog.vel.x - CONFIG.speed.jog) < 0.15, `jog capped, got ${jog.vel.x}`);

  const spr = createPlayer({ pos: V4.make(0, 0, 0, 0), team: 'home', role: 'ST' });
  run(spr, Object.assign(makeInput(), { mx: 1, sprint: true }), world, 4);
  assert.ok(Math.abs(spr.vel.x - CONFIG.speed.sprint) < 0.15, `sprint capped, got ${spr.vel.x}`);
});

test('the W-slide is capped at 2.5 m/s and sprint does not help', () => {
  const world = createWorld();
  const a = createPlayer({ pos: V4.make(0, 0, 0, 0), team: 'home', role: 'ST' });
  run(a, Object.assign(makeInput(), { mw: 1 }), world, 4);
  assert.ok(Math.abs(a.vel.w - CONFIG.speed.wSlide) < 0.1, `got ${a.vel.w}`);

  const b = createPlayer({ pos: V4.make(0, 0, 0, 0), team: 'home', role: 'ST' });
  run(b, Object.assign(makeInput(), { mw: 1, sprint: true }), world, 4);
  assert.ok(Math.abs(b.vel.w - CONFIG.speed.wSlide) < 0.1, 'W is a feint, not a getaway');
});

test('W is slower than running, so you cannot out-phase a sprint', () => {
  assert.ok(CONFIG.speed.wSlide < CONFIG.speed.jog);
  assert.ok(CONFIG.speed.wSlide * 3 < CONFIG.speed.sprint);
});

test('players are held inside the pitch volume, W walls included', () => {
  const world = createWorld();
  const p = createPlayer({ pos: V4.make(50, 0, 32, 2.6), team: 'home', role: 'ST' });
  run(p, Object.assign(makeInput(), { mx: 1, mz: 1, mw: 1 }), world, 6);
  assert.ok(p.pos.x <= world.pitch.halfX + 1e-6);
  assert.ok(p.pos.z <= world.pitch.halfZ + 1e-6);
  assert.ok(p.pos.w <= world.pitch.halfW + 1e-6);
});

test('releasing the stick brings a player to a stop', () => {
  const world = createWorld();
  const p = createPlayer({ pos: V4.make(0, 0, 0, 0), team: 'home', role: 'ST' });
  run(p, Object.assign(makeInput(), { mx: 1, sprint: true }), world, 3);
  run(p, makeInput(), world, 3);
  assert.ok(V4.len(p.vel) < 0.1, `should have stopped, |v| = ${V4.len(p.vel)}`);
});

test('a keeper is thicker through W than an outfield player', () => {
  const gk = createPlayer({ pos: V4.make(0,0,0,0), team: 'home', role: 'GK' });
  const st = createPlayer({ pos: V4.make(0,0,0,0), team: 'home', role: 'ST' });
  assert.equal(gk.isKeeper, true);
  assert.equal(gk.thickness, CONFIG.thickness.keeper);
  assert.equal(st.thickness, CONFIG.thickness.player);
});
