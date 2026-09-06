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
  // Start at the kata wall and measure over a short window. The pitch is only 6 m deep
  // in W, so a player starting at w=0 reaches the far wall and is clamped to zero
  // velocity long before a four-second window closes — that would measure the wall,
  // not the cap.
  const start = () => V4.make(0, 0, 0, -CONFIG.pitch.halfW);
  const a = createPlayer({ pos: start(), team: 'home', role: 'ST' });
  run(a, Object.assign(makeInput(), { mw: 1 }), world, 1.5);
  assert.ok(Math.abs(a.vel.w - CONFIG.speed.wSlide) < 0.1, `got ${a.vel.w}`);
  assert.ok(a.pos.w < CONFIG.pitch.halfW - 0.1, 'must still be short of the ana wall');

  const b = createPlayer({ pos: start(), team: 'home', role: 'ST' });
  run(b, Object.assign(makeInput(), { mw: 1, sprint: true }), world, 1.5);
  assert.ok(Math.abs(b.vel.w - CONFIG.speed.wSlide) < 0.1, 'W is a feint, not a getaway');
});

test('W is slower than running, so you cannot out-phase a sprint', () => {
  assert.ok(CONFIG.speed.wSlide < CONFIG.speed.jog);
  // sprinting covers ground more than twice as fast as sliding through W
  assert.ok(CONFIG.speed.wSlide * 2 < CONFIG.speed.sprint);
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
