import test from 'node:test';
import assert from 'node:assert/strict';
import { PURE } from './pure.mjs';
const { CONFIG, SpatialGrid, findAnchor } = PURE;

function gridWith(...boxes) { const g = new SpatialGrid(50, 300); boxes.forEach((b, i) => g.insert({ id: i, kind: 'building', ...b })); return g; }
const F = { x: 0, y: 0, z: -1 }; // facing -Z

test('picks a roof corner on the tall building ahead, not the one behind', () => {
  const ahead = { min: { x: -10, y: 0, z: -50 }, max: { x: 10, y: 40, z: -30 } };
  const behind = { min: { x: -10, y: 0, z: 30 }, max: { x: 10, y: 60, z: 50 } };
  const a = findAnchor({ x: 0, y: 5, z: 0 }, F, gridWith(ahead, behind));
  assert.equal(a.sky, false);
  assert.equal(a.y, 40);
  assert.ok(a.z <= -30 && a.z >= -50, `z ${a.z}`);
  assert.ok(a.y - 5 >= CONFIG.anchorMinAbove);
});

test('ignores buildings that are too low, too close, too far, or outside the cone', () => {
  const low = { min: { x: -10, y: 0, z: -50 }, max: { x: 10, y: 10, z: -30 } };          // < 8 m above hero at y=5
  const far = { min: { x: -10, y: 0, z: -200 }, max: { x: 10, y: 80, z: -150 } };        // > 70 m
  const side = { min: { x: 60, y: 0, z: -30 }, max: { x: 80, y: 80, z: -10 } };          // ~70° off axis
  const a = findAnchor({ x: 0, y: 5, z: 0 }, F, gridWith(low, far, side));
  assert.equal(a.sky, true, 'should fall back to sky anchor');
});

test('sky anchor is ahead and above', () => {
  const a = findAnchor({ x: 0, y: 5, z: 0 }, F, gridWith());
  assert.equal(a.sky, true);
  assert.ok(a.z < -10 && a.y > 5 + CONFIG.anchorMinAbove);
});

test('returns null far above the city', () => {
  assert.equal(findAnchor({ x: 0, y: 250, z: 0 }, F, gridWith()), null);
});

test('prefers an anchor whose building the hero will pass beside over one straight ahead', () => {
  const ahead = { min: { x: -10, y: 0, z: -50 }, max: { x: 10, y: 40, z: -30 } };   // straddles the forward line
  const beside = { min: { x: 12, y: 0, z: -50 }, max: { x: 32, y: 40, z: -30 } };   // clear of it
  const a = findAnchor({ x: 0, y: 5, z: 0 }, F, gridWith(ahead, beside));
  assert.equal(a.sky, false);
  assert.ok(a.x >= 12, `chose the clear building, got x=${a.x}`);
});
