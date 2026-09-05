import test from 'node:test';
import assert from 'node:assert/strict';
import { PURE } from './pure.mjs';
const { createMission, updateMission, currentStep, stepProgress } = PURE;

const P = (x, y, z) => ({ x, y, z });
function ctx(over = {}) {
  return { heroPos: P(0, 0, 0), tokens: {}, thugs: {}, vanPos: P(0, 0, 0), webPressed: false, interactPressed: false, ...over };
}
const def = () => ({ id: 'm1', title: 'Test', steps: [
  { type: 'reach', target: P(100, 0, 0), radius: 5, text: 'Go' },
  { type: 'collect', tokenIds: ['a', 'b'], text: 'Grab' },
  { type: 'chase', maxDist: 30, loseDist: 60, duration: 2, text: 'Chase' },
  { type: 'webUp', thugIds: ['t1', 't2'], text: 'Web' },
  { type: 'interact', target: P(0, 0, 0), radius: 3, text: 'Take' },
]});

test('reach completes within radius', () => {
  const m = createMission(def());
  assert.equal(currentStep(m).type, 'reach');
  assert.deepEqual(updateMission(m, ctx({ heroPos: P(50, 0, 0) }), 0.016), []);
  const ev = updateMission(m, ctx({ heroPos: P(97, 0, 0) }), 0.016);
  assert.deepEqual(ev, [{ type: 'stepComplete', index: 0 }]); assert.equal(m.current, 1);
});

test('collect: tokens near hero get collected; step completes when all are', () => {
  const m = createMission(def()); m.current = 1;
  const tokens = { a: { pos: P(0, 0, 0), collected: false }, b: { pos: P(50, 0, 0), collected: false } };
  let ev = updateMission(m, ctx({ tokens }), 0.016);
  assert.deepEqual(ev, [{ type: 'tokenCollected', id: 'a' }]); assert.equal(tokens.a.collected, true);
  assert.equal(stepProgress(m, ctx({ tokens })), '1 / 2');
  ev = updateMission(m, ctx({ tokens, heroPos: P(49, 0, 0) }), 0.016);
  assert.deepEqual(ev, [{ type: 'tokenCollected', id: 'b' }, { type: 'stepComplete', index: 1 }]); assert.equal(m.current, 2);
});

test('chase: timer runs while close, resets on lose, completes after duration', () => {
  const m = createMission(def()); m.current = 2;
  for (let i = 0; i < 60; i++) updateMission(m, ctx({ vanPos: P(10, 0, 0) }), 1 / 60);
  assert.ok(m.timer > 0.9 && m.timer < 1.1);
  const lost = updateMission(m, ctx({ vanPos: P(100, 0, 0) }), 1 / 60);
  assert.deepEqual(lost, [{ type: 'chaseLost' }]); assert.equal(m.timer, 0); assert.equal(m.current, 2);
  let ev = [];
  for (let i = 0; i < 130; i++) ev = ev.concat(updateMission(m, ctx({ vanPos: P(10, 0, 0) }), 1 / 60));
  assert.ok(ev.some(e => e.type === 'stepComplete' && e.index === 2)); assert.equal(m.current, 3);
});

test('webUp: pressing web near an unwebbed thug webs it; all webbed completes', () => {
  const m = createMission(def()); m.current = 3;
  const thugs = { t1: { pos: P(2, 0, 0), webbed: false }, t2: { pos: P(20, 0, 0), webbed: false } };
  assert.deepEqual(updateMission(m, ctx({ thugs, webPressed: false }), 0.016), []);
  let ev = updateMission(m, ctx({ thugs, webPressed: true }), 0.016);
  assert.deepEqual(ev, [{ type: 'thugWebbed', id: 't1' }]); assert.equal(thugs.t1.webbed, true);
  ev = updateMission(m, ctx({ thugs, webPressed: true, heroPos: P(18, 0, 0) }), 0.016);
  assert.deepEqual(ev, [{ type: 'thugWebbed', id: 't2' }, { type: 'stepComplete', index: 3 }]);
});

test('interact completes the mission', () => {
  const m = createMission(def()); m.current = 4;
  assert.deepEqual(updateMission(m, ctx({ interactPressed: false }), 0.016), []);
  const ev = updateMission(m, ctx({ interactPressed: true }), 0.016);
  assert.deepEqual(ev, [{ type: 'stepComplete', index: 4 }, { type: 'missionComplete' }]);
  assert.equal(m.state, 'complete'); assert.equal(currentStep(m), null);
  assert.deepEqual(updateMission(m, ctx(), 0.016), []);
});
