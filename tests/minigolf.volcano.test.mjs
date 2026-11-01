import test from 'node:test';
import assert from 'node:assert/strict';
import { PURE } from './pure-minigolf.mjs';
const { CONFIG, parseHole, createBall, shoot, stepBall, simulateShot } = PURE;

const C = CONFIG.cell;
const UP = -Math.PI / 2;

test('rolling into lava ends the stroke with a lava event', () => {
  const hole = parseHole({ name: 'lava', par: 2, map: ['ggg', 'gog', 'LLL', 'ggg', 'g@g', 'ggg'] });
  const r = simulateShot(hole, hole.tee, UP, 0.3);
  assert.equal(r.event, 'lava');
});

test('a rope bridge over lava gets rails', () => {
  const hole = parseHole({ name: 'bridge', par: 2, map: ['ggg', 'gog', 'L=L', 'ggg', 'g@g', 'ggg'] });
  assert.ok(hole.segments.some(s => s.kind === 'rail'));
  assert.equal(simulateShot(hole, hole.tee, UP, 0.28).event, 'holed');
});

// Start terrace 0.75 m up; drop over lava onto a trampoline at ground level; bounce over more
// lava onto a terrace 0.25 m up with the cup.
const trampHole = () => parseHole({
  name: 'tramp', par: 3,
  map: ['ggg', 'gog', 'ggg', 'LLL', 'jjj', 'jjj', 'LLL', ...Array(6).fill('ggg'), 'g@g', 'ggg'],
  levels: ['111', '111', '111', '000', '000', '000', '000', ...Array(8).fill('333')],
});

test('a trampoline bounces a falling ball back up onto the next terrace', () => {
  const hole = trampHole();
  let landed = null;
  for (let p = 0.3; p < 0.8 && !landed; p += 0.02) {
    const ball = createBall(hole.tee);
    shoot(ball, UP, p);
    const events = [];
    for (let t = 0; t < 20; t += CONFIG.dt) {
      events.push(...stepBall(hole, ball, t, CONFIG.dt));
      if (events.some(e => ['stopped', 'lava', 'holed'].includes(e))) break;
    }
    if (events.includes('bounce') && !events.includes('lava') && ball.z < 3 * C) landed = { p, ball, holed: events.includes('holed') };
  }
  assert.ok(landed, 'some putt strength bounces onto the cup terrace');
  assert.ok(landed.holed || Math.abs(landed.ball.y - 0.25) < 1e-6, `on the 0.25 m terrace, y=${landed.ball.y}`);
});

test('the bounce keeps 90% of the falling speed', () => {
  const hole = trampHole();
  const ball = createBall({ x: 0.75, y: 0.6, z: 2.5 });
  ball.air = true; ball.vy = -2; ball.moving = true;
  let up = 0;
  for (let t = 0; t < 1; t += CONFIG.dt) {
    const ev = stepBall(hole, ball, t, CONFIG.dt);
    if (ev.includes('bounce')) { up = ball.vy; break; }
  }
  const fall = Math.sqrt(2 * 2 + 2 * CONFIG.gravity * 0.6); // speed on reaching the pad
  assert.ok(Math.abs(up - fall * CONFIG.trampoline) < 0.1, `up ${up.toFixed(2)} vs ${(fall * CONFIG.trampoline).toFixed(2)}`);
});

test('a ball rolling gently onto a trampoline just rolls', () => {
  const hole = parseHole({ name: 'flat', par: 2, map: ['ggg', 'gog', 'jjj', 'jjj', 'ggg', 'g@g', 'ggg'] });
  const r = simulateShot(hole, hole.tee, UP, 0.3);
  assert.notEqual(r.event, 'lava');
  assert.ok(Math.abs(r.ball.y) < 1e-6 || r.event === 'holed');
});
