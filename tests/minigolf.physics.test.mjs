import test from 'node:test';
import assert from 'node:assert/strict';
import { PURE } from './pure-minigolf.mjs';
const { CONFIG, parseHole, groundHeight, gradient, createBall, shoot, stepBall, simulateShot, windmillBlocked, cappedScore } = PURE;

const C = CONFIG.cell;
const UP = -Math.PI / 2; // towards row 0 (−z)
const lane = (rows, extra = {}) => parseHole({
  name: 'test', par: 2,
  map: ['ggg', 'gog', ...Array(rows).fill('ggg'), 'g@g', 'ggg'],
  ...extra,
});

function runUntil(hole, ball, pred, maxT = 20) {
  const events = [];
  for (let t = 0; t < maxT; t += CONFIG.dt) {
    events.push(...stepBall(hole, ball, t, CONFIG.dt));
    if (pred(ball, events)) break;
  }
  return events;
}

test('a hole needs exactly one tee and one cup', () => {
  assert.throws(() => parseHole({ name: 'x', par: 2, map: ['ggg'] }), /tee/);
  assert.throws(() => parseHole({ name: 'x', par: 2, map: ['@go', 'o..'] }), /two cups/);
});

test('borders surround the course and stop the ball', () => {
  const hole = lane(4);
  assert.ok(hole.segments.some(s => s.kind === 'border'));
  // fire straight at the left border
  const r = simulateShot(hole, hole.tee, Math.PI, 0.5);
  assert.equal(r.event, 'stopped');
  assert.ok(r.ball.x >= CONFIG.ballR - 1e-6, `stayed inside, x=${r.ball.x}`);
});

test('a ball on flat carpet slows at the rolling rate and travels v²/2a', () => {
  const hole = parseHole({ name: 'long', par: 2, map: ['o', ...Array(80).fill('g'), '@'] });
  const r = simulateShot(hole, hole.tee, UP, 2 / CONFIG.maxSpeed); // 2 m/s
  const travelled = hole.tee.z - r.ball.z;
  const expected = (2 * 2) / (2 * CONFIG.rollDecel);
  assert.ok(Math.abs(travelled - expected) < 0.05, `travelled ${travelled.toFixed(3)} vs ${expected.toFixed(3)}`);
});

test('a full putt carries over 20 m on flat carpet', () => {
  const hole = parseHole({ name: 'long', par: 2, map: ['o', ...Array(80).fill('g'), '@'] });
  const r = simulateShot(hole, hole.tee, UP, 1);
  assert.ok(hole.tee.z - r.ball.z > 20);
});

test('wall bounce keeps ~70% of the normal speed', () => {
  const hole = lane(10);
  const ball = createBall({ x: 0.2, y: 0, z: 2 });
  ball.vx = -1; ball.moving = true;
  runUntil(hole, ball, (b, ev) => ev.includes('wall'));
  const atWall = Math.sqrt(1 - 2 * CONFIG.rollDecel * (0.2 - CONFIG.ballR));
  assert.ok(Math.abs(ball.vx - 0.7 * atWall) < 0.03, `vx after bounce ${ball.vx} vs ${0.7 * atWall}`);
});

test('a slow ball over the cup drops in; a fast one does not', () => {
  const hole = lane(4);
  const slow = simulateShot(hole, { x: hole.cup.x, y: 0, z: hole.cup.z + 0.3 }, UP, 0.8 / CONFIG.maxSpeed);
  assert.equal(slow.event, 'holed');
  const fast = simulateShot(hole, { x: hole.cup.x, y: 0, z: hole.cup.z + 0.3 }, UP, 3 / CONFIG.maxSpeed);
  assert.notEqual(fast.event, 'holed');
});

test('a ball between capture and lip speed lips out and turns away', () => {
  const hole = lane(4);
  const ball = createBall({ x: hole.cup.x + 0.03, y: 0, z: hole.cup.z + 0.3 });
  shoot(ball, UP, 1.9 / CONFIG.maxSpeed);
  const ev = runUntil(hole, ball, (b, e) => e.includes('lip') || e.includes('holed'));
  assert.ok(ev.includes('lip'));
  assert.ok(ball.vx > 0, 'deflected to the side it was already offset to');
});

test('ramps interpolate between levels and the slope pulls the ball back down', () => {
  const hole = parseHole({
    name: 'ramp', par: 3,
    map: ['ggg', 'gog', 'ggg', '^^^', '^^^', '^^^', '^^^', 'ggg', 'g@g', 'ggg'],
    levels: ['111', '111', '111', '000', '000', '000', '000', '000', '000', '000'],
  });
  const zMid = 5 * C; // halfway up the 4-cell ramp (rows 3..6)
  assert.ok(Math.abs(groundHeight(hole, 0.75, zMid) - 0.125) < 1e-6);
  assert.ok(gradient(hole, 0.75, zMid).z < -0.1, 'ramp rises toward −z');
  // too soft: rolls up, comes back, rests below the ramp
  const soft = simulateShot(hole, hole.tee, UP, 0.25);
  assert.ok(soft.ball.z > 7 * C, `came back down, z=${soft.ball.z}`);
  // firm enough: reaches the top level
  const firm = simulateShot(hole, hole.tee, UP, 0.5);
  assert.ok(firm.ball.y > 0.24 || firm.event === 'holed', `y=${firm.ball.y} ${firm.event}`);
});

