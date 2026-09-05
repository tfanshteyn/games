import test from 'node:test';
import assert from 'node:assert/strict';
import { PURE } from './pure.mjs';
const { CONFIG, SpatialGrid, generateCity } = PURE;

test('SpatialGrid returns boxes overlapping the query and nothing else', () => {
  const g = new SpatialGrid(50, 300);
  const a = { id: 1, min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 30, z: 10 } };
  const b = { id: 2, min: { x: 200, y: 0, z: 200 }, max: { x: 210, y: 30, z: 210 } };
  g.insert(a); g.insert(b);
  const hits = g.query({ x: -1, y: 0, z: -1 }, { x: 1, y: 2, z: 1 });
  assert.deepEqual(hits.map(h => h.id), [1]);
  assert.deepEqual(g.query({ x: 100, y: 0, z: 100 }, { x: 101, y: 1, z: 101 }), []);
});

test('generateCity is deterministic for a seed', () => {
  const a = generateCity(7), b = generateCity(7);
  assert.deepEqual(a.buildings, b.buildings);
  assert.notDeepEqual(generateCity(8).buildings, a.buildings);
});

test('generateCity: buildings stay inside their blocks and do not overlap', () => {
  const city = generateCity();
  assert.equal(city.size, 600);
  assert.ok(city.buildings.length >= 144 && city.buildings.length <= 600, `count ${city.buildings.length}`);
  for (const b of city.buildings) {
    assert.ok(b.min.y === 0 || b.kind === 'craneArm', `grounded ${b.id}`);
    assert.ok(b.max.y > b.min.y);
    if (b.kind !== 'building') continue;
    // inside some block (5..45 within the 50 m pitch)
    const lx = ((b.min.x + 300) % 50 + 50) % 50, lz = ((b.min.z + 300) % 50 + 50) % 50;
    assert.ok(lx >= 5 - 1e-6 && lz >= 5 - 1e-6, `min in block ${b.id}`);
    const ux = ((b.max.x + 300 - 1e-6) % 50 + 50) % 50, uz = ((b.max.z + 300 - 1e-6) % 50 + 50) % 50;
    assert.ok(ux <= 45 && uz <= 45, `max in block ${b.id}`);
  }
  const bl = city.buildings.filter(b => b.kind === 'building');
  for (let i = 0; i < bl.length; i++) for (let j = i + 1; j < bl.length; j++) {
    const a = bl[i], b = bl[j];
    const overlap = a.min.x < b.max.x && a.max.x > b.min.x && a.min.z < b.max.z && a.max.z > b.min.z;
    assert.ok(!overlap, `overlap ${a.id} ${b.id}`);
  }
});

test('generateCity: height distribution, waterfront, landmarks, spawn', () => {
  const city = generateCity();
  const bl = city.buildings.filter(b => b.kind === 'building');
  const waterfront = bl.filter(b => b.min.z < -300 + 50);
  assert.ok(waterfront.length > 0);
  for (const b of waterfront) assert.ok(b.max.y <= 16, 'waterfront low-rise');
  const inland = bl.filter(b => b.min.z >= -300 + 50);
  const towers = inland.filter(b => b.max.y > 60).length;
  assert.ok(towers / inland.length > 0.04 && towers / inland.length < 0.2, `towers ratio ${towers / inland.length}`);
  for (const b of inland) assert.ok(b.max.y >= 20 && b.max.y <= 120);
  assert.equal(city.landmarks.spire.max.y, 130);
  assert.ok(city.landmarks.spire.min.x > 0 && city.landmarks.spire.min.x < 50);
  assert.equal(city.landmarks.crane.kind, 'crane');
  assert.ok(city.landmarks.crane.min.z < -250);
  // spawn is on top of a building, roughly central
  const under = bl.find(b => city.spawn.x >= b.min.x && city.spawn.x <= b.max.x && city.spawn.z >= b.min.z && city.spawn.z <= b.max.z);
  assert.ok(under, 'spawn over a building');
  assert.equal(city.spawn.y, under.max.y);
  assert.equal(city.streetLine(6), 0);
  assert.ok(city.props.cars.length > 50 && city.props.lamps.length > 50 && city.civilians.length > 50);
  assert.equal(city.grid.query({ x: -300, y: 0, z: -300 }, { x: 300, y: 200, z: 300 }).length, city.buildings.length);
});
