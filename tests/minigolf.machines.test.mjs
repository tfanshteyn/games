import test from 'node:test';
import assert from 'node:assert/strict';
import { PURE } from './pure-minigolf.mjs';
const { CONFIG, parseHole, createBall, shoot, stepBall, simulateShot, sliderPieces, pendulumState, loopSpeedNeeded } = PURE;

const C = CONFIG.cell;
const UP = -Math.PI / 2;

function runUntil(hole, ball, pred, maxT = 20, t0 = 0) {
  const events = [];
  for (let t = t0; t < t0 + maxT; t += CONFIG.dt) {
    events.push(...stepBall(hole, ball, t, CONFIG.dt));
    if (pred(ball, events)) break;
  }
  return events;
}

test('the ball lift carries the ball up to the raised green and releases it', () => {
  const hole = parseHole({
    name: 'lift', par: 3,
    map: ['gtg.ggggg', 'ggg.tgggg', 'ggg.ggggo', 'ggg.ggggg', 'ggg......', 'g@g......', 'ggg......'],
    levels: ['000.22222', '000.22222', '000.22222', '000.22222', '000', '000', '000'],
    extras: [{ type: 'lift', in: { c: 1, r: 0, out: 's' }, out: { c: 4, r: 1, out: 'e' } }],
  });
  const ball = createBall(hole.tee);
  shoot(ball, UP, 0.4);
  let peak = 0;
  const ev = runUntil(hole, ball, (b, e) => { peak = Math.max(peak, b.y); return e.includes('stopped'); });
  assert.ok(ev.includes('lift') && ev.includes('arrive'));
  assert.ok(peak > 0.9, `rode up the tower, peak ${peak.toFixed(2)}`);
  assert.ok(Math.abs(ball.y - 0.5) < 1e-6 && ball.x > 2.3, `on the upper green, y=${ball.y} x=${ball.x}`);
});

const loopHole = () => parseHole({
  name: 'loop', par: 3,
  map: ['ggggg', 'ggggo', 'ggggg', '.ggg.', '..g..', '..g..', '..g..', '.ggg.', ...Array(6).fill('ggggg'), 'gg@gg', 'ggggg'],
  extras: [{ type: 'loop', c: 2, r: 6, dir: 'n', radius: 0.25 }],
});

test('a firm putt goes all the way round the loop and carries on', () => {
  const hole = loopHole();
  const ball = createBall(hole.tee);
  shoot(ball, UP, 1);
  let top = 0;
  const ev = runUntil(hole, ball, (b, e) => { top = Math.max(top, b.y); return e.includes('arrive'); });
  assert.ok(ev.includes('loop'));
  assert.ok(top > 0.45, `went over the top, ${top.toFixed(2)}`);
  assert.ok(ball.vz < 0 && ball.z < 4 * C, 'came out the far side heading on');
});

test('a soft putt climbs part way up the loop and rolls back', () => {
  const hole = loopHole();
  const ball = createBall(hole.tee);
  shoot(ball, UP, 0.45);
  runUntil(hole, ball, (b, e) => e.includes('arrive'));
  assert.ok(ball.vz > 0, 'heading back towards the tee');
  assert.ok(ball.z > 6 * C);
});

test('the loop needs about 3 m/s for a 25 cm radius', () => {
  const v = loopSpeedNeeded(0.25);
  assert.ok(v > 2.9 && v < 3.3, `${v}`);
});

test('a sliding gate leaves one moving opening', () => {
  const s = { x: 0.75, z: 2, axis: 'z', halfWidth: 0.75, gap: 0.42, period: 3, phase: 0 };
  for (const t of [0, 0.4, 1.1, 2.2]) {
    const [a, b] = sliderPieces(s, t);
    const open = b.v0 - a.v1;
    assert.ok(Math.abs(open - 0.42) < 1e-9);
    assert.ok(a.v0 === -0.75 && b.v1 === 0.75);
  }
  assert.notEqual(sliderPieces(s, 0)[0].v1, sliderPieces(s, 0.7)[0].v1, 'the opening moves');
});

test('a sliding gate stops a ball that misses the opening', () => {
  const hole = parseHole({ name: 's', par: 2, map: ['ggg', 'gog', ...Array(12).fill('ggg'), 'g@g', 'ggg'],
    extras: [{ type: 'slider', c: 1.5, r: 8, axis: 'z', halfWidth: 0.75, gap: 0.42, period: 3 }] });
  // at t=0 the opening is centred; at t=0.75 it is at the far right, so a centre putt hits the barrier
  const blocked = createBall(hole.tee);
  shoot(blocked, UP, 0.3);
  const t0 = 0.75 - (hole.tee.z - 4) / 1.6; // roughly when it reaches the gate
  runUntil(hole, blocked, (b, e) => e.includes('stopped'), 20, t0);
  assert.ok(blocked.z > 4, `bounced off the gate, z=${blocked.z.toFixed(2)}`);
});

test('a pendulum only reaches the ground near the bottom of its swing', () => {
  const p = { x: 0.75, z: 2, axis: 'z', halfWidth: 0.75, length: 0.8, amp: 0.95, period: 2.6, phase: 0, bobR: 0.11 };
  assert.ok(pendulumState(p, 0).lift < 1e-9, 'bottom of the swing at t=0');
  assert.ok(pendulumState(p, 2.6 / 4).lift > 0.3, 'high at the end of the swing');
});

test('a pinball post kicks the ball back faster than a wall would', () => {
  const hole = parseHole({ name: 'p', par: 2, map: ['ggg', 'gog', ...Array(10).fill('ggg'), 'g@g', 'ggg'],
    extras: [{ type: 'post', c: 1.5, r: 6, rad: 0.06 }] });
  const ball = createBall({ x: 0.75, y: 0, z: 3.5 });
  ball.vz = -1; ball.moving = true;
  const ev = runUntil(hole, ball, (b, e) => e.includes('post'));
  assert.ok(ev.includes('post'));
  assert.ok(ball.vz > 0.7 * 0.98 + 0.3, `kicked back at ${ball.vz.toFixed(2)} m/s`);
});

test('a ball never comes to rest under a moving gate', () => {
  const hole = parseHole({ name: 's', par: 2, map: ['ggg', 'gog', ...Array(12).fill('ggg'), 'g@g', 'ggg'],
    extras: [{ type: 'slider', c: 1.5, r: 8, axis: 'z', halfWidth: 0.75, gap: 0.42, period: 3 }] });
  // a putt timed through the opening that dies right at the gate line
  for (let p = 0.2; p < 0.4; p += 0.004) {
    const r = simulateShot(hole, hole.tee, UP, p);
    assert.ok(Math.abs(r.ball.z - 4) >= CONFIG.ballR * 1.6 - 1e-9, `rested on the gate line at power ${p.toFixed(3)}`);
  }
});
