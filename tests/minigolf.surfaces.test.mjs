import test from 'node:test';
import assert from 'node:assert/strict';
import { PURE } from './pure-minigolf.mjs';
const { CONFIG, parseHole, createBall, shoot, stepBall, simulateShot, portcullisBlocked } = PURE;

const C = CONFIG.cell;
const UP = -Math.PI / 2;
const lane = (fill, rows = 30) => parseHole({ name: 'lane', par: 3, map: ['ggg', 'gog', ...Array(rows).fill(fill), 'g@g', 'ggg'] });

function rollDistance(hole, power) {
  const r = simulateShot(hole, hole.tee, UP, power);
  return hole.tee.z - r.ball.z;
}

test('ice lets the ball slide much further than carpet', () => {
  const carpet = rollDistance(lane('ggg'), 0.2), ice = rollDistance(lane('iii'), 0.2);
  assert.ok(ice > carpet * 2.5, `carpet ${carpet.toFixed(2)} ice ${ice.toFixed(2)}`);
});

test('snow stops the ball much sooner than carpet', () => {
  const carpet = rollDistance(lane('ggg'), 0.35), snow = rollDistance(lane('nnn'), 0.35);
  assert.ok(snow < carpet * 0.45, `carpet ${carpet.toFixed(2)} snow ${snow.toFixed(2)}`);
});

// a short belt section in the middle of a plain lane
const beltLane = ch => parseHole({ name: 'belt', par: 3, map: ['ggg', 'gog', ...Array(6).fill('ggg'), ...Array(8).fill(ch), ...Array(2).fill('ggg'), 'g@g', 'ggg'] });

test('a belt carries a resting ball along and drops it off the far end', () => {
  const hole = beltLane('NNN');
  const ball = createBall({ x: 1.5 * C, y: 0, z: 15.5 * C }); // on the belt, not moving
  ball.moving = true;
  let stopped = null;
  for (let t = 0; t < 20; t += CONFIG.dt) {
    const ev = stepBall(hole, ball, t, CONFIG.dt);
    if (ev.includes('stopped') || ev.includes('holed')) { stopped = ev; break; }
  }
  assert.ok(stopped, 'came to rest');
  assert.ok(ball.z < 8 * C, `carried past the belt, z=${ball.z.toFixed(2)}`);
});

test('a belt running towards the tee pushes a weak putt back', () => {
  const hole = beltLane('SSS');
  const weak = simulateShot(hole, hole.tee, UP, 0.3);
  assert.ok(weak.ball.z > 15 * C, `weak putt sent back, z=${weak.ball.z.toFixed(2)}`);
  const strong = simulateShot(hole, hole.tee, UP, 0.75);
  assert.ok(strong.ball.z < 8 * C || strong.event === 'holed', `strong putt beats the belt, z=${strong.ball.z.toFixed(2)}`);
});

test('a sideways belt drifts a straight putt across the lane', () => {
  const hole = parseHole({ name: 'cross', par: 3, map: ['ggggg', 'ggogg', ...Array(5).fill('ggggg'), ...Array(4).fill('EEEEE'), ...Array(5).fill('ggggg'), 'gg@gg', 'ggggg'] });
  const r = simulateShot(hole, { x: 1.5 * C, y: 0, z: hole.tee.z }, UP, 0.42);
  assert.ok(r.ball.x > 1.5 * C + 0.1, `drifted east, x=${r.ball.x.toFixed(2)}`);
});

test('a ball never stops on a belt', () => {
  const hole = beltLane('NNN');
  for (let p = 0.1; p < 0.5; p += 0.02) {
    const r = simulateShot(hole, hole.tee, UP, p);
    if (r.event !== 'stopped') continue;
    const z = r.ball.z;
    assert.ok(z < 8 * C || z > 16 * C, `rested on the belt at z=${z.toFixed(2)} (power ${p.toFixed(2)})`);
  }
});

const chuteHole = () => parseHole({
  name: 'chute', par: 3,
  map: ['ggg.ggg', 'gog.ggg', 'ggg.ggg', 'ggg.ggg', 'gtg.ggg', '....ggg', '....ggg', '....ggg', '....ggg', '....gtg', '....ggg', '....ggg', '....g@g', '....ggg'],
  levels: [...Array(5).fill('000.333'), ...Array(9).fill('....333')],
  extras: [{ type: 'chute', in: { c: 5, r: 9, out: 's' }, out: { c: 1, r: 4, out: 'n' }, via: [[5.5, 7], [3.5, 6], [1.5, 6]] }],
});

test('a chute runs downhill from its upper mouth to the lower one', () => {
  const hole = chuteHole();
  const ch = hole.chutes[0];
  assert.ok(ch.a.y > ch.b.y + 0.5, 'enters high, leaves low');
  for (let i = 1; i < ch.path.length; i++) assert.ok(ch.path[i].y <= ch.path[i - 1].y + 1e-9, `downhill at point ${i}`);
});

test('putting into the chute delivers the ball to the lower green', () => {
  const hole = chuteHole();
  const ball = createBall(hole.tee);
  shoot(ball, UP, 0.3);
  const events = [];
  for (let t = 0; t < 20; t += CONFIG.dt) {
    events.push(...stepBall(hole, ball, t, CONFIG.dt));
    if (events.some(e => ['stopped', 'holed', 'out'].includes(e))) break;
  }
  assert.ok(events.includes('chute'), events.join());
  assert.ok(ball.x < 3 * C && ball.y < 0.1, `on the lower green at x=${ball.x.toFixed(2)} y=${ball.y.toFixed(2)}`);
});

test('a factory press blocks the lane on a cycle like a portcullis', () => {
  const hole = parseHole({ name: 'press', par: 3, map: ['ggg', 'gog', ...Array(10).fill('ggg'), 'g@g', 'ggg'],
    extras: [{ type: 'press', c: 1.5, r: 7, axis: 'z', halfWidth: 0.75, period: 3 }] });
  const p = hole.portcullises[0];
  assert.ok(p.press);
  let blocked = 0;
  for (let i = 0; i < 300; i++) if (portcullisBlocked(p, (i / 300) * 3)) blocked++;
  assert.ok(blocked > 100 && blocked < 200, `${blocked}/300`);
});
