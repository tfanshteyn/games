import test from 'node:test';
import assert from 'node:assert/strict';
import { PURE } from './pure.mjs';
const { generateCity, mission1Def, createMission } = PURE;

test('mission1Def builds a valid 6-step mission anchored to real city geometry', () => {
  const city = generateCity();
  const def = mission1Def(city);
  assert.equal(def.id, 'm1'); assert.equal(def.title, 'Rooftop Reboot');
  assert.deepEqual(def.steps.map(s => s.type), ['reach', 'reach', 'collect', 'chase', 'webUp', 'interact']);
  const r = def.steps[1];
  const d = Math.hypot(r.target.x - city.spawn.x, r.target.z - city.spawn.z);
  assert.ok(d > 120 && d < 200, `reach distance ${d}`);
  const roof = city.buildings.find(b => b.kind === 'building' && r.target.x >= b.min.x && r.target.x <= b.max.x && r.target.z >= b.min.z && r.target.z <= b.max.z);
  assert.ok(roof && Math.abs(roof.max.y - r.target.y) < 1e-6, 'reach target sits on a roof');
  assert.equal(def.steps[2].tokenIds.length, 5); assert.equal(def.tokens.length, 5);
  for (const t of def.tokens) assert.ok(t.pos.y > 2, 'tokens are off the ground');
  assert.equal(def.steps[4].thugIds.length, 3);
  assert.ok(def.vanRoute.length >= 4);
  for (const p of def.vanRoute) assert.ok(p.y === 0);
  assert.ok(def.plaza && def.steps[5].target);
  createMission(def); // does not throw
});
