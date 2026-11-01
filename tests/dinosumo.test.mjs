import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PURE } from './pure-dinosumo.mjs';

const { CONFIG, SPECIES, SPECIES_IDS, createMatch, stepMatch, NO_INPUT } = PURE;
const DT = 1 / 120;
const run = (m, secs, inputs = [NO_INPUT, NO_INPUT]) => { for (let t = 0; t < secs; t += DT) stepMatch(m, typeof inputs === 'function' ? inputs(m) : inputs, DT); };
const fight = (a = 'rex', b = 'rex', opts) => { const m = createMatch(a, b, opts); run(m, CONFIG.readyTime + DT); assert.equal(m.phase, 'fight'); m.events.length = 0; return m; };
const dist = d => Math.hypot(d.pos.x, d.pos.z);

test('the bout waits for "hakkeyoi" and ignores input until then', () => {
  const m = createMatch('rex', 'trike');
  run(m, 1, [{ mx: 1, mz: 0, act: false }, NO_INPUT]);
  assert.equal(m.phase, 'ready');
  assert.equal(m.dinos[0].pos.x, -CONFIG.startX);
  run(m, CONFIG.readyTime);
  assert.equal(m.phase, 'fight');
  assert.ok(m.events.some(e => e.type === 'hakkeyoi'));
});

test('a dino walks where it is steered, up to its top speed, and turns to face that way', () => {
  const m = fight();
  run(m, 0.6, [{ mx: 0, mz: 1, act: false }, NO_INPUT]);
  const d = m.dinos[0];
  assert.ok(d.pos.z > 0.6, `moved ${d.pos.z}`);
  assert.ok(Math.hypot(d.vel.x, d.vel.z) <= CONFIG.maxSpeed + 1e-6);
  assert.ok(Math.abs(d.facing - Math.PI / 2) < 0.05);
});

test('standing still, a dino squares up to its rival', () => {
  const m = fight();
  m.dinos[1].pos = { x: 0, z: 1.5 };
  run(m, 0.5);
  const a = m.dinos[0];
  const want = Math.atan2(1.5 - a.pos.z, 0 - a.pos.x);
  assert.ok(Math.abs(PURE.angDiff(a.facing, want)) < 0.05);
});

test('bodies never overlap and a collision keeps momentum', () => {
  const m = fight();
  const [a, b] = m.dinos;
  a.vel = { x: 2, z: 0 }; b.vel = { x: -2, z: 0 };
  const before = a.vel.x * SPECIES.rex.mass + b.vel.x * SPECIES.rex.mass;
  run(m, 0.3);
  assert.ok(Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) >= 2 * CONFIG.bodyR - 1e-6);
  assert.ok(a.vel.x < 0 && b.vel.x > 0, 'they bounce apart');
  assert.ok(Math.abs(a.vel.x * SPECIES.rex.mass + b.vel.x * SPECIES.rex.mass - before) < 1e-9 + 0.5, 'momentum roughly kept (friction aside)');
});

function shove(species, holdSecs) {
  const m = fight(species, 'rex');
  const x0 = m.dinos[1].pos.x;
  let t = 0;
  run(m, 2.0, () => { t += DT; return [{ mx: 0, mz: 0, act: t < holdSecs }, NO_INPUT]; });
  return m.dinos[1].pos.x - x0;
}
test('a fully charged shove sends the rival much further than a quick tap', () => {
  for (const sp of SPECIES_IDS) {
    const tap = shove(sp, 2 * DT), full = shove(sp, CONFIG.chargeTime + 0.1);
    assert.ok(full > tap * 1.8 && full > 0.4, `${sp}: tap ${tap.toFixed(2)} vs full ${full.toFixed(2)}`);
  }
});

test('one full-power hit from the start lines does not end a round by itself', () => {
  for (const sp of SPECIES_IDS) for (const tgt of SPECIES_IDS) {
    const m = fight(sp, tgt);
    let t = 0;
    run(m, 2.5, () => { t += DT; return [{ mx: 0, mz: 0, act: t < CONFIG.chargeTime + 0.05 }, NO_INPUT]; });
    assert.notEqual(m.phase, 'ko', `${sp} one-shot ${tgt}`);
  }
});

