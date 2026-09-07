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

test('THE RENDERER BET: the stands genuinely morph as the camera slides through W', () => {
  // The defect this pins: every stand box was authored over w in [-7, +7], an interval
  // strictly containing the whole reachable range of +/-3, so an axis-aligned 4D box
  // sliced to the identical 3D box at every reachable w — same point count, same
  // triangle count, same bounding box, measured. The stadium never changed shape, which
  // is the single thing renderer B was chosen to deliver (spec 4.2). The same root cause
  // pinned SlabRenderer's `inside = w >= wLo && w <= wHi` permanently true, so renderer
  // A's fade never fired either. Both are covered here.
  const { sliceAll, CONFIG } = PURE;
  const world = createWorld();
  const REACH = CONFIG.pitch.halfW * 2;          // the camera's w spans [-3, +3]

  // Each block's W-interval, recovered the way SlabRenderer recovers it.
  const blocks = [];
  for (let i = 0; i < world.stands.length; i += 24) {
    let wLo = Infinity, wHi = -Infinity;
    for (const s of world.stands.slice(i, i + 24)) for (const v of s) {
      if (v.w < wLo) wLo = v.w;
      if (v.w > wHi) wHi = v.w;
    }
    blocks.push({ wLo, wHi });
  }
  assert.ok(blocks.length >= 6, 'there must be several blocks to stagger');
  for (const b of blocks) {
    assert.ok(b.wHi - b.wLo < REACH,
      `a block spanning ${b.wHi - b.wLo} m in W covers the whole reachable range and can never change`);
  }

  const ws = [-3, -1.5, 0, 1.5, 3];
  const lit = ws.map(c => blocks.filter(b => c >= b.wLo && c <= b.wHi).length);
  assert.ok(new Set(lit).size > 1, `renderer A's fade never fires: ${lit.join(',')} lit at ${ws.join(',')}`);
  assert.ok(Math.min(...lit) > 0, 'the stadium must never vanish entirely');
  assert.ok(Math.min(...lit) < blocks.length, 'some block must be out of the slice somewhere');

  const shots = ws.map(c => {
    const { points, tris } = sliceAll(world.stands, c);
    const lo = { x: Infinity, y: Infinity, z: Infinity };
    const hi = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const p of points) for (const k of ['x', 'y', 'z']) {
      if (p[k] < lo[k]) lo[k] = p[k];
      if (p[k] > hi[k]) hi[k] = p[k];
    }
    return { tris: tris.length, lo, hi };
  });
  for (const s of shots) assert.ok(s.tris > 0, 'every reachable slice must show some stadium');
  assert.ok(new Set(shots.map(s => s.tris)).size > 1,
    `the triangle count is identical at every w: ${shots.map(s => s.tris).join(',')}`);
  // and the silhouette itself moves, not just the triangle budget
  const spans = shots.map(s => `${s.lo.x},${s.hi.x}`);
  assert.ok(new Set(spans).size >= ws.length - 1,
    `the outer silhouette barely changes on x: ${spans.join(' / ')}`);
});