test('a ball rolling off a step goes airborne and lands on the lower level', () => {
  const hole = parseHole({
    name: 'drop', par: 2,
    map: ['ggg', 'ggo', 'ggg', 'ggg', 'ggg', 'g@g', 'ggg'],
    levels: ['000', '000', '000', '222', '222', '222', '222'],
  });
  const step = hole.segments.find(s => s.kind === 'step');
  assert.ok(step && Math.abs(step.top - 0.5) < 1e-6, 'step face as high as the upper level');
  const ball = createBall(hole.tee);
  shoot(ball, UP, 0.3);
  let wasAir = false;
  runUntil(hole, ball, b => { wasAir = wasAir || b.air; return !b.moving; });
  assert.ok(wasAir, 'flew off the edge');
  assert.ok(Math.abs(ball.y) < 1e-6 && ball.z < 3 * C, `landed below, y=${ball.y} z=${ball.z}`);
});

test('the step face stops a ball on the lower level', () => {
  const hole = parseHole({
    name: 'drop', par: 2,
    map: ['ggg', 'g@g', 'ggg', 'ggg', 'ggg', 'gog', 'ggg'],
    levels: ['000', '000', '000', '222', '222', '222', '222'],
  });
  const r = simulateShot(hole, hole.tee, Math.PI / 2, 0.3); // towards the higher rows
  assert.ok(r.ball.z < 3 * C && r.ball.y < 0.01, `stayed below, z=${r.ball.z}`);
});

test('water ends the stroke; a bridge with rails crosses it', () => {
  const hole = parseHole({
    name: 'pond', par: 3,
    map: ['ggg', 'gog', 'ggg', 'w=w', 'w=w', 'ggg', 'g@g', 'ggg'],
  });
  assert.equal(simulateShot(hole, { x: 0.25, y: 0, z: 2.75 }, UP, 0.3).event, 'water');
  assert.equal(simulateShot(hole, hole.tee, UP, 0.36).event, 'holed');
  assert.ok(hole.segments.some(s => s.kind === 'rail'));
});

test('hills curve a putt that runs across them', () => {
  const flat = parseHole({ name: 'f', par: 2, map: ['ggggg', 'ggogg', ...Array(16).fill('ggggg'), 'gg@gg'] });
  const hilly = parseHole({ name: 'h', par: 2, map: ['ggggg', 'ggogg', ...Array(16).fill('ggggg'), 'gg@gg'],
    extras: [{ type: 'hill', c: 3.5, r: 10, rad: 2, h: 0.06 }] });
  const a = simulateShot(flat, flat.tee, UP, 0.5), b = simulateShot(hilly, hilly.tee, UP, 0.5);
  assert.ok(b.ball.x < a.ball.x - 0.05, `hill to the right pushes left: ${a.ball.x.toFixed(2)} → ${b.ball.x.toFixed(2)}`);
});

test('a tunnel swallows the ball and spits it out of the other mouth', () => {
  const hole = parseHole({
    name: 'tunnel', par: 3,
    map: ['gtg.ggg', 'ggg.gog', 'ggg.ggg', 'ggg.ggg', 'g@g.ggg', 'ggg.gtg'],
    extras: [{ type: 'tunnel', a: { c: 1, r: 0, out: 's' }, b: { c: 5, r: 5, out: 'n' }, length: 4 }],
  });
  const ball = createBall(hole.tee);
  shoot(ball, UP, 0.4);
  const ev = runUntil(hole, ball, (b, e) => e.filter(x => x === 'tunnel').length >= 2);
  assert.equal(ev.filter(x => x === 'tunnel').length, 2);
  assert.ok(ball.x > 2.5 && ball.vz < 0, 'came out of the right lane heading north');
});

test('windmill blades close the doorway part of the time', () => {
  const hole = parseHole({ name: 'wm', par: 3, map: ['ggg', 'gog', ...Array(12).fill('ggg'), 'g@g', 'ggg'],
    extras: [{ type: 'windmill', c: 1.5, r: 8, axis: 'z', halfWidth: 0.75, period: 4 }] });
  const w = hole.windmills[0];
  let blocked = 0;
  for (let i = 0; i < 400; i++) if (windmillBlocked(w, (i / 400) * w.period)) blocked++;
  assert.ok(blocked > 100 && blocked < 250, `blocked ${blocked}/400`);
  // the faces either side of the doorway are solid
  const r = simulateShot(hole, { x: 0.3, y: 0, z: 10 * C }, UP, 0.3);
  assert.ok(r.ball.z > 4.25, `stopped by the face, z=${r.ball.z}`);
});

test('a hole not finished in 6 strokes scores 7', () => {
  assert.equal(cappedScore(6, false), 7);
  assert.equal(cappedScore(3, true), 3);
});
