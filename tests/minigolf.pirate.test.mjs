import test from 'node:test';
import assert from 'node:assert/strict';
import { PURE } from './pure-minigolf.mjs';
const { CONFIG, parseHole, createBall, shoot, stepBall, simulateShot, groundHeight } = PURE;

const C = CONFIG.cell;
const UP = -Math.PI / 2;

function runUntil(hole, ball, pred, maxT = 20) {
  const events = [];
  for (let t = 0; t < maxT; t += CONFIG.dt) {
    events.push(...stepBall(hole, ball, t, CONFIG.dt));
    if (pred(ball, events)) break;
  }
  return events;
}

test('sand stops a ball far sooner than carpet', () => {
  const carpet = parseHole({ name: 'c', par: 2, map: ['o', ...Array(30).fill('g'), '@'] });
  const sand = parseHole({ name: 's', par: 2, map: ['o', ...Array(28).fill('s'), 'g', '@'] });
  const a = simulateShot(carpet, carpet.tee, UP, 0.4), b = simulateShot(sand, sand.tee, UP, 0.4);
  const da = carpet.tee.z - a.ball.z, db = sand.tee.z - b.ball.z;
  assert.ok(db < da / 2, `sand ${db.toFixed(2)} m vs carpet ${da.toFixed(2)} m`);
});

const plankHole = () => parseHole({
  name: 'plank', par: 3,
  map: ['ggggg', 'ggogg', 'ggggg', 'wwpww', 'wwpww', 'wwpww', '.ddd.', '.d@d.', '.ddd.'],
  levels: ['00000', '00000', '00000', '00200', '00200', '00200', '02220', '02220', '02220'],
});

test('a straight putt along the plank drops off its end onto the beach', () => {
  const hole = plankHole();
  const r = simulateShot(hole, hole.tee, UP, 0.42);
  assert.ok(r.event === 'stopped' || r.event === 'holed', r.event);
  assert.ok(r.ball.z < 3 * C && (r.event === 'holed' || Math.abs(r.ball.y) < 1e-6), `on the beach, z=${r.ball.z.toFixed(2)}`);
});

test('a putt that wanders off the side of the plank ends in the sea', () => {
  const hole = plankHole();
  const r = simulateShot(hole, hole.tee, UP + 0.12, 0.42);
  assert.equal(r.event, 'water');
});

test('the plank is narrow: only the middle strip holds the ball up', () => {
  const hole = plankHole();
  const z = 4.5 * C;
  assert.equal(groundHeight(hole, 1.25, z), 0.5);
  assert.ok(groundHeight(hole, 1.25 + CONFIG.plankWidth / 2 + 0.01, z) < 0);
});

test('the cannon fires the ball in an arc to its landing spot', () => {
  const hole = parseHole({
    name: 'cannon', par: 3,
    map: ['wwwwwww', 'wgggggw', 'wggoggw', 'wgggggw', 'wwwwwww', 'wwwwwww', '..gtg..', '..ggg..', '..g@g..', '..ggg..'],
    extras: [{ type: 'cannon', in: { c: 3, r: 6, out: 's' }, target: { c: 2, r: 3 }, apex: 1 }],
  });
  const ball = createBall(hole.tee);
  shoot(ball, UP, 0.3);
  let peak = 0;
  const ev = runUntil(hole, ball, (b, e) => { peak = Math.max(peak, b.y); return e.includes('stopped') || e.includes('water') || e.includes('holed'); });
  assert.ok(ev.includes('cannon') && ev.includes('arrive'));
  assert.ok(peak > 1, `flew high, peak ${peak.toFixed(2)}`);
  assert.ok(!ev.includes('water'), 'landed on the island, not in the lagoon');
  assert.ok(ball.z < 4 * C, `on the island, z=${ball.z.toFixed(2)}`);
});
