import test from 'node:test';
import assert from 'node:assert/strict';
import { PURE } from './pure.mjs';
const { SpatialGrid, resolveCollisions, raycastAABBs } = PURE;

function gridWith(...boxes) { const g = new SpatialGrid(50, 300); boxes.forEach((b, i) => g.insert({ id: i, ...b })); return g; }
const tower = { min: { x: 0, y: 0, z: 0 }, max: { x: 20, y: 40, z: 20 } };

test('ground plane stops falling', () => {
  const pos = { x: 50, y: -0.3, z: 50 }, vel = { x: 1, y: -5, z: 0 };
  const r = resolveCollisions(pos, vel, gridWith(tower));
  assert.equal(pos.y, 0); assert.equal(vel.y, 0); assert.equal(r.onGround, true); assert.equal(r.wall, null);
});

test('landing on a roof', () => {
  const pos = { x: 10, y: 39.8, z: 10 }, vel = { x: 0, y: -3, z: 0 };
  const r = resolveCollisions(pos, vel, gridWith(tower));
  assert.equal(pos.y, 40); assert.equal(vel.y, 0); assert.equal(r.onGround, true);
});

test('pushed out of a wall with normal, tangential velocity kept', () => {
  const pos = { x: -0.2, y: 10, z: 10 }, vel = { x: 4, y: 0, z: 3 };   // hero (radius .5) overlapping -X face
  const r = resolveCollisions(pos, vel, gridWith(tower));
  assert.ok(Math.abs(pos.x + 0.5) < 1e-9, `pos.x ${pos.x}`);
  assert.equal(vel.x, 0); assert.equal(vel.z, 3);
  assert.deepEqual(r.wall.normal, { x: -1, y: 0, z: 0 });
  assert.equal(r.onGround, false);
});

test('no contact → nothing changes', () => {
  const pos = { x: 100, y: 5, z: 100 }, vel = { x: 1, y: 1, z: 1 };
  const r = resolveCollisions(pos, vel, gridWith(tower));
  assert.deepEqual(pos, { x: 100, y: 5, z: 100 }); assert.deepEqual(vel, { x: 1, y: 1, z: 1 });
  assert.equal(r.onGround, false); assert.equal(r.wall, null);
});

test('raycast hits nearest face with normal', () => {
  const g = gridWith(tower, { min: { x: 100, y: 0, z: 0 }, max: { x: 120, y: 40, z: 20 } });
  const hit = raycastAABBs({ x: -10, y: 10, z: 10 }, { x: 1, y: 0, z: 0 }, g, 200);
  assert.ok(hit); assert.equal(hit.building.id, 0);
  assert.ok(Math.abs(hit.point.x) < 1e-9); assert.deepEqual(hit.normal, { x: -1, y: 0, z: 0 }); assert.ok(Math.abs(hit.dist - 10) < 1e-9);
  const top = raycastAABBs({ x: 10, y: 100, z: 10 }, { x: 0, y: -1, z: 0 }, g, 200);
  assert.deepEqual(top.normal, { x: 0, y: 1, z: 0 }); assert.ok(Math.abs(top.point.y - 40) < 1e-9);
  assert.equal(raycastAABBs({ x: -10, y: 10, z: 10 }, { x: -1, y: 0, z: 0 }, g, 200), null);
  assert.equal(raycastAABBs({ x: -10, y: 10, z: 10 }, { x: 1, y: 0, z: 0 }, g, 5), null, 'beyond maxDist');
});

test('raycast: zero direction component with origin on a face plane is not a false hit', () => {
  const g = gridWith({ min: { x: 30, y: 0, z: 0 }, max: { x: 60, y: 40, z: 20 } });
  // origin exactly at the box's max.y, outside its z-range → must miss
  assert.equal(raycastAABBs({ x: 5, y: 40, z: 50 }, { x: 1, y: 0, z: 0 }, g, 200), null);
  // same height, inside the z-range → grazes the top face plane; either a hit on the -X face at x=30 or null is acceptable, but never NaN
  const h = raycastAABBs({ x: 5, y: 40, z: 10 }, { x: 1, y: 0, z: 0 }, g, 200);
  if (h) { assert.ok(Number.isFinite(h.dist)); assert.ok(Math.abs(h.point.x - 30) < 1e-9); }
  // origin exactly on min.y plane, level ray inside the footprint → hit the -X face
  const h2 = raycastAABBs({ x: 5, y: 0, z: 10 }, { x: 1, y: 0, z: 0 }, g, 200);
  assert.ok(h2 && Math.abs(h2.dist - 25) < 1e-9);
});
