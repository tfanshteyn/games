import test from 'node:test';
import assert from 'node:assert/strict';
import { PURE } from './pure-tesseract.mjs';
const { createWorld, inGoalMouth, CONFIG } = PURE;

test('the pitch is a solid volume 6 m deep in W', () => {
  const w = createWorld();
  assert.equal(w.pitch.halfX, 52.5);
  assert.equal(w.pitch.halfZ, 34);
  assert.equal(w.pitch.halfW, 3);
  assert.equal(w.walls.wMin, -3);
  assert.equal(w.walls.wMax, 3);
  assert.equal(w.walls.zMin, -34);
  assert.equal(w.walls.zMax, 34);
});

test('both goals sit on the goal lines and face opposite ways', () => {
  const w = createWorld();
  assert.equal(w.goals.away.x, 52.5);
  assert.equal(w.goals.away.dir, 1);
  assert.equal(w.goals.home.x, -52.5);
  assert.equal(w.goals.home.dir, -1);
  for (const g of [w.goals.home, w.goals.away]) {
    assert.equal(g.halfZ, 3.66);
    assert.equal(g.height, 2.44);
  }
});

test('the goal mouth spans the whole W extent — the keeper cannot cover it', () => {
  const w = createWorld();
  const g = w.goals.away;
  // dead centre, and at both W walls: all inside the mouth
  assert.ok(inGoalMouth({ x: 52.6, y: 1, z: 0, w: 0 }, g));
  assert.ok(inGoalMouth({ x: 52.6, y: 1, z: 0, w: 2.99 }, g));
  assert.ok(inGoalMouth({ x: 52.6, y: 1, z: 0, w: -2.99 }, g));
  // outside the posts, over the bar, and short of the line: all out
  assert.ok(!inGoalMouth({ x: 52.6, y: 1, z: 3.7, w: 0 }, g));
  assert.ok(!inGoalMouth({ x: 52.6, y: 2.5, z: 0, w: 0 }, g));
  assert.ok(!inGoalMouth({ x: 52.4, y: 1, z: 0, w: 0 }, g));
});

test('the stands are a sliceable simplex soup', () => {
  const w = createWorld();
  assert.ok(Array.isArray(w.stands));
  assert.ok(w.stands.length >= 24, 'at least one box worth of simplices');
  for (const s of w.stands.slice(0, 24)) {
    assert.equal(s.length, 5);
    for (const v of s) for (const k of ['x','y','z','w']) assert.equal(typeof v[k], 'number');
  }
});
