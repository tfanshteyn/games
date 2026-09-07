import test from 'node:test';
import assert from 'node:assert/strict';
import { PURE } from './pure-tesseract.mjs';
const { SpatialGrid4, canContact, nearestTo, createPlayer, CONFIG, V4 } = PURE;

const mk = (x, z, w, role = 'ST') =>
  createPlayer({ pos: V4.make(x, 0, z, w), team: 'home', role, id: `${x}/${z}/${w}` });

test('the grid finds everything within the radius and nothing beyond it', () => {
  const items = [mk(0,0,0), mk(5,0,0), mk(40,0,0), mk(0,30,0), mk(0,0,2.5)];
  const g = new SpatialGrid4(CONFIG.grid.cell);
  g.rebuild(items);
  const near = g.near(V4.make(0, 0, 0, 0), 6).map(i => i.id);
  assert.ok(near.includes('0/0/0'));
  assert.ok(near.includes('5/0/0'));
  assert.ok(near.includes('0/0/2.5'));
  assert.ok(!near.includes('40/0/0'));
  assert.ok(!near.includes('0/30/0'));
});

test('the grid returns every item for a radius that spans the pitch', () => {
  const items = [mk(0,0,0), mk(50,0,0), mk(-50,30,2), mk(20,-30,-2)];
  const g = new SpatialGrid4(CONFIG.grid.cell);
  g.rebuild(items);
  assert.equal(g.near(V4.make(0,0,0,0), 200).length, 4);
});

test('contact needs W overlap, not just proximity on the ground', () => {
  const a = mk(0, 0, 0);
  const sameSlice = mk(0.5, 0, 0);
  const otherSlice = mk(0.5, 0, 2.6);     // 2.6 m away in W, past 1.2 + 1.2
  assert.ok(canContact(a, sameSlice, 1.2));
  assert.ok(!canContact(a, otherSlice, 1.2), 'you run straight through a ghost');
});

test('a keeper reaches further through W than an outfield player', () => {
  // striker sits 2.6 m away in W: inside the keeper's 2.2+1.2 reach, outside an
  // outfield player's 1.2+1.2. That gap is exactly what makes the keeper a keeper.
  const striker = mk(52.4, 0, 2.6);
  assert.ok(canContact(mk(52, 0, 0, 'GK'), striker, 1.2), 'the keeper is 2.2 m thick in W');
  assert.ok(!canContact(mk(52, 0, 0), striker, 1.2), 'an outfield player cannot reach that slice');
});

test('nearestTo picks the closest player passing the filter', () => {
  // The closest player of all is on the other team, so the filter has to do real work:
  // without it the answer would be '1/0/0', which is nearer than either team-mate.
  const ps = [mk(5,0,0), mk(3,0,0), mk(1,0,0)];
  ps[2].team = 'away';
  const n = nearestTo(ps, V4.make(0.9, 0, 0, 0), p => p.team === 'home');
  assert.equal(n.id, '3/0/0');
  assert.equal(nearestTo(ps, V4.make(0,0,0,0), () => false), null);
});
