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

test('the grid searches across bucket boundaries, not just within its own bucket', () => {
  // With a cell size of 8, an entity at x=10 sits in a different bucket than x=0.
  // A broken grid that only searches its own bucket would miss this.
  const items = [mk(10,0,0), mk(13,0,0)];
  const g = new SpatialGrid4(CONFIG.grid.cell);
  g.rebuild(items);
  // Radius 12 includes the entity at distance 10, but excludes the one at distance 13.
  const near = g.near(V4.make(0,0,0,0), 12).map(i => i.id);
  assert.ok(near.includes('10/0/0'), 'entity in different bucket within radius is found');
  assert.ok(!near.includes('13/0/0'), 'entity outside radius is correctly excluded');
});

// ---- contact resolution -------------------------------------------------------
const { resolvePlayerPairs, resolvePlayerBall, createBall, createWorld } = PURE;

const gridOf = players => {
  const g = new SpatialGrid4(CONFIG.grid.cell);
  g.rebuild(players);
  return g;
};

test('players sharing a slice are solid: overlapping bodies are pushed apart', () => {
  const world = createWorld();
  const a = mk(0, 0, 0), b = mk(0.5, 0, 0);      // 0.5 m apart, bodies are 0.9 m across
  resolvePlayerPairs([a, b], gridOf([a, b]), world);
  const sep = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
  assert.ok(Math.abs(sep - CONFIG.contact.playerRadius * 2) < 1e-9,
    `should end exactly touching, got ${sep}`);
  // each moved by half the overlap, and neither was dragged sideways
  assert.ok(Math.abs(a.pos.x + 0.2) < 1e-9, `a.x = ${a.pos.x}`);
  assert.ok(Math.abs(b.pos.x - 0.7) < 1e-9, `b.x = ${b.pos.x}`);
  assert.equal(a.pos.z, 0);
  assert.equal(b.pos.z, 0);
});

test('THE 4D PART: players in different slices run straight through each other', () => {
  const world = createWorld();
  // Same ground position as the test above, but 2.6 m apart in W — past 1.2 + 1.2, so
  // they are ghosts to one another. If this ever separates them, the game is 3D.
  const a = mk(0, 0, 0), b = mk(0.5, 0, 2.6);
  resolvePlayerPairs([a, b], gridOf([a, b]), world);
  assert.equal(a.pos.x, 0, 'the ghost must not push');
  assert.equal(b.pos.x, 0.5, 'the ghost must not be pushed');
  assert.equal(a.pos.w, 0);
  assert.equal(b.pos.w, 2.6, 'separation never touches W');
});

test('separation does not depend on the order players sit in the array', () => {
  const world = createWorld();
  const build = () => [mk(0, 0, 0), mk(0.4, 0, 0.1), mk(-0.3, 0, 0.2)];
  const forward = build();
  resolvePlayerPairs(forward, gridOf(forward), world);
  const backward = build().reverse();
  resolvePlayerPairs(backward, gridOf(backward), world);
  for (const p of forward) {
    const q = backward.find(x => x.id === p.id);
    assert.ok(Math.abs(p.pos.x - q.pos.x) < 1e-12, `${p.id} x drifted with order`);
    assert.ok(Math.abs(p.pos.z - q.pos.z) < 1e-12, `${p.id} z drifted with order`);
  }
});

test('separation keeps players inside the pitch', () => {
  const world = createWorld();
  const a = mk(CONFIG.pitch.halfX, 0, CONFIG.pitch.halfZ);
  const b = mk(CONFIG.pitch.halfX - 0.3, 0, CONFIG.pitch.halfZ - 0.3);
  resolvePlayerPairs([a, b], gridOf([a, b]), world);
  for (const p of [a, b]) {
    assert.ok(Math.abs(p.pos.x) <= CONFIG.pitch.halfX + 1e-9);
    assert.ok(Math.abs(p.pos.z) <= CONFIG.pitch.halfZ + 1e-9);
  }
});

test('running into the ball pushes it away, and faster running pushes it harder', () => {
  const slow = mk(0, 0, 0), fast = mk(0, 0, 0);
  slow.vel = V4.make(2, 0, 0, 0);
  fast.vel = V4.make(7, 0, 0, 0);
  const ballAt = () => createBall(V4.make(0.4, CONFIG.ball.radius, 0, 0));
  const b1 = ballAt(), b2 = ballAt();

  assert.equal(resolvePlayerBall([slow], b1, gridOf([slow])), slow, 'the toucher is returned');
  resolvePlayerBall([fast], b2, gridOf([fast]));

  assert.ok(b1.vel.x > 0, 'the ball must be pushed forward');
  assert.ok(b2.vel.x > b1.vel.x, 'a faster player moves it faster');
  assert.ok(b1.pos.x >= 0.4, 'the ball is lifted clear of the body, never pulled in');
});

test('THE 4D PART: a ball in another slice is a ghost you run straight through', () => {
  const p = mk(0, 0, 0);
  p.vel = V4.make(7, 0, 0, 0);
  // 1.6 m off in W, past the player capsule (1.2) plus the ball capsule (0.3)
  const ball = createBall(V4.make(0.4, CONFIG.ball.radius, 0, 1.6));
  assert.equal(resolvePlayerBall([p], ball, gridOf([p])), null);
  assert.deepEqual(ball.vel, V4.make(), 'the ball must not have been touched');
  assert.equal(ball.pos.x, 0.4);
});

test('exactly one player takes the touch, whoever the ball is nearest', () => {
  const near = mk(0.2, 0, 0), far = mk(-0.3, 0, 0);
  near.vel = V4.make(1, 0, 0, 0);
  far.vel = V4.make(9, 0, 0, 0);
  const ball = createBall(V4.make(0.4, CONFIG.ball.radius, 0, 0));
  const forward = resolvePlayerBall([near, far], ball, gridOf([near, far]));
  assert.equal(forward, near, 'the nearest player, not the first in the array');
  const ball2 = createBall(V4.make(0.4, CONFIG.ball.radius, 0, 0));
  assert.equal(resolvePlayerBall([far, near], ball2, gridOf([far, near])), near,
    'and the answer does not change with array order');
  assert.deepEqual(ball.vel, ball2.vel);
});

test('a ball above head height sails over everyone', () => {
  const p = mk(0, 0, 0);
  p.vel = V4.make(7, 0, 0, 0);
  const ball = createBall(V4.make(0.4, CONFIG.contact.reachY + 0.5, 0, 0));
  assert.equal(resolvePlayerBall([p], ball, gridOf([p])), null);
  assert.deepEqual(ball.vel, V4.make());
});
