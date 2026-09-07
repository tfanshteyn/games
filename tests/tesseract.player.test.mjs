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

test('a player pinned against a wall can move away from it on the next frame', () => {
  // Held only by inspection until now. A player stuck on the ana wall — the one axis
  // with no real-world intuition to fall back on — would be a Critical gameplay defect,
  // and clampAxis zeroing velocity into the wall is exactly the kind of code that
  // becomes a trap if someone later zeroes the whole velocity vector instead.
  const world = createWorld();
  const walls = [
    { axis: 'x', key: 'mx', half: world.pitch.halfX },
    { axis: 'z', key: 'mz', half: world.pitch.halfZ },
    { axis: 'w', key: 'mw', half: world.pitch.halfW },   // the ana/kata walls
  ];
  for (const wall of walls) {
    for (const sign of [1, -1]) {
      const p = createPlayer({ pos: V4.make(0, 0, 0, 0), team: 'home', role: 'ST' });
      const into = Object.assign(makeInput(), { [wall.key]: sign });
      run(p, into, world, 20);
      assert.ok(Math.abs(p.pos[wall.axis] - sign * wall.half) < 1e-6,
        `should be pinned on ${wall.axis}=${sign * wall.half}, got ${p.pos[wall.axis]}`);
      assert.equal(p.vel[wall.axis], 0, `velocity into the ${wall.axis} wall must be killed`);

      // one single frame of reversed input has to break the pin
      const pinned = p.pos[wall.axis];
      const away = Object.assign(makeInput(), { [wall.key]: -sign });
      stepPlayer(p, away, world, DT);
      assert.ok(Math.abs(p.pos[wall.axis]) < Math.abs(pinned),
        `stuck on the ${wall.axis} wall at ${sign * wall.half}`);

      // and a second of it takes them clearly off the wall, not a numerical twitch
      run(p, away, world, 1);
      assert.ok(Math.abs(pinned - p.pos[wall.axis]) > 0.5,
        `barely left the ${wall.axis} wall: moved ${Math.abs(pinned - p.pos[wall.axis])} m`);
      assert.equal(Math.sign(p.pos[wall.axis] - pinned), -sign, 'and moved inward');
    }
  }
});