test('a second hit while still dizzy knocks the rival flat', () => {
  const m = fight('rex', 'rex');
  const b = m.dinos[1];
  b.state = 'stun'; b.stateT = 0;
  PURE.applyHit(m, b, 1, 0, 1, 'bump');
  assert.equal(b.state, 'flop');
  assert.ok(m.events.some(e => e.type === 'hit' && e.flop));
});

test('the tail swipe hits all round within reach and misses beyond it', () => {
  const m = fight('stego', 'rex');
  const [a, b] = m.dinos;
  a.power = 1; a.facing = Math.PI;                    // facing away: the tail still connects
  b.pos = { x: a.pos.x + 1.4, z: 0 };
  assert.equal(PURE.strike(m, a, b), true);
  b.vel = { x: 0, z: 0 }; b.pos = { x: a.pos.x + SPECIES.stego.reach + CONFIG.bodyR + 0.1, z: 0 };
  assert.equal(PURE.strike(m, a, b), false);
});

test('the neck slap only lands in front', () => {
  const m = fight('brachio', 'rex');
  const [a, b] = m.dinos;
  a.power = 1; b.pos = { x: a.pos.x + 1.5, z: 0 };
  a.facing = 0; assert.equal(PURE.strike(m, a, b), true);
  b.state = 'idle'; a.facing = Math.PI; assert.equal(PURE.strike(m, a, b), false);
});

test('crossing the rope loses the round, names the move, and the next round resets', () => {
  const m = fight('rex', 'trike');
  const b = m.dinos[1];
  PURE.applyHit(m, b, 1, 0, 12, 'bump');
  run(m, 1.5);
  assert.equal(m.phase, 'ko');
  assert.deepEqual(m.wins, [1, 0]);
  const out = m.events.find(e => e.type === 'out');
  assert.equal(out.loser, 1); assert.equal(out.move, 'Belly Bounce-Out');
  run(m, CONFIG.koTime);
  assert.equal(m.phase, 'ready'); assert.equal(m.round, 2);
  assert.equal(m.dinos[1].pos.x, CONFIG.startX); assert.equal(m.dinos[1].out, false);
});

test('walking out on your own is an "Oops-a-Daisy"', () => {
  const m = fight();
  run(m, 3, [{ mx: -1, mz: 0, act: false }, NO_INPUT]);
  const out = m.events.find(e => e.type === 'out');
  assert.ok(out); assert.equal(out.loser, 0); assert.equal(out.how, 'self');
});

test('first to three wins the match', () => {
  const m = createMatch('rex', 'rex');
  for (let r = 0; r < 3; r++) {
    run(m, CONFIG.readyTime + DT);
    PURE.applyHit(m, m.dinos[0], -1, 0, 7, 'bump');
    run(m, CONFIG.koTime + 1.5);
  }
  assert.equal(m.phase, 'over'); assert.equal(m.champion, 1); assert.deepEqual(m.wins, [0, 3]);
});

test('the CPU beats a dino that just stands there', () => {
  for (const sp of SPECIES_IDS) {
    const m = createMatch('rex', sp, { cpu: [false, true], seed: 7 });
    run(m, 40);
    assert.ok(m.wins[1] >= 1, `${sp} CPU won no rounds`);
    assert.equal(m.wins[0], 0, `${sp} CPU lost to an idle dino`);
  }
});

test('two CPUs slug it out to a champion with no NaNs', () => {
  for (const [a, b] of [['rex', 'trike'], ['stego', 'brachio'], ['trike', 'stego'], ['brachio', 'rex']]) {
    const m = createMatch(a, b, { cpu: [true, true], seed: 99 });
    for (let t = 0; t < 300 && m.phase !== 'over'; t += DT) {
      stepMatch(m, null, DT);
      for (const d of m.dinos) assert.ok(Number.isFinite(d.pos.x + d.pos.z + d.vel.x + d.vel.z));
    }
    assert.equal(m.phase, 'over', `${a} v ${b} never finished`);
  }
});
