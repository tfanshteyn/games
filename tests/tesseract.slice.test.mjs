import test from 'node:test';
import assert from 'node:assert/strict';
import { PURE } from './pure-tesseract.mjs';
const { sliceTetra, boxSimplices, sliceAll, CELLS5 } = PURE;

const P = (x, y, z, w) => ({ x, y, z, w });

test('a tetrahedron entirely on one side of the hyperplane yields nothing', () => {
  const out = [];
  assert.equal(sliceTetra(P(0,0,0,1), P(1,0,0,2), P(0,1,0,3), P(0,0,1,4), 0, out), 0);
  assert.equal(out.length, 0);
  assert.equal(sliceTetra(P(0,0,0,-1), P(1,0,0,-2), P(0,1,0,-3), P(0,0,1,-4), 0, out), 0);
  assert.equal(out.length, 0);
});

test('a 1/3 split yields a triangle with hand-computable vertices', () => {
  // one vertex below the plane at w=-1, three above at w=+1; slice at w=0 takes midpoints
  const out = [];
  const n = sliceTetra(P(0,0,0,-1), P(2,0,0,1), P(0,2,0,1), P(0,0,2,1), 0, out);
  assert.equal(n, 3);
  assert.deepEqual(out, [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }]);
});

test('a 1/3 split (three below, one above) yields a triangle with hand-computable vertices', () => {
  // mirror of the previous case: w signs inverted, so one vertex is above the plane at
  // w=+1 and three are below at w=-1; slice at w=0 takes the same midpoints by symmetry
  const out = [];
  const n = sliceTetra(P(0,0,0,1), P(2,0,0,-1), P(0,2,0,-1), P(0,0,2,-1), 0, out);
  assert.equal(n, 3);
  assert.deepEqual(out, [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }]);
});

test('a 2/2 split yields a quad wound without a bowtie', () => {
  const out = [];
  const n = sliceTetra(P(0,0,0,-1), P(0,2,0,-1), P(2,0,0,1), P(2,2,0,1), 0, out);
  assert.equal(n, 4);
  // below = [v0, v1], above = [v2, v3]; winding is b0a0, b0a1, b1a1, b1a0
  assert.deepEqual(out, [
    { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 1, y: 2, z: 0 }, { x: 1, y: 1, z: 0 },
  ]);
  // consecutive quad corners always share one parent vertex, so no edge crosses another
  assert.equal(out.length, 4);
});

test('boxSimplices is a Kuhn triangulation: 24 simplices of 5 box corners each', () => {
  const sims = boxSimplices(P(-1,-1,-1,-1), P(1,1,1,1));
  assert.equal(sims.length, 24);
  for (const s of sims) {
    assert.equal(s.length, 5);
    for (const v of s) {
      for (const k of ['x', 'y', 'z', 'w']) assert.ok(v[k] === -1 || v[k] === 1, `corner ${k}`);
    }
  }
  assert.equal(CELLS5.length, 5);

  // the 24 simplices must be genuinely distinct, not a repeat-and-drop of fewer orderings
  const sig = s => s.map(v => `${v.x},${v.y},${v.z},${v.w}`).join('|');
  const sigs = new Set(sims.map(sig));
  assert.equal(sigs.size, 24);
});

test('ANCHOR: slicing the tesseract at w=0 gives exactly the cube of side 2', () => {
  const sims = boxSimplices(P(-1,-1,-1,-1), P(1,1,1,1));
  const { points, tris } = sliceAll(sims, 0);
  assert.ok(points.length > 0, 'the slice must not be empty');
  assert.ok(tris.length > 0, 'the slice must produce triangles');

  const EPS = 1e-9;
  const lo = { x: Infinity, y: Infinity, z: Infinity };
  const hi = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const p of points) {
    for (const k of ['x', 'y', 'z']) {
      assert.ok(p[k] >= -1 - EPS && p[k] <= 1 + EPS, `point outside the cube on ${k}: ${p[k]}`);
      if (p[k] < lo[k]) lo[k] = p[k];
      if (p[k] > hi[k]) hi[k] = p[k];
    }
  }
  for (const k of ['x', 'y', 'z']) {
    assert.ok(Math.abs(lo[k] + 1) < EPS, `cross-section does not reach -1 on ${k}`);
    assert.ok(Math.abs(hi[k] - 1) < EPS, `cross-section does not reach +1 on ${k}`);
  }
  // every triangle indexes a real point
  for (const t of tris) for (const i of t) assert.ok(i >= 0 && i < points.length);
});

test('a hypercube cross-section is the same cube at every w, and empty outside', () => {
  const sims = boxSimplices(P(-1,-1,-1,-1), P(1,1,1,1));
  const bbox = c => {
    const { points } = sliceAll(sims, c);
    const lo = { x: Infinity, y: Infinity, z: Infinity };
    const hi = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const p of points) for (const k of ['x','y','z']) {
      if (p[k] < lo[k]) lo[k] = p[k];
      if (p[k] > hi[k]) hi[k] = p[k];
    }
    return { lo, hi };
  };
  const a = bbox(-0.9), b = bbox(0.9);
  for (const k of ['x', 'y', 'z']) {
    assert.ok(Math.abs(a.lo[k] - b.lo[k]) < 1e-9);
    assert.ok(Math.abs(a.hi[k] - b.hi[k]) < 1e-9);
  }
  assert.equal(sliceAll(sims, 1.5).points.length, 0);
  assert.equal(sliceAll(sims, -1.5).tris.length, 0);
});

test('interior faces are culled: no cross-section face is emitted twice', () => {
  // A tetrahedral cell shared by two adjacent simplices is inside the solid. It is
  // sliced from both sides and used to be drawn twice — on the stands that was 1152 of
  // 1728 triangles, stacked coincident, double-sided and translucent, for nothing.
  const sims = boxSimplices(P(-1,-1,-1,-1), P(1,1,1,1));
  for (const c of [-0.5, 0, 0.25, 0.9]) {
    const { points, tris } = sliceAll(sims, c);
    const seen = new Set();
    for (const t of tris) {
      const key = t.map(i => `${points[i].x},${points[i].y},${points[i].z}`).sort().join('|');
      assert.ok(!seen.has(key), `face emitted twice at w=${c}: ${key}`);
      seen.add(key);
    }
    assert.ok(tris.length >= 12, `w=${c}: a closed cube needs at least 12 triangles, got ${tris.length}`);
  }
});
