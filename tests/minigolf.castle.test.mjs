import test from 'node:test';
import assert from 'node:assert/strict';
import { PURE } from './pure-minigolf.mjs';
const { CONFIG, parseHole, createBall, shoot, stepBall, simulateShot, portcullisLift, portcullisBlocked, drawbridgeRaise } = PURE;

const C = CONFIG.cell;
const UP = -Math.PI / 2;

function play(hole, power, t0 = 0) {
  const ball = createBall(hole.tee);
  shoot(ball, UP, power);
  const events = [];
  for (let t = t0; t < t0 + 20; t += CONFIG.dt) {
    events.push(...stepBall(hole, ball, t, CONFIG.dt));
    if (events.some(e => ['stopped', 'water', 'holed'].includes(e))) break;
  }
  return { ball, events };
}

const moat = () => parseHole({
  name: 'moat', par: 3,
  map: ['ggg', 'gog', 'ggg', 'DDD', 'DDD', ...Array(5).fill('ggg'), 'g@g', 'ggg'],
  extras: [{ type: 'drawbridge', hinge: 'n', period: 5 }],
});

test('a drawbridge is down for nearly half its cycle and up for a third', () => {
  const db = { period: 5, phase: 0 };
  let down = 0, up = 0;
  for (let i = 0; i < 500; i++) { const r = drawbridgeRaise(db, (i / 500) * 5); if (r === 0) down++; if (r === 1) up++; }
  assert.ok(down > 200 && down < 240 && up > 160 && up < 190, `down ${down} up ${up}`);
});

test('putting while the drawbridge is down crosses the moat', () => {
  const r = play(moat(), 0.5, 0); // crosses well before it starts to lift at 2.25 s
  assert.ok(!r.events.includes('water'), r.events.join());
  assert.ok(r.ball.z < 3 * C || r.events.includes('holed'));
});

test('arriving while the drawbridge is up drops the ball in the moat', () => {
  const r = play(moat(), 0.4, 2.75); // reaches the moat mid-cycle, bridge raised
  assert.ok(r.events.includes('water'), r.events.join());
});

test('a ball never comes to rest on the drawbridge', () => {
  const hole = moat();
  for (let p = 0.2; p < 0.4; p += 0.005) {
    const r = simulateShot(hole, hole.tee, UP, p);
    if (r.event !== 'stopped') continue;
    const z = r.ball.z;
    assert.ok(z < 3 * C || z > 5 * C, `rested on the bridge at z=${z.toFixed(3)} (power ${p.toFixed(3)})`);
  }
});

const gate = () => parseHole({
  name: 'gate', par: 3,
  map: ['ggg', 'gog', ...Array(10).fill('ggg'), 'g@g', 'ggg'],
  extras: [{ type: 'portcullis', c: 1.5, r: 7, axis: 'z', halfWidth: 0.75, period: 4 }],
});

test('the portcullis blocks the passage about half the time', () => {
  const p = { period: 4, phase: 0 };
  let blocked = 0;
  for (let i = 0; i < 400; i++) if (portcullisBlocked(p, (i / 400) * 4)) blocked++;
  assert.ok(blocked > 160 && blocked < 230, `${blocked}/400`);
  assert.equal(portcullisLift(p, 0.1 * 4), 0);
  assert.equal(portcullisLift(p, 0.7 * 4), 1);
});

test('a ball meeting the lowered portcullis bounces back; through the raised one it goes on', () => {
  // the ball takes about 1.8 s to reach the gate
  const blocked = play(gate(), 0.35, 2.4); // arrives at 4.2 s: gate down
  assert.ok(blocked.ball.z > 3.5, `stopped by the gate, z=${blocked.ball.z.toFixed(2)}`);
  const open = play(gate(), 0.35, 0.4); // arrives at 2.2 s: gate up
  assert.ok(open.ball.z < 3.5 || open.events.includes('holed'), `went through, z=${open.ball.z.toFixed(2)}`);
});

test('the gatehouse walls either side of the passage are solid', () => {
  const hole = gate();
  const r = simulateShot(hole, { x: 0.25, y: 0, z: 5.5 }, UP, 0.3);
  assert.ok(r.ball.z > 3.8, `stopped by the wall, z=${r.ball.z.toFixed(2)}`);
});
