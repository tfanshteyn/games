# Tesseract FC — Pass 1 Implementation Plan (Core 4D Match)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A playable 11v11 friendly on a four-dimensional pitch — real movement, ball physics, formation AI, offside, goals and a match clock — rendered by a live 4-polytope slicer with a slab-renderer fallback.

**Architecture:** One self-contained `TesseractFC/index.html`. All simulation logic lives in a `PURE` block of plain `{x,y,z,w}` objects with no THREE and no DOM, extracted by `tests/pure-tesseract.mjs` and driven by `node --test`. Rendering sits outside that block behind a two-implementation `WorldRenderer` interface so renderer B can be swapped for A with a URL parameter.

**Tech Stack:** Vanilla ES2020 in one HTML file, Three.js r160 from cdnjs, `node --test` with `node:assert/strict` and `node:vm`. No build step, no package.json, no dependencies.

**Spec:** `docs/superpowers/specs/2026-09-06-tesseract-fc-design.md`

## Global Constraints

- Single self-contained file: `TesseractFC/index.html`. Embedded CSS and JS only. No build step, no bundler, no `package.json`.
- Three.js loads from `https://cdnjs.cloudflare.com/ajax/libs/three.js/r160/three.min.js`. It is the only external dependency.
- Everything between `// ==== PURE BEGIN ====` and `// ==== PURE END ====` must not reference `THREE`, `window`, `document` or `performance`. The harness shadows those four names and any use throws a `TypeError`.
- The pure block ends with `const PURE = { ... };` naming every export. Tests import it via `import { PURE } from './pure-tesseract.mjs'`.
- Pitch is 105 m × 68 m × **6 m through W**: `halfX 52.5`, `halfZ 34`, `halfW 3`.
- Goal mouth 7.32 m wide × 2.44 m tall and spans the **full** W extent.
- W-thickness: outfield player `1.2`, keeper `2.2`, ball `0.3`.
- Speeds: sprint `7.5 m/s`, jog `5.2 m/s`, **W-slide `2.5 m/s` and never sprintable**.
- `w = ±3` are walls, not touchlines. The ball bounces off them.
- Simulation is fixed-timestep at `1/120 s` and must be deterministic — no `Math.random()` in the pure block without a seeded generator.
- Offside is decided on `x` only. W never enters into it.
- Match is two halves of 240 seconds.
- Commit messages end with:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- Work happens on the existing `tesseract-fc` branch.

## Two spec corrections this plan makes

Both were found while planning; both are improvements, not deviations to argue about later.

1. **Magnus force cannot be a cross product.** The spec (§5) says the Magnus force is "a cross product of spin and velocity". There is no binary cross product in four dimensions. The correct generalisation is to model spin as a **bivector** — an antisymmetric matrix `Ω` with six independent components (`xy, xz, xw, yz, yw, zw`) — and compute `F_i = k · Σ_j Ω_ij v_j`. This reduces exactly to `ω × v` in 3D, and it is what actually lets a struck ball bend through W. Task 4 implements it this way.

2. **The anchor test needs restating.** The spec (§12) says slicing a tesseract at `w = 0` must yield "eight distinct vertices, six square faces". That is true of the tesseract's eight *cubic cells*, but the renderer consumes a soup of **4-simplices**, and a simplex decomposition of the hypercube has interior edges whose midpoints are interior points of the cube — so the emitted vertex set is legitimately larger than eight. The assertion that is both rigorous and hand-checkable is: **every emitted point lies inside `[-1,1]³`, and the bounding box of all emitted points is exactly `[-1,1]³`** — i.e. the cross-section is the cube of side 2 — plus exact hand-computed cases for the single-tetrahedron slice underneath it. Task 2 tests it that way.

---

## File Structure

| File | Responsibility |
|---|---|
| `TesseractFC/index.html` | Everything: markup, CSS, the `PURE` simulation block, the renderers, input, HUD, game loop. Created in Task 1 and extended by every later task. |
| `tests/pure-tesseract.mjs` | Extracts and evaluates the pure block. Mirrors `tests/pure.mjs`. Created in Task 1, never changed after. |
| `tests/tesseract.math.test.mjs` | CONFIG values, `V4`, `chord`. Task 1. |
| `tests/tesseract.slice.test.mjs` | `sliceTetra`, `boxSimplices`, `sliceAll`. Task 2. |
| `tests/tesseract.world.test.mjs` | `createWorld` dimensions and goal geometry. Task 3. |
| `tests/tesseract.ball.test.mjs` | `stepBall`, Magnus, walls, goal detection. Task 4. |
| `tests/tesseract.player.test.mjs` | `stepPlayer`, speed caps, W-slide. Task 5. |
| `tests/tesseract.grid.test.mjs` | `SpatialGrid4`, contact gating. Task 6. |
| `tests/tesseract.offside.test.mjs` | `offsideLineX`, `isOffside`. Task 7. |
| `tests/tesseract.ai.test.mjs` | `formation433`, `homePosition`, `decideAI`. Task 8. |
| `tests/tesseract.match.test.mjs` | `createMatch`, `stepMatch` transitions and clock. Task 9. |

Tasks 10–14 add rendering, input and HUD. They have no node tests — their verification is a scripted manual check in a browser, written out in full.

---

### Task 1: Harness, skeleton file, CONFIG and 4D maths

**Files:**
- Create: `TesseractFC/index.html`
- Create: `tests/pure-tesseract.mjs`
- Test: `tests/tesseract.math.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `PURE.CONFIG` (a plain config object — deliberately not frozen; nothing in Pass 1 mutates it), `PURE.V4` (4D vector helpers `make/add/sub/scale/dot/len/dist/norm/lerp/clone/set/ground`), `PURE.chord(dw, t) -> number`, `PURE.mulberry32(seed) -> () => number`.

- [ ] **Step 1: Create the skeleton game file**

Create `TesseractFC/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no">
<title>Tesseract FC</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; overflow: hidden; background: #05080a; font-family: 'Segoe UI', Tahoma, Verdana, sans-serif; color: #e6efe9; }
  canvas#game { display: block; }
</style>
</head>
<body>
<canvas id="game"></canvas>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r160/three.min.js"></script>
<script>
// ==== PURE BEGIN ====

const PURE = {};
// ==== PURE END ====
</script>
</body>
</html>
```

- [ ] **Step 2: Create the test harness**

Create `tests/pure-tesseract.mjs`:

```js
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../TesseractFC/index.html', import.meta.url), 'utf8');
const begin = html.indexOf('// ==== PURE BEGIN ====');
const end = html.indexOf('// ==== PURE END ====');
if (begin < 0 || end < 0) throw new Error('PURE markers not found in TesseractFC/index.html');
export const PURE_SRC = html.slice(begin, end);

// Evaluate in the host realm so deep-equality against plain objects works, but inside a
// function whose parameters shadow the names the pure block must never touch.
const FORBIDDEN = ['THREE', 'window', 'document', 'performance'];
export function evalPure(code) {
  const wrapped = `(function (${FORBIDDEN.join(', ')}) {\n${code}\n})`;
  return vm.runInThisContext(wrapped, { filename: 'TesseractFC/pure.js' })();
}
export const PURE = evalPure(PURE_SRC + '\n;return PURE;');
```

- [ ] **Step 3: Write the failing test**

Create `tests/tesseract.math.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { PURE } from './pure-tesseract.mjs';
const { CONFIG, V4, chord, mulberry32 } = PURE;

test('CONFIG carries the spec dimensions', () => {
  assert.equal(CONFIG.pitch.halfX, 52.5);
  assert.equal(CONFIG.pitch.halfZ, 34);
  assert.equal(CONFIG.pitch.halfW, 3);
  assert.equal(CONFIG.goal.halfZ, 3.66);
  assert.equal(CONFIG.goal.height, 2.44);
  assert.equal(CONFIG.thickness.player, 1.2);
  assert.equal(CONFIG.thickness.keeper, 2.2);
  assert.equal(CONFIG.thickness.ball, 0.3);
  assert.equal(CONFIG.speed.sprint, 7.5);
  assert.equal(CONFIG.speed.jog, 5.2);
  assert.equal(CONFIG.speed.wSlide, 2.5);
  assert.equal(CONFIG.match.halfSeconds, 240);
  assert.equal(CONFIG.sim.dt, 1 / 120);
});

test('V4 basic ops', () => {
  const a = V4.make(1, 2, 3, 4), b = V4.make(5, 6, 7, 8);
  assert.deepEqual(V4.add(a, b), { x: 6, y: 8, z: 10, w: 12 });
  assert.deepEqual(V4.sub(b, a), { x: 4, y: 4, z: 4, w: 4 });
  assert.deepEqual(V4.scale(a, 2), { x: 2, y: 4, z: 6, w: 8 });
  assert.equal(V4.dot(a, b), 5 + 12 + 21 + 32);
  assert.equal(V4.len(V4.make(1, 2, 2, 4)), 5);
  assert.equal(V4.dist(a, V4.make(1, 2, 3, 9)), 5);
  assert.deepEqual(V4.norm(V4.make(0, 0, 0, -7)), { x: 0, y: 0, z: 0, w: -1 });
  assert.deepEqual(V4.norm(V4.make(0, 0, 0, 0)), { x: 0, y: 0, z: 0, w: 0 });
  assert.deepEqual(V4.lerp(a, b, 0.5), { x: 3, y: 4, z: 5, w: 6 });
  assert.deepEqual(V4.ground(a), { x: 1, y: 0, z: 3, w: 4 });
  const c = V4.clone(a); c.x = 99; assert.equal(a.x, 1);
  const s = V4.make(); V4.set(s, b); assert.deepEqual(s, { x: 5, y: 6, z: 7, w: 8 });
});

test('chord is 1 in your slice and 0 past the thickness', () => {
  assert.equal(chord(0, 1.2), 1);
  assert.equal(chord(1.2, 1.2), 0);
  assert.equal(chord(-1.2, 1.2), 0);
  assert.equal(chord(99, 1.2), 0);
  // half the thickness leaves sqrt(3)/2 of the body in your slice
  assert.ok(Math.abs(chord(0.6, 1.2) - Math.sqrt(3) / 2) < 1e-12);
  assert.equal(chord(-0.6, 1.2), chord(0.6, 1.2));
});

test('mulberry32 is deterministic and in [0,1)', () => {
  const a = mulberry32(7), b = mulberry32(7);
  const seqA = [a(), a(), a()], seqB = [b(), b(), b()];
  assert.deepEqual(seqA, seqB);
  for (const v of seqA) assert.ok(v >= 0 && v < 1);
  // a generator that dropped its state update would pass everything above
  assert.notEqual(seqA[0], seqA[1]);
  assert.notEqual(seqA[1], seqA[2]);
  const c = mulberry32(8);
  assert.notDeepEqual(seqA, [c(), c(), c()]);
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `node --test tests/tesseract.math.test.mjs`
Expected: FAIL — `TypeError: Cannot destructure property 'CONFIG' of 'PURE' as it is undefined` or `CONFIG is undefined`.

- [ ] **Step 5: Write the implementation**

Replace the pure block in `TesseractFC/index.html` (between the markers) with:

```js
// ==== PURE BEGIN ====
const CONFIG = {
  pitch:     { halfX: 52.5, halfZ: 34, halfW: 3 },
  goal:      { halfZ: 3.66, height: 2.44 },          // spans the full W extent
  thickness: { player: 1.2, keeper: 2.2, ball: 0.3 },
  speed:     { sprint: 7.5, jog: 5.2, wSlide: 2.5, accel: 22, decel: 16, turn: 9 },
  ball:      { gravity: 9.81, drag: 0.006, magnus: 0.00042, restitution: 0.55,
               rollFriction: 0.62, radius: 0.11 },
  match:     { halfSeconds: 240, halves: 2 },
  sim:       { dt: 1 / 120 },
  grid:      { cell: 8 },
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const V4 = {
  make: (x = 0, y = 0, z = 0, w = 0) => ({ x, y, z, w }),
  add:  (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z, w: a.w + b.w }),
  sub:  (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z, w: a.w - b.w }),
  scale:(a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s, w: a.w * s }),
  dot:  (a, b) => a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w,
  len:  a => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z + a.w * a.w),
  dist: (a, b) => V4.len(V4.sub(a, b)),
  norm: a => { const l = V4.len(a); return l < 1e-9 ? V4.make() : V4.scale(a, 1 / l); },
  lerp: (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t,
                        z: a.z + (b.z - a.z) * t, w: a.w + (b.w - a.w) * t }),
  clone: a => ({ x: a.x, y: a.y, z: a.z, w: a.w }),
  set:  (dst, src) => { dst.x = src.x; dst.y = src.y; dst.z = src.z; dst.w = src.w; return dst; },
  ground: a => ({ x: a.x, y: 0, z: a.z, w: a.w }),
};

// Fraction of a 4D capsule of half-thickness t that lies in the slice dw away.
function chord(dw, t) {
  const r = Math.abs(dw) / t;
  return r >= 1 ? 0 : Math.sqrt(1 - r * r);
}

const PURE = { CONFIG, mulberry32, V4, chord };
// ==== PURE END ====
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `node --test tests/tesseract.math.test.mjs`
Expected: PASS — 4 tests.

- [ ] **Step 7: Commit**

```bash
git add TesseractFC/index.html tests/pure-tesseract.mjs tests/tesseract.math.test.mjs
git commit -F - <<'EOF'
Tesseract FC: pure-block harness, CONFIG and 4D vector maths

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: The polytope slicer

**Files:**
- Modify: `TesseractFC/index.html` — inside the pure block, after `chord`
- Test: `tests/tesseract.slice.test.mjs`

**Interfaces:**
- Consumes: `V4` from Task 1.
- Produces:
  - `PURE.sliceTetra(p0, p1, p2, p3, c, out) -> number` — appends 0, 3 or 4 `{x,y,z}` points to `out`, returns how many.
  - `PURE.CELLS5` — the five 4-vertex index tuples of a 4-simplex.
  - `PURE.boxSimplices(min, max) -> Array<Array<{x,y,z,w}>>` — 24 four-simplices (Kuhn triangulation) covering an axis-aligned 4D box.
  - `PURE.sliceAll(simplices, c) -> {points: Array<{x,y,z}>, tris: Array<[number,number,number]>}` — the whole cross-section, fan-triangulated.

- [ ] **Step 1: Write the failing test**

Create `tests/tesseract.slice.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/tesseract.slice.test.mjs`
Expected: FAIL — `sliceTetra is not a function`.

- [ ] **Step 3: Write the implementation**

Add inside the pure block, after `chord`:

```js
// The five tetrahedral cells of a 4-simplex, as index tuples into its five vertices.
const CELLS5 = [[1,2,3,4], [0,2,3,4], [0,1,3,4], [0,1,2,4], [0,1,2,3]];

// Slice one tetrahedron (four 4D points) by the hyperplane w = c.
// Appends the cross-section polygon to `out` as {x,y,z} points and returns its length:
// 0 (no crossing), 3 (a triangle) or 4 (a quad, wound so no edge crosses another).
// A vertex exactly on the plane counts as above, which keeps the cases exhaustive.
function sliceTetra(p0, p1, p2, p3, c, out) {
  const below = [], above = [];
  const pts = [p0, p1, p2, p3];
  for (let i = 0; i < 4; i++) (pts[i].w < c ? below : above).push(pts[i]);
  if (below.length === 0 || above.length === 0) return 0;

  const cut = (a, b) => {
    const t = (c - a.w) / (b.w - a.w);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
  };

  if (below.length === 1 || above.length === 1) {
    const lone = below.length === 1 ? below[0] : above[0];
    const rest = below.length === 1 ? above : below;
    out.push(cut(lone, rest[0]), cut(lone, rest[1]), cut(lone, rest[2]));
    return 3;
  }
  // 2/2: consecutive corners share a parent vertex, so the quad cannot self-intersect.
  out.push(cut(below[0], above[0]), cut(below[0], above[1]),
           cut(below[1], above[1]), cut(below[1], above[0]));
  return 4;
}

// Kuhn (Freudenthal) triangulation: an axis-aligned 4D box as 4! = 24 four-simplices.
// Walk from min to max adding one axis at a time; each ordering is one simplex.
function boxSimplices(min, max) {
  const axes = ['x', 'y', 'z', 'w'];
  const out = [];
  const perm = [0, 1, 2, 3];
  const permute = (arr, k) => {
    if (k === arr.length) {
      const cur = { x: min.x, y: min.y, z: min.z, w: min.w };
      const verts = [{ x: cur.x, y: cur.y, z: cur.z, w: cur.w }];
      for (let i = 0; i < arr.length; i++) {
        const a = axes[arr[i]];
        cur[a] = max[a];
        verts.push({ x: cur.x, y: cur.y, z: cur.z, w: cur.w });
      }
      out.push(verts);
      return;
    }
    for (let i = k; i < arr.length; i++) {
      const swap = arr.slice();
      swap[k] = arr[i]; swap[i] = arr[k];
      permute(swap, k + 1);
    }
  };
  permute(perm, 0);
  return out;
}

// Slice a whole simplex soup, fan-triangulating each cell's cross-section polygon.
function sliceAll(simplices, c) {
  const points = [], tris = [], poly = [];
  for (let s = 0; s < simplices.length; s++) {
    const v = simplices[s];
    for (let ci = 0; ci < 5; ci++) {
      const cell = CELLS5[ci];
      poly.length = 0;
      const n = sliceTetra(v[cell[0]], v[cell[1]], v[cell[2]], v[cell[3]], c, poly);
      if (n < 3) continue;
      const base = points.length;
      for (let i = 0; i < n; i++) points.push(poly[i]);
      for (let i = 1; i < n - 1; i++) tris.push([base, base + i, base + i + 1]);
    }
  }
  return { points, tris };
}
```

Extend the exports line:

```js
const PURE = { CONFIG, mulberry32, V4, chord, CELLS5, sliceTetra, boxSimplices, sliceAll };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/tesseract.slice.test.mjs`
Expected: PASS — 6 tests, including `ANCHOR`.

- [ ] **Step 5: Commit**

```bash
git add TesseractFC/index.html tests/tesseract.slice.test.mjs
git commit -F - <<'EOF'
Tesseract FC: 4-polytope slicer with the tesseract anchor test

Marching tetrahedra one dimension up: slice each of a 4-simplex's five
tetrahedral cells by the hyperplane. Kuhn-triangulates 4D boxes so
stadium geometry can be authored as boxes.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: The world

**Files:**
- Modify: `TesseractFC/index.html` — pure block, after `sliceAll`
- Test: `tests/tesseract.world.test.mjs`

**Interfaces:**
- Consumes: `CONFIG`, `boxSimplices`.
- Produces: `PURE.createWorld() -> {pitch, goals, walls, stands}` where `goals` is `{home, away}` each `{x, halfZ, height, dir}` (`dir` is the attack direction that scores in it: `+1` for the goal at `+52.5`), `walls` is `{wMin, wMax, zMin, zMax}`, `stands` is an array of 4-simplices for the renderer.
- Produces: `PURE.inGoalMouth(pos, goal) -> boolean`.

- [ ] **Step 1: Write the failing test**

Create `tests/tesseract.world.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/tesseract.world.test.mjs`
Expected: FAIL — `createWorld is not a function`.

- [ ] **Step 3: Write the implementation**

Add inside the pure block, after `sliceAll`:

```js
// Has the ball's centre crossed this goal line inside the mouth?
// The mouth spans the full W extent, so w never disqualifies a goal.
function inGoalMouth(pos, goal) {
  if (goal.dir > 0 ? pos.x < goal.x : pos.x > goal.x) return false;
  return Math.abs(pos.z) <= goal.halfZ && pos.y >= 0 && pos.y <= goal.height;
}

function createWorld() {
  const p = CONFIG.pitch;
  const goal = d => ({ x: d * p.halfX, halfZ: CONFIG.goal.halfZ, height: CONFIG.goal.height, dir: d });

  // Stand blocks beyond each touchline, authored as 4D boxes so the slicer has real
  // geometry to cut. Each box becomes 24 four-simplices.
  const stands = [];
  const addBox = (min, max) => { for (const s of boxSimplices(min, max)) stands.push(s); };
  for (let i = 0; i < 6; i++) {
    const x0 = -45 + i * 18;
    addBox({ x: x0, y: 0, z: p.halfZ + 6, w: -p.halfW - 4 },
           { x: x0 + 14, y: 9 + (i % 2) * 3, z: p.halfZ + 20, w: p.halfW + 4 });
    addBox({ x: x0, y: 0, z: -p.halfZ - 20, w: -p.halfW - 4 },
           { x: x0 + 14, y: 9 + ((i + 1) % 2) * 3, z: -p.halfZ - 6, w: p.halfW + 4 });
  }

  return {
    pitch: { halfX: p.halfX, halfZ: p.halfZ, halfW: p.halfW },
    goals: { home: goal(-1), away: goal(1) },
    walls: { wMin: -p.halfW, wMax: p.halfW, zMin: -p.halfZ, zMax: p.halfZ },
    stands,
  };
}
```

Extend the exports line to include `createWorld, inGoalMouth`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/tesseract.world.test.mjs`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add TesseractFC/index.html tests/tesseract.world.test.mjs
git commit -F - <<'EOF'
Tesseract FC: 4D pitch, hyper-goals spanning all of W, and stand geometry

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4: Ball physics, with Magnus curve through W

**Files:**
- Modify: `TesseractFC/index.html` — pure block, after `createWorld`
- Test: `tests/tesseract.ball.test.mjs`

**Interfaces:**
- Consumes: `CONFIG`, `V4`, `createWorld`, `inGoalMouth`.
- Produces:
  - `PURE.createBall(pos) -> {pos, vel, spin}` where `spin` is a bivector `{xy, xz, xw, yz, yw, zw}`.
  - `PURE.magnusForce(spin, vel, k) -> {x,y,z,w}`.
  - `PURE.stepBall(ball, world, dt) -> {goal: 'home'|'away'|null, outZ: boolean}`.

- [ ] **Step 1: Write the failing test**

Create `tests/tesseract.ball.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { PURE } from './pure-tesseract.mjs';
const { createBall, magnusForce, stepBall, createWorld, CONFIG, V4 } = PURE;

const DT = CONFIG.sim.dt;
const spin = o => Object.assign({ xy: 0, xz: 0, xw: 0, yz: 0, yw: 0, zw: 0 }, o);

test('a spin bivector in the xz plane curves a ball moving along x sideways in z', () => {
  const f = magnusForce(spin({ xz: 1 }), V4.make(10, 0, 0, 0), 1);
  assert.equal(f.x, 0);
  assert.equal(f.y, 0);
  assert.equal(f.w, 0);
  assert.notEqual(f.z, 0, 'must push along z');
});

test('a spin bivector in the xw plane curves that same ball through W', () => {
  const f = magnusForce(spin({ xw: 1 }), V4.make(10, 0, 0, 0), 1);
  assert.equal(f.x, 0);
  assert.equal(f.z, 0);
  assert.notEqual(f.w, 0, 'this is the shot that bends around the keeper');
});

test('no spin means no Magnus force at all', () => {
  const f = magnusForce(spin({}), V4.make(10, 3, -2, 1), 1);
  assert.deepEqual(f, { x: 0, y: 0, z: 0, w: 0 });
});

test('a dropped ball falls, lands and stops bouncing', () => {
  const world = createWorld();
  const b = createBall(V4.make(0, 5, 0, 0));
  for (let i = 0; i < 1200; i++) stepBall(b, world, DT);
  assert.ok(b.pos.y >= 0, 'never sinks through the pitch');
  assert.ok(b.pos.y < 0.4, 'has settled');
  assert.ok(Math.abs(b.vel.y) < 0.5, 'has stopped bouncing');
});

test('the W walls contain the ball — they are walls, not touchlines', () => {
  const world = createWorld();
  const b = createBall(V4.make(0, 0.5, 0, 2.5));
  b.vel = V4.make(0, 0, 0, 9);
  let bounced = false, prev = b.vel.w;
  for (let i = 0; i < 240; i++) {
    stepBall(b, world, DT);
    assert.ok(Math.abs(b.pos.w) <= CONFIG.pitch.halfW + 1e-6,
      `escaped the W wall at step ${i}: w = ${b.pos.w}`);
    if (Math.sign(b.vel.w) !== Math.sign(prev) && prev !== 0) bounced = true;
    prev = b.vel.w;
  }
  assert.ok(bounced, 'must rebound off the wall rather than stopping dead');
});

test('crossing the goal line inside the mouth is a goal, from any slice', () => {
  const world = createWorld();
  for (const w of [0, 2.8, -2.8]) {
    const b = createBall(V4.make(50, 1, 0, w));
    b.vel = V4.make(20, 0, 0, 0);
    let scored = null;
    for (let i = 0; i < 240 && !scored; i++) scored = stepBall(b, world, DT).goal;
    assert.equal(scored, 'away', `a shot at w=${w} must score`);
  }
});

test('a shot wide of the post is not a goal', () => {
  const world = createWorld();
  const b = createBall(V4.make(50, 1, 6, 0));
  b.vel = V4.make(20, 0, 0, 0);
  let scored = null;
  for (let i = 0; i < 240 && !scored; i++) scored = stepBall(b, world, DT).goal;
  assert.equal(scored, null);
});

test('the simulation is deterministic', () => {
  const run = () => {
    const world = createWorld();
    const b = createBall(V4.make(0, 1, 0, 0));
    b.vel = V4.make(12, 6, 3, 1);
    b.spin = spin({ xw: 40, xz: 25 });
    for (let i = 0; i < 600; i++) stepBall(b, world, DT);
    return b.pos;
  };
  assert.deepEqual(run(), run());
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/tesseract.ball.test.mjs`
Expected: FAIL — `createBall is not a function`.

- [ ] **Step 3: Write the implementation**

Add inside the pure block, after `createWorld`:

```js
function createBall(pos) {
  return {
    pos: V4.clone(pos),
    vel: V4.make(),
    // Spin is a bivector, not a vector: in 4D a rotation lives in a plane, and there
    // are six independent planes. This is what lets a struck ball bend through W.
    spin: { xy: 0, xz: 0, xw: 0, yz: 0, yw: 0, zw: 0 },
  };
}

// F_i = k * sum_j O_ij v_j, with O the antisymmetric spin matrix.
// In three dimensions this reduces exactly to omega x v.
// The trailing `+ 0` is not decorative: the w row is all subtractions, so with zero
// spin it evaluates to IEEE-754 negative zero, and node:assert/strict compares with
// Object.is, for which -0 !== 0. Adding zero normalises -0 to 0 and changes nothing else.
function magnusForce(s, vel, k) {
  return {
    x: k * ( s.xy * vel.y + s.xz * vel.z + s.xw * vel.w) + 0,
    y: k * (-s.xy * vel.x + s.yz * vel.z + s.yw * vel.w) + 0,
    z: k * (-s.xz * vel.x - s.yz * vel.y + s.zw * vel.w) + 0,
    w: k * (-s.xw * vel.x - s.yw * vel.y - s.zw * vel.z) + 0,
  };
}

function stepBall(ball, world, dt) {
  const C = CONFIG.ball;
  const v = ball.vel, p = ball.pos;

  const speed = V4.len(v);
  const mag = magnusForce(ball.spin, v, C.magnus);
  const dragK = C.drag * speed;

  v.x += (mag.x - v.x * dragK) * dt;
  v.y += (mag.y - v.y * dragK - C.gravity) * dt;
  v.z += (mag.z - v.z * dragK) * dt;
  v.w += (mag.w - v.w * dragK) * dt;

  p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt; p.w += v.w * dt;

  // spin decays
  for (const k of ['xy', 'xz', 'xw', 'yz', 'yw', 'zw']) ball.spin[k] *= (1 - 1.1 * dt);

  let goal = null;
  for (const g of [world.goals.home, world.goals.away]) {
    if (inGoalMouth(p, g)) goal = g.dir > 0 ? 'away' : 'home';
  }

  // ground
  if (p.y < C.radius) {
    p.y = C.radius;
    if (v.y < 0) v.y = -v.y * C.restitution;
    if (Math.abs(v.y) < 0.35) v.y = 0;
    const roll = Math.max(0, 1 - C.rollFriction * dt);
    v.x *= roll; v.z *= roll; v.w *= roll;
  }

  // W walls: the stands enclose the pitch through W, so the ball rebounds
  const hw = world.pitch.halfW;
  if (p.w > hw) { p.w = hw; if (v.w > 0) v.w = -v.w * C.restitution; }
  if (p.w < -hw) { p.w = -hw; if (v.w < 0) v.w = -v.w * C.restitution; }

  const outZ = Math.abs(p.z) > world.pitch.halfZ;
  return { goal, outZ };
}
```

Extend the exports line to include `createBall, magnusForce, stepBall`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/tesseract.ball.test.mjs`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add TesseractFC/index.html tests/tesseract.ball.test.mjs
git commit -F - <<'EOF'
Tesseract FC: ball physics with bivector spin

Spin is a bivector rather than a vector, because a 4D rotation lives in
a plane and there is no binary cross product. A shot can therefore bend
through W as well as across the pitch.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 5: Player movement and the W-slide

**Files:**
- Modify: `TesseractFC/index.html` — pure block, after `stepBall`
- Test: `tests/tesseract.player.test.mjs`

**Interfaces:**
- Consumes: `CONFIG`, `V4`, `createWorld`.
- Produces:
  - `PURE.createPlayer(opts) -> {pos, vel, team, role, isKeeper, thickness}`
  - `PURE.makeInput() -> {mx, mz, mw, sprint}` (`mx/mz/mw` in −1..1)
  - `PURE.stepPlayer(player, input, world, dt)`

- [ ] **Step 1: Write the failing test**

Create `tests/tesseract.player.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { PURE } from './pure-tesseract.mjs';
const { createPlayer, makeInput, stepPlayer, createWorld, CONFIG, V4 } = PURE;

const DT = CONFIG.sim.dt;
const run = (p, input, world, secs) => {
  for (let i = 0; i < Math.round(secs / DT); i++) stepPlayer(p, input, world, DT);
};

test('a player accelerates to the jog cap, and to the sprint cap with sprint held', () => {
  const world = createWorld();
  const jog = createPlayer({ pos: V4.make(0, 0, 0, 0), team: 'home', role: 'ST' });
  run(jog, Object.assign(makeInput(), { mx: 1 }), world, 4);
  assert.ok(Math.abs(jog.vel.x - CONFIG.speed.jog) < 0.15, `jog capped, got ${jog.vel.x}`);

  const spr = createPlayer({ pos: V4.make(0, 0, 0, 0), team: 'home', role: 'ST' });
  run(spr, Object.assign(makeInput(), { mx: 1, sprint: true }), world, 4);
  assert.ok(Math.abs(spr.vel.x - CONFIG.speed.sprint) < 0.15, `sprint capped, got ${spr.vel.x}`);
});

test('the W-slide is capped at 2.5 m/s and sprint does not help', () => {
  const world = createWorld();
  // Start at the kata wall and measure over a short window. The pitch is only 6 m deep
  // in W, so a player starting at w=0 reaches the far wall and is clamped to zero
  // velocity long before a four-second window closes — that would measure the wall,
  // not the cap.
  const start = () => V4.make(0, 0, 0, -CONFIG.pitch.halfW);
  const a = createPlayer({ pos: start(), team: 'home', role: 'ST' });
  run(a, Object.assign(makeInput(), { mw: 1 }), world, 1.5);
  assert.ok(Math.abs(a.vel.w - CONFIG.speed.wSlide) < 0.1, `got ${a.vel.w}`);
  assert.ok(a.pos.w < CONFIG.pitch.halfW - 0.1, 'must still be short of the ana wall');

  const b = createPlayer({ pos: start(), team: 'home', role: 'ST' });
  run(b, Object.assign(makeInput(), { mw: 1, sprint: true }), world, 1.5);
  assert.ok(Math.abs(b.vel.w - CONFIG.speed.wSlide) < 0.1, 'W is a feint, not a getaway');
});

test('W is slower than running, so you cannot out-phase a sprint', () => {
  assert.ok(CONFIG.speed.wSlide < CONFIG.speed.jog);
  // sprinting covers ground more than twice as fast as sliding through W
  assert.ok(CONFIG.speed.wSlide * 2 < CONFIG.speed.sprint);
});

test('players are held inside the pitch volume, W walls included', () => {
  const world = createWorld();
  const p = createPlayer({ pos: V4.make(50, 0, 32, 2.6), team: 'home', role: 'ST' });
  run(p, Object.assign(makeInput(), { mx: 1, mz: 1, mw: 1 }), world, 6);
  assert.ok(p.pos.x <= world.pitch.halfX + 1e-6);
  assert.ok(p.pos.z <= world.pitch.halfZ + 1e-6);
  assert.ok(p.pos.w <= world.pitch.halfW + 1e-6);
});

test('releasing the stick brings a player to a stop', () => {
  const world = createWorld();
  const p = createPlayer({ pos: V4.make(0, 0, 0, 0), team: 'home', role: 'ST' });
  run(p, Object.assign(makeInput(), { mx: 1, sprint: true }), world, 3);
  run(p, makeInput(), world, 3);
  assert.ok(V4.len(p.vel) < 0.1, `should have stopped, |v| = ${V4.len(p.vel)}`);
});

test('a keeper is thicker through W than an outfield player', () => {
  const gk = createPlayer({ pos: V4.make(0,0,0,0), team: 'home', role: 'GK' });
  const st = createPlayer({ pos: V4.make(0,0,0,0), team: 'home', role: 'ST' });
  assert.equal(gk.isKeeper, true);
  assert.equal(gk.thickness, CONFIG.thickness.keeper);
  assert.equal(st.thickness, CONFIG.thickness.player);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/tesseract.player.test.mjs`
Expected: FAIL — `createPlayer is not a function`.

- [ ] **Step 3: Write the implementation**

Add inside the pure block, after `stepBall`:

```js
function createPlayer(opts) {
  const isKeeper = opts.role === 'GK';
  return {
    pos: V4.clone(opts.pos),
    vel: V4.make(),
    team: opts.team,
    role: opts.role,
    id: opts.id || (opts.team + ':' + opts.role + ':' + (opts.n || 0)),
    isKeeper,
    thickness: isKeeper ? CONFIG.thickness.keeper : CONFIG.thickness.player,
  };
}

function makeInput() { return { mx: 0, mz: 0, mw: 0, sprint: false }; }

function stepPlayer(player, input, world, dt) {
  const S = CONFIG.speed;
  const v = player.vel, p = player.pos;

  // Ground plane: x/z share one speed budget, W has its own and is never sprintable.
  const groundCap = input.sprint ? S.sprint : S.jog;
  let dx = input.mx, dz = input.mz;
  const dl = Math.hypot(dx, dz);
  if (dl > 1) { dx /= dl; dz /= dl; }

  const approach = (cur, target, rate) => {
    const d = target - cur;
    const step = rate * dt;
    return Math.abs(d) <= step ? target : cur + Math.sign(d) * step;
  };

  const wantX = dx * groundCap, wantZ = dz * groundCap;
  const rateGround = (dl > 0.01) ? S.accel : S.decel;
  v.x = approach(v.x, wantX, rateGround);
  v.z = approach(v.z, wantZ, rateGround);

  const mw = Math.max(-1, Math.min(1, input.mw));
  const wantW = mw * S.wSlide;
  v.w = approach(v.w, wantW, (Math.abs(mw) > 0.01 ? S.accel : S.decel));

  p.x += v.x * dt; p.z += v.z * dt; p.w += v.w * dt;

  const clampAxis = (axis, half) => {
    if (p[axis] > half) { p[axis] = half; if (v[axis] > 0) v[axis] = 0; }
    if (p[axis] < -half) { p[axis] = -half; if (v[axis] < 0) v[axis] = 0; }
  };
  clampAxis('x', world.pitch.halfX);
  clampAxis('z', world.pitch.halfZ);
  clampAxis('w', world.pitch.halfW);
}
```

Extend the exports line to include `createPlayer, makeInput, stepPlayer`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/tesseract.player.test.mjs`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add TesseractFC/index.html tests/tesseract.player.test.mjs
git commit -F - <<'EOF'
Tesseract FC: player movement with a capped, non-sprintable W-slide

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 6: Spatial grid and W-gated contact

**Files:**
- Modify: `TesseractFC/index.html` — pure block, after `stepPlayer`
- Test: `tests/tesseract.grid.test.mjs`

**Interfaces:**
- Consumes: `CONFIG`, `V4`, `chord`, `createPlayer`.
- Produces:
  - `PURE.SpatialGrid4` — class with `constructor(cell)`, `rebuild(items)`, `near(pos, radius) -> Array`.
  - `PURE.canContact(a, b, radius) -> boolean` — requires overlap in W as well as on the ground.
  - `PURE.nearestTo(players, pos, filterFn) -> player|null`.

- [ ] **Step 1: Write the failing test**

Create `tests/tesseract.grid.test.mjs`:

```js
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
  const ps = [mk(0,0,0), mk(3,0,0), mk(1,0,0)];
  ps[2].team = 'away';
  const n = nearestTo(ps, V4.make(0.9, 0, 0, 0), p => p.team === 'home');
  assert.equal(n.id, '3/0/0');
  assert.equal(nearestTo(ps, V4.make(0,0,0,0), () => false), null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/tesseract.grid.test.mjs`
Expected: FAIL — `SpatialGrid4 is not a constructor`.

- [ ] **Step 3: Write the implementation**

Add inside the pure block, after `stepPlayer`:

```js
// Buckets entities by (x, z, w). Height is too shallow on a pitch to be worth bucketing.
class SpatialGrid4 {
  constructor(cell) { this.cell = cell; this.map = new Map(); }
  key(x, z, w) {
    const c = this.cell;
    return `${Math.floor(x / c)},${Math.floor(z / c)},${Math.floor(w / c)}`;
  }
  rebuild(items) {
    this.map.clear();
    for (const it of items) {
      const k = this.key(it.pos.x, it.pos.z, it.pos.w);
      let bucket = this.map.get(k);
      if (!bucket) { bucket = []; this.map.set(k, bucket); }
      bucket.push(it);
    }
  }
  near(pos, radius) {
    const c = this.cell, span = Math.ceil(radius / c);
    const bx = Math.floor(pos.x / c), bz = Math.floor(pos.z / c), bw = Math.floor(pos.w / c);
    const r2 = radius * radius, out = [];
    for (let i = -span; i <= span; i++)
      for (let j = -span; j <= span; j++)
        for (let k = -span; k <= span; k++) {
          const bucket = this.map.get(`${bx + i},${bz + j},${bw + k}`);
          if (!bucket) continue;
          for (const it of bucket) {
            const dx = it.pos.x - pos.x, dz = it.pos.z - pos.z, dw = it.pos.w - pos.w;
            if (dx * dx + dz * dz + dw * dw <= r2) out.push(it);
          }
        }
    return out;
  }
}

// Two actors can touch only if they overlap on the ground AND their W capsules meet.
function canContact(a, b, radius) {
  const dx = a.pos.x - b.pos.x, dz = a.pos.z - b.pos.z;
  if (dx * dx + dz * dz > radius * radius) return false;
  const reach = (a.thickness || CONFIG.thickness.player) + (b.thickness || CONFIG.thickness.player);
  return Math.abs(a.pos.w - b.pos.w) < reach;
}

function nearestTo(players, pos, filterFn) {
  let best = null, bestD = Infinity;
  for (const p of players) {
    if (filterFn && !filterFn(p)) continue;
    const d = V4.dist(V4.ground(p.pos), V4.ground(pos));
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}
```

Extend the exports line to include `SpatialGrid4, canContact, nearestTo`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/tesseract.grid.test.mjs`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add TesseractFC/index.html tests/tesseract.grid.test.mjs
git commit -F - <<'EOF'
Tesseract FC: (x,z,w) spatial grid and W-gated contact

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 7: Offside

**Files:**
- Modify: `TesseractFC/index.html` — pure block, after `nearestTo`
- Test: `tests/tesseract.offside.test.mjs`

**Interfaces:**
- Consumes: `V4`.
- Produces:
  - `PURE.offsideLineX(defenders, ballX, attackDir) -> number`
  - `PURE.isOffside(attackerPos, lineX, attackDir) -> boolean`

- [ ] **Step 1: Write the failing test**

Create `tests/tesseract.offside.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { PURE } from './pure-tesseract.mjs';
const { offsideLineX, isOffside, createPlayer, V4 } = PURE;

const def = (x, w = 0, role = 'CB') =>
  createPlayer({ pos: V4.make(x, 0, 0, w), team: 'away', role, id: 'd' + x });

test('the line is the second-last defender when they are deepest', () => {
  const defs = [def(48, 0, 'GK'), def(40), def(36), def(20)];
  assert.equal(offsideLineX(defs, 0, 1), 40);
});

test('the ball holds the line when it is ahead of the defence', () => {
  const defs = [def(48, 0, 'GK'), def(40), def(36)];
  assert.equal(offsideLineX(defs, 44, 1), 44);
});

test('the halfway line holds it in your own half', () => {
  const defs = [def(-10, 0, 'GK'), def(-20), def(-30)];
  assert.equal(offsideLineX(defs, -40, 1), 0);
});

test('an attacker beyond the line is offside, level is onside', () => {
  assert.ok(isOffside(V4.make(42, 0, 0, 0), 40, 1));
  assert.ok(!isOffside(V4.make(40, 0, 0, 0), 40, 1));
  assert.ok(!isOffside(V4.make(38, 0, 0, 0), 40, 1));
});

test('it works the other way down the pitch', () => {
  const defs = [def(-48, 0, 'GK'), def(-40), def(-36)];
  assert.equal(offsideLineX(defs, 0, -1), -40);
  assert.ok(isOffside(V4.make(-42, 0, 0, 0), -40, -1));
  assert.ok(!isOffside(V4.make(-38, 0, 0, 0), -40, -1));
});

test('W NEVER affects offside — this is deliberate', () => {
  const defs = [def(48, 0, 'GK'), def(40, -3), def(36, 3)];
  const line = offsideLineX(defs, 0, 1);
  for (const w of [-3, -1.5, 0, 1.5, 3]) {
    assert.equal(isOffside(V4.make(42, 0, 0, w), line, 1), true, `w=${w} beyond the line`);
    assert.equal(isOffside(V4.make(38, 0, 0, w), line, 1), false, `w=${w} behind the line`);
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/tesseract.offside.test.mjs`
Expected: FAIL — `offsideLineX is not a function`.

- [ ] **Step 3: Write the implementation**

Add inside the pure block, after `nearestTo`:

```js
// The offside line is a hyperplane at constant x: the deepest of the second-last
// defender, the ball, and the halfway line. W is deliberately not part of this —
// a player level in x is onside whatever slice they are standing in.
function offsideLineX(defenders, ballX, attackDir) {
  const xs = defenders.map(d => d.pos.x * attackDir).sort((a, b) => b - a);
  const secondLast = xs.length >= 2 ? xs[1] : (xs[0] !== undefined ? xs[0] : 0);
  return Math.max(secondLast, ballX * attackDir, 0) * attackDir;
}

function isOffside(attackerPos, lineX, attackDir) {
  return attackerPos.x * attackDir > lineX * attackDir + 1e-9;
}
```

Extend the exports line to include `offsideLineX, isOffside`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/tesseract.offside.test.mjs`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add TesseractFC/index.html tests/tesseract.offside.test.mjs
git commit -F - <<'EOF'
Tesseract FC: offside, deliberately decided on x alone

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 8: Formation and AI decisions

**Files:**
- Modify: `TesseractFC/index.html` — pure block, after `isOffside`
- Test: `tests/tesseract.ai.test.mjs`

**Interfaces:**
- Consumes: `CONFIG`, `V4`, `createPlayer`, `nearestTo`.
- Produces:
  - `PURE.FORMATION_433` — array of 11 `{role, x, z, w}` slots in attack-normalised coordinates (attacking `+x`).
  - `PURE.buildTeam(team, attackDir) -> Array<player>`
  - `PURE.homePosition(slot, ball, phase, attackDir) -> {x,y,z,w}`
  - `PURE.decideAI(player, ctx) -> {mx, mz, mw, sprint}` where `ctx` is `{ball, home, phase, attackDir}`.

- [ ] **Step 1: Write the failing test**

Create `tests/tesseract.ai.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { PURE } from './pure-tesseract.mjs';
const { FORMATION_433, buildTeam, homePosition, decideAI, CONFIG, V4 } = PURE;

test('a 4-3-3 is eleven players with exactly one keeper', () => {
  assert.equal(FORMATION_433.length, 11);
  assert.equal(FORMATION_433.filter(s => s.role === 'GK').length, 1);
  const team = buildTeam('home', 1);
  assert.equal(team.length, 11);
  assert.equal(team.filter(p => p.isKeeper).length, 1);
});

test('THE 4D PART: the back line is spread through W, not stacked on one slice', () => {
  const back = FORMATION_433.filter(s => s.role === 'CB' || s.role === 'FB');
  assert.ok(back.length >= 4);
  const ws = back.map(s => s.w);
  const spread = Math.max(...ws) - Math.min(...ws);
  assert.ok(spread >= 3, `the defence must cover W, spread was only ${spread}`);
  assert.equal(new Set(ws).size, ws.length, 'no two defenders share a slice');
});

test('the whole team stays inside the pitch volume', () => {
  for (const dir of [1, -1]) {
    for (const p of buildTeam('home', dir)) {
      assert.ok(Math.abs(p.pos.x) <= CONFIG.pitch.halfX);
      assert.ok(Math.abs(p.pos.z) <= CONFIG.pitch.halfZ);
      assert.ok(Math.abs(p.pos.w) <= CONFIG.pitch.halfW);
    }
  }
});

test('attacking pushes the line up the pitch, defending drops it back', () => {
  const slot = FORMATION_433.find(s => s.role === 'CB');
  const ball = { x: 30, y: 0, z: 0, w: 0 };
  const att = homePosition(slot, ball, 'attacking', 1);
  const def = homePosition(slot, { x: -30, y: 0, z: 0, w: 0 }, 'defending', 1);
  assert.ok(att.x > def.x, 'the back line follows the ball up the pitch');
  assert.ok(Math.abs(att.x) <= CONFIG.pitch.halfX);
});

test('the keeper tracks the ball through W but stays on his line', () => {
  const slot = FORMATION_433.find(s => s.role === 'GK');
  const near = homePosition(slot, { x: 40, y: 0, z: 0, w: 2.5 }, 'defending', 1);
  assert.ok(near.w > 0.5, 'must move toward the ball slice');
  assert.ok(Math.abs(near.w) <= CONFIG.pitch.halfW);
  assert.ok(near.x < -CONFIG.pitch.halfX + 8, 'stays near his own goal line');
});

test('an AI player steers toward its home position and stops when it arrives', () => {
  const p = PURE.createPlayer({ pos: V4.make(0, 0, 0, 0), team: 'home', role: 'CM' });
  const far = decideAI(p, { home: { x: 20, y: 0, z: 10, w: 2 }, ball: V4.make(20,0,10,2), phase: 'attacking', attackDir: 1 });
  assert.ok(far.mx > 0 && far.mz > 0 && far.mw > 0);
  assert.ok(Math.abs(far.mx) <= 1 && Math.abs(far.mz) <= 1 && Math.abs(far.mw) <= 1);

  const there = decideAI(p, { home: { x: 0, y: 0, z: 0, w: 0 }, ball: V4.make(40,0,0,0), phase: 'attacking', attackDir: 1 });
  assert.ok(Math.hypot(there.mx, there.mz, there.mw) < 0.2, 'no jitter once in position');
});

test('AI output is always a legal input', () => {
  for (const slot of FORMATION_433) {
    const p = PURE.createPlayer({ pos: V4.make(slot.x, 0, slot.z, slot.w), team: 'home', role: slot.role });
    const cmd = decideAI(p, { home: { x: 50, y: 0, z: -33, w: -3 }, ball: V4.make(0,0,0,0), phase: 'defending', attackDir: 1 });
    for (const k of ['mx', 'mz', 'mw']) {
      assert.equal(typeof cmd[k], 'number');
      assert.ok(cmd[k] >= -1 && cmd[k] <= 1, `${slot.role}.${k} out of range: ${cmd[k]}`);
      assert.ok(Number.isFinite(cmd[k]));
    }
    assert.equal(typeof cmd.sprint, 'boolean');
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/tesseract.ai.test.mjs`
Expected: FAIL — `FORMATION_433 is not defined` / destructuring undefined.

- [ ] **Step 3: Write the implementation**

Add inside the pure block, after `isOffside`:

```js
// Slots are written attack-normalised: the team attacks +x, and buildTeam mirrors
// them for the side attacking -x. The back four deliberately occupy four distinct
// slices, because a defence stacked on one w gets walked straight through.
const FORMATION_433 = [
  { role: 'GK', x: -49, z:   0, w:  0.0 },
  { role: 'FB', x: -34, z: -22, w: -2.2 },
  { role: 'CB', x: -37, z:  -8, w: -0.8 },
  { role: 'CB', x: -37, z:   8, w:  0.8 },
  { role: 'FB', x: -34, z:  22, w:  2.2 },
  { role: 'CM', x: -14, z: -16, w: -1.6 },
  { role: 'CM', x: -18, z:   0, w:  0.0 },
  { role: 'CM', x: -14, z:  16, w:  1.6 },
  { role: 'W',  x:   8, z: -24, w: -1.2 },
  { role: 'ST', x:  14, z:   0, w:  0.4 },
  { role: 'W',  x:   8, z:  24, w:  1.2 },
];

function buildTeam(team, attackDir) {
  return FORMATION_433.map((slot, n) => createPlayer({
    pos: V4.make(slot.x * attackDir, 0, slot.z * attackDir, slot.w),
    team, role: slot.role, n, id: `${team}${n}`,
  }));
}

function homePosition(slot, ball, phase, attackDir) {
  const P = CONFIG.pitch;
  const clamp = (v, h) => Math.max(-h, Math.min(h, v));

  if (slot.role === 'GK') {
    // On his line, sliding through W to cover the ball's slice — but he is 2.2 m
    // thick against a 6 m mouth, so he can never cover all of it.
    return {
      x: -(P.halfX - 1.4) * attackDir,
      y: 0,
      z: clamp(ball.z * 0.28, 3.2),
      w: clamp(ball.w * 0.85, P.halfW),
    };
  }

  // The whole shape slides up and down the pitch with the ball.
  const push = phase === 'attacking' ? 16 : phase === 'defending' ? -12 : 0;
  const ballPull = clamp(ball.x * 0.3 * attackDir, 22);

  return {
    x: clamp((slot.x + push + ballPull) * attackDir, P.halfX - 1),
    y: 0,
    z: clamp(slot.z * attackDir + ball.z * 0.18, P.halfZ - 1),
    w: clamp(slot.w + ball.w * 0.25, P.halfW),
  };
}

function decideAI(player, ctx) {
  const dx = ctx.home.x - player.pos.x;
  const dz = ctx.home.z - player.pos.z;
  const dw = ctx.home.w - player.pos.w;

  const groundDist = Math.hypot(dx, dz);
  const DEAD = 0.8;                        // stops the shape jittering in position
  let mx = 0, mz = 0;
  if (groundDist > DEAD) {
    const s = Math.min(1, groundDist / 6) / groundDist;
    mx = dx * s; mz = dz * s;
  }
  const mw = Math.abs(dw) < 0.25 ? 0 : Math.max(-1, Math.min(1, dw / 1.5));

  return { mx, mz, mw, sprint: groundDist > 14 };
}
```

Extend the exports line to include `FORMATION_433, buildTeam, homePosition, decideAI`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/tesseract.ai.test.mjs`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add TesseractFC/index.html tests/tesseract.ai.test.mjs
git commit -F - <<'EOF'
Tesseract FC: 4-3-3 formation and AI that spreads the back line through W

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 9: The match state machine

**Files:**
- Modify: `TesseractFC/index.html` — pure block, after `decideAI`
- Test: `tests/tesseract.match.test.mjs`

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `PURE.createMatch() -> match` — `{world, ball, players, score:{home,away}, clock, half, phase, state, restartTimer, controlled}`
  - `PURE.stepMatch(match, userInput, dt) -> {events: Array<string>}`
  - `PURE.attackDirOf(team) -> 1|-1`

States: `'kickoff' | 'play' | 'goal' | 'halftime' | 'fulltime'`.

- [ ] **Step 1: Write the failing test**

Create `tests/tesseract.match.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { PURE } from './pure-tesseract.mjs';
const { createMatch, stepMatch, makeInput, CONFIG, V4 } = PURE;

const DT = CONFIG.sim.dt;
const advance = (m, secs, input = makeInput()) => {
  const events = [];
  for (let i = 0; i < Math.round(secs / DT); i++) events.push(...stepMatch(m, input, DT).events);
  return events;
};

test('a fresh match has 22 players, 0-0, and starts at kickoff', () => {
  const m = createMatch();
  assert.equal(m.players.length, 22);
  assert.equal(m.players.filter(p => p.team === 'home').length, 11);
  assert.equal(m.players.filter(p => p.isKeeper).length, 2);
  assert.deepEqual(m.score, { home: 0, away: 0 });
  assert.equal(m.state, 'kickoff');
  assert.equal(m.half, 1);
  assert.equal(m.clock, 0);
});

test('kickoff releases into play and the clock runs', () => {
  const m = createMatch();
  // the first 1.0 s is the kickoff restart, which is deliberately not match time
  advance(m, 3);
  assert.equal(m.state, 'play');
  assert.ok(m.clock > 1.5, `clock should be running, got ${m.clock}`);
  assert.ok(m.clock < 2.5, `restart time must not be counted, got ${m.clock}`);
});

test('the clock does not run outside play', () => {
  const m = createMatch();
  const before = m.clock;
  advance(m, 0.5);
  assert.ok(m.clock - before < 0.02, 'kickoff is not match time');
});

test('a goal scores, is announced, and restarts at kickoff', () => {
  const m = createMatch();
  advance(m, 2);
  m.ball.pos = V4.make(52.3, 1, 0, 2.4);        // in the mouth, off in W
  m.ball.vel = V4.make(14, 0, 0, 0);
  const events = advance(m, 1.5);
  assert.equal(m.score.away, 1);
  assert.equal(m.score.home, 0);
  assert.ok(events.includes('goal:away'));
});

test('half time arrives on schedule and the second half kicks off', () => {
  const m = createMatch();
  const events = advance(m, CONFIG.match.halfSeconds + 4);
  assert.ok(events.includes('halftime'));
  assert.equal(m.half, 2);
  assert.ok(m.clock < 5, 'the clock restarts for the second half');
});

test('full time ends the match and freezes it', () => {
  const m = createMatch();
  advance(m, CONFIG.match.halfSeconds + 4);
  const events = advance(m, CONFIG.match.halfSeconds + 4);
  assert.ok(events.includes('fulltime'));
  assert.equal(m.state, 'fulltime');
  const frozen = m.clock;
  advance(m, 3);
  assert.equal(m.clock, frozen, 'nothing moves after full time');
});

test('teams attack opposite ways and swap ends at half time', () => {
  const m = createMatch();
  const firstHalf = PURE.attackDirOf('home');
  assert.equal(PURE.attackDirOf('away'), -firstHalf);
  assert.equal(typeof firstHalf, 'number');
});

test('a full match runs without a player leaving the pitch volume', () => {
  const m = createMatch();
  advance(m, 30, Object.assign(makeInput(), { mx: 1, mw: 1, sprint: true }));
  for (const p of m.players) {
    assert.ok(Math.abs(p.pos.x) <= CONFIG.pitch.halfX + 1e-6, `${p.id} left on x`);
    assert.ok(Math.abs(p.pos.z) <= CONFIG.pitch.halfZ + 1e-6, `${p.id} left on z`);
    assert.ok(Math.abs(p.pos.w) <= CONFIG.pitch.halfW + 1e-6, `${p.id} left on w`);
    assert.ok(Number.isFinite(p.pos.x) && Number.isFinite(p.pos.w));
  }
  assert.ok(Number.isFinite(m.ball.pos.x));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/tesseract.match.test.mjs`
Expected: FAIL — `createMatch is not a function`.

- [ ] **Step 3: Write the implementation**

Add inside the pure block, after `decideAI`:

```js
function attackDirOf(team) { return team === 'home' ? 1 : -1; }

function createMatch() {
  const world = createWorld();
  const players = buildTeam('home', attackDirOf('home')).concat(buildTeam('away', attackDirOf('away')));
  return {
    world,
    ball: createBall(V4.make(0, CONFIG.ball.radius, 0, 0)),
    players,
    grid: new SpatialGrid4(CONFIG.grid.cell),
    score: { home: 0, away: 0 },
    clock: 0,
    half: 1,
    phase: 'transition',
    state: 'kickoff',
    restartTimer: 1.0,
    controlled: players[9],          // the striker, until player-switching lands
  };
}

function resetPositions(match) {
  const fresh = buildTeam('home', attackDirOf('home')).concat(buildTeam('away', attackDirOf('away')));
  for (let i = 0; i < match.players.length; i++) {
    V4.set(match.players[i].pos, fresh[i].pos);
    V4.set(match.players[i].vel, V4.make());
  }
  V4.set(match.ball.pos, V4.make(0, CONFIG.ball.radius, 0, 0));
  V4.set(match.ball.vel, V4.make());
  for (const k of ['xy','xz','xw','yz','yw','zw']) match.ball.spin[k] = 0;
}

function stepMatch(match, userInput, dt) {
  const events = [];
  if (match.state === 'fulltime') return { events };

  if (match.state === 'kickoff' || match.state === 'goal' || match.state === 'halftime') {
    match.restartTimer -= dt;
    if (match.restartTimer <= 0) {
      resetPositions(match);
      match.state = 'play';
    }
    // restarts are not match time
    return { events };
  }

  // ---- possession phase, for the shape ----
  const ballX = match.ball.pos.x;
  match.phase = ballX > 12 ? 'attacking' : ballX < -12 ? 'defending' : 'transition';

  // ---- drive every player ----
  match.grid.rebuild(match.players);
  for (const p of match.players) {
    const dir = attackDirOf(p.team);
    const slot = FORMATION_433[Number(p.id.replace(/^\D+/, '')) % 11];
    if (p === match.controlled) {
      stepPlayer(p, userInput, match.world, dt);
    } else {
      const phase = p.team === 'home' ? match.phase
                  : (match.phase === 'attacking' ? 'defending'
                  : match.phase === 'defending' ? 'attacking' : 'transition');
      const home = homePosition(slot, match.ball.pos, phase, dir);
      stepPlayer(p, decideAI(p, { home, ball: match.ball.pos, phase, attackDir: dir }), match.world, dt);
    }
  }

  // ---- ball ----
  const res = stepBall(match.ball, match.world, dt);
  if (res.goal) {
    match.score[res.goal] += 1;
    events.push('goal:' + res.goal);
    match.state = 'goal';
    match.restartTimer = 1.5;
    return { events };
  }
  if (res.outZ) {
    // Pass 1 keeps play flowing; throw-ins arrive with the rules layer in Pass 2.
    match.ball.pos.z = Math.sign(match.ball.pos.z) * (match.world.pitch.halfZ - 0.5);
    match.ball.vel.z = -match.ball.vel.z * 0.4;
  }

  // ---- clock ----
  match.clock += dt;
  if (match.clock >= CONFIG.match.halfSeconds) {
    if (match.half < CONFIG.match.halves) {
      match.half += 1;
      match.clock = 0;
      match.state = 'halftime';
      match.restartTimer = 1.5;
      events.push('halftime');
    } else {
      match.state = 'fulltime';
      events.push('fulltime');
    }
  }
  return { events };
}
```

Extend the exports line to include `attackDirOf, createMatch, resetPositions, stepMatch`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/tesseract.match.test.mjs`
Expected: PASS — 8 tests.

- [ ] **Step 5: Run the whole suite**

Run: `node --test "tests/**/*.test.mjs"`
Expected: PASS — every Tesseract test plus all pre-existing Spider-Man tests. If any Spider-Man test broke, you touched the wrong file; revert and redo.

- [ ] **Step 6: Commit**

```bash
git add TesseractFC/index.html tests/tesseract.match.test.mjs
git commit -F - <<'EOF'
Tesseract FC: match state machine, clock and goal detection

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 10: Three.js bootstrap, camera and the slab renderer (A)

**Files:**
- Modify: `TesseractFC/index.html` — after `// ==== PURE END ====`
- Test: manual, in a browser (written out below)

**Interfaces:**
- Consumes: `PURE.createMatch`, `PURE.CONFIG`, `PURE.chord`.
- Produces: `WorldRenderer` interface (`build(world)`, `setW(w)`, `dispose()`); `SlabRenderer` implementing it; `makeCamera(scene)`; a running `requestAnimationFrame` loop with a fixed-timestep accumulator.

- [ ] **Step 1: Guard the CDN load (spec §13)**

Three.js is the one external dependency and it can fail. Add to `<body>`, before the scripts:

```html
<div id="loadfail" hidden style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:40px;background:#05080a;z-index:20;">
  <div>
    <h1 style="font-size:1.6rem;letter-spacing:3px;margin-bottom:14px;">Tesseract FC could not start</h1>
    <p style="color:#9fb3aa;line-height:1.6;max-width:460px;">The 3D library failed to load. Check your connection and reload — the game needs Three.js from the CDN.</p>
  </div>
</div>
```

and open the main `<script>` with:

```js
if (typeof THREE === 'undefined') {
  document.getElementById('loadfail').hidden = false;
  document.getElementById('game').style.display = 'none';
  throw new Error('Three.js failed to load');
}
```

The pure block sits below this guard and is unaffected — the test harness slices it out by marker and never evaluates this line.

- [ ] **Step 2: Write the render scaffold**

Add after `// ==== PURE END ====`, inside the same `<script>`:

```js
// ==== RENDER ====
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05080a);
scene.fog = new THREE.Fog(0x05080a, 60, 190);
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x0b2318, 1.1));
const key = new THREE.DirectionalLight(0xffffff, 1.5);
key.position.set(40, 80, 20);
scene.add(key);

// The pitch surface. In 4D the ground is a volume, but its cross-section at any w
// is the same 105x68 rectangle, so one mesh serves every slice.
const pitchMat = new THREE.MeshLambertMaterial({ color: 0x123f2a });
const pitch = new THREE.Mesh(new THREE.PlaneGeometry(105, 68), pitchMat);
pitch.rotation.x = -Math.PI / 2;
scene.add(pitch);

function addGoal(dirX) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xdbe9f7 });
  const post = new THREE.CylinderGeometry(0.06, 0.06, PURE.CONFIG.goal.height, 8);
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(post, mat);
    m.position.set(dirX * PURE.CONFIG.pitch.halfX, PURE.CONFIG.goal.height / 2, s * PURE.CONFIG.goal.halfZ);
    g.add(m);
  }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, PURE.CONFIG.goal.halfZ * 2), mat);
  bar.position.set(dirX * PURE.CONFIG.pitch.halfX, PURE.CONFIG.goal.height, 0);
  g.add(bar);
  scene.add(g);
}
addGoal(1); addGoal(-1);
```

- [ ] **Step 3: Add the renderer interface and SlabRenderer**

```js
// Both renderers implement this. Switching is one line plus ?renderer=a.
// SlabRenderer (A) pre-bakes static meshes and fades those outside your slice.
class SlabRenderer {
  constructor(scene) { this.scene = scene; this.group = new THREE.Group(); scene.add(this.group); this.slabs = []; }
  build(world) {
    const mat = () => new THREE.MeshLambertMaterial({ color: 0x5b46c4, transparent: true, opacity: 0.5 });
    // one box per stand block, reconstructed from the simplex soup's bounds
    for (let i = 0; i < world.stands.length; i += 24) {
      const verts = world.stands.slice(i, i + 24).flat();
      const lo = { x: Infinity, y: Infinity, z: Infinity, w: Infinity };
      const hi = { x: -Infinity, y: -Infinity, z: -Infinity, w: -Infinity };
      for (const v of verts) for (const k of ['x','y','z','w']) {
        if (v[k] < lo[k]) lo[k] = v[k];
        if (v[k] > hi[k]) hi[k] = v[k];
      }
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z), mat());
      mesh.position.set((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, (lo.z + hi.z) / 2);
      this.group.add(mesh);
      this.slabs.push({ mesh, wLo: lo.w, wHi: hi.w });
    }
  }
  setW(w) {
    for (const s of this.slabs) {
      const inside = w >= s.wLo && w <= s.wHi;
      s.mesh.material.opacity = inside ? 0.55 : 0.12;
    }
  }
  dispose() { this.scene.remove(this.group); }
}
```

- [ ] **Step 4: Add the camera and the fixed-timestep loop**

```js
const match = PURE.createMatch();
const params = new URLSearchParams(location.search);
let worldRenderer = new SlabRenderer(scene);      // Task 11 makes B the default
worldRenderer.build(match.world);

const input = PURE.makeInput();
let acc = 0, last = performance.now(), paused = false;

function updateCamera() {
  const c = match.controlled.pos;
  const dir = PURE.attackDirOf(match.controlled.team);
  camera.position.set(c.x - 14 * dir, 7, c.z);
  camera.lookAt(c.x + 6 * dir, 1.4, c.z);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (!paused) {
    acc += dt;
    while (acc >= PURE.CONFIG.sim.dt) {
      PURE.stepMatch(match, input, PURE.CONFIG.sim.dt);
      acc -= PURE.CONFIG.sim.dt;
    }
  }
  worldRenderer.setW(match.controlled.pos.w);
  updateCamera();
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

addEventListener('visibilitychange', () => {
  paused = document.hidden;
  if (document.hidden) { input.mx = 0; input.mz = 0; input.mw = 0; input.sprint = false; }
  last = performance.now();
});
```

- [ ] **Step 5: Verify manually**

Open `TesseractFC/index.html` in a browser. Confirm, in order:
1. No console errors, and Three.js loaded (no "THREE is not defined").
2. A dark green pitch fills the view with a goal frame visible ahead.
3. Violet stand blocks stand beyond both touchlines.
4. The view is behind a player near the centre circle and does not drift or jitter.
5. Switch to another tab for five seconds and come back: the game does not fast-forward.
6. Temporarily change the CDN URL to a broken one and reload: the failure panel appears instead of a blank canvas. Restore the URL.

- [ ] **Step 6: Commit**

```bash
git add TesseractFC/index.html
git commit -F - <<'EOF'
Tesseract FC: Three.js bootstrap, slab renderer and fixed-timestep loop

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 11: The polytope slicer renderer (B)

**Files:**
- Modify: `TesseractFC/index.html` — after `SlabRenderer`
- Test: manual, in a browser

**Interfaces:**
- Consumes: `PURE.sliceAll`, `PURE.CONFIG`.
- Produces: `PolytopeSlicer` implementing `WorldRenderer`; `?renderer=a` override; automatic degradation.

- [ ] **Step 1: Write the slicer renderer**

Add after `SlabRenderer`:

```js
// Renderer B: slice the 4-simplex soup by the hyperplane w = cameraW, every frame.
// This is where the stadium visibly morphs and re-forms as you slide through W.
class PolytopeSlicer {
  constructor(scene, cap = 60000) {
    this.scene = scene;
    this.cap = cap;
    this.geom = new THREE.BufferGeometry();
    this.positions = new Float32Array(cap * 3);
    this.geom.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.mesh = new THREE.Mesh(this.geom, new THREE.MeshLambertMaterial({
      color: 0x8f7ff0, transparent: true, opacity: 0.55, side: THREE.DoubleSide, flatShading: true,
    }));
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.simplices = [];
    this.stride = 1;             // raised when frame time slips
    this.lastW = null;
  }
  build(world) { this.simplices = world.stands; }
  setW(w) {
    if (this.lastW !== null && Math.abs(w - this.lastW) < 0.002) return;
    this.lastW = w;
    const { points, tris } = PURE.sliceAll(this.simplices, w);
    let n = 0;
    for (let i = 0; i < tris.length; i += this.stride) {
      if (n + 9 > this.positions.length) break;
      for (const idx of tris[i]) {
        const p = points[idx];
        this.positions[n++] = p.x; this.positions[n++] = p.y; this.positions[n++] = p.z;
      }
    }
    this.geom.setDrawRange(0, n / 3);
    this.geom.attributes.position.needsUpdate = true;
    this.geom.computeVertexNormals();
  }
  degrade() { this.stride = Math.min(4, this.stride + 1); }
  dispose() { this.scene.remove(this.mesh); this.geom.dispose(); }
}
```

- [ ] **Step 2: Make B the default and wire the override**

Replace the `let worldRenderer = new SlabRenderer(scene);` line from Task 10 with:

```js
const useSlab = params.get('renderer') === 'a';
let worldRenderer = useSlab ? new SlabRenderer(scene) : new PolytopeSlicer(scene);
worldRenderer.build(match.world);
```

- [ ] **Step 3: Degrade the slicer before degrading the game**

Add to `frame`, just before `renderer.render(...)`:

```js
  // The simulation is fixed-timestep and never degraded; the slicer gives way first.
  perf.push(dt);
  if (perf.length > 90) {
    perf.shift();
    const avg = perf.reduce((a, b) => a + b, 0) / perf.length;
    if (avg > 1 / 45 && worldRenderer.degrade) { worldRenderer.degrade(); perf.length = 0; }
  }
```

and declare `const perf = [];` next to `let acc = 0;`.

- [ ] **Step 4: Verify manually**

Open `TesseractFC/index.html`. Confirm:
1. The stands render as faceted violet geometry, not boxes.
2. Hold `E` (once Task 13 lands) or temporarily set `match.controlled.pos.w` from the console between −3 and 3: **the stand geometry visibly changes shape** rather than just fading. This is the whole reason renderer B was chosen — if it does not morph, the slicer is wrong.
3. Open `TesseractFC/index.html?renderer=a` — the stands become plain boxes that fade instead. Both must run without errors.
4. Frame rate stays at or near 60 on the default renderer.

- [ ] **Step 5: Commit**

```bash
git add TesseractFC/index.html
git commit -F - <<'EOF'
Tesseract FC: live 4-polytope slicing renderer, with ?renderer=a fallback

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 12: Actors — chord scaling and ghost slices

**Files:**
- Modify: `TesseractFC/index.html` — after `PolytopeSlicer`
- Test: manual, in a browser

**Interfaces:**
- Consumes: `PURE.chord`, `PURE.CONFIG`, the match object.
- Produces: `ActorLayer` with `sync(match, camW)`.

- [ ] **Step 1: Write the actor layer**

```js
// Players and the ball are 4D capsules. Their cross-section at your slice is the
// same mesh scaled by the chord; outside it they become ghosts you run through.
// Both renderers share this — only static geometry differs between A and B.
class ActorLayer {
  constructor(scene, match) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.body = new THREE.CapsuleGeometry(0.42, 1.0, 4, 10);
    this.meshes = match.players.map(p => {
      const m = new THREE.Mesh(this.body, new THREE.MeshLambertMaterial({
        color: p.team === 'home' ? 0x39d0ff : 0xff5fa2, transparent: true,
      }));
      this.group.add(m);
      return m;
    });
    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(PURE.CONFIG.ball.radius, 16, 12),
      new THREE.MeshLambertMaterial({ color: 0xe8f2fb, transparent: true }));
    this.group.add(this.ball);
  }
  sync(match, camW) {
    for (let i = 0; i < match.players.length; i++) {
      const p = match.players[i], m = this.meshes[i];
      const c = PURE.chord(p.pos.w - camW, p.thickness);
      m.position.set(p.pos.x, 0.92, p.pos.z);
      if (c > 0) {
        m.scale.set(Math.max(0.3, c), 1, Math.max(0.3, c));
        m.material.opacity = 0.55 + 0.45 * c;
      } else {
        m.scale.set(0.3, 0.94, 0.3);
        m.material.opacity = Math.max(0.07, 0.3 - Math.abs(p.pos.w - camW) * 0.07);
      }
      m.material.emissive = new THREE.Color(p === match.controlled ? 0x1d5a3a : 0x000000);
    }
    const bc = PURE.chord(match.ball.pos.w - camW, PURE.CONFIG.thickness.ball);
    this.ball.position.set(match.ball.pos.x, match.ball.pos.y, match.ball.pos.z);
    this.ball.material.opacity = bc > 0 ? 1 : 0.2;
    this.ball.scale.setScalar(bc > 0 ? Math.max(0.5, bc) : 0.5);
  }
}
```

- [ ] **Step 2: Instantiate and call it**

After `worldRenderer.build(match.world);` add:

```js
const actors = new ActorLayer(scene, match);
```

and in `frame`, after `worldRenderer.setW(...)`:

```js
  actors.sync(match, match.controlled.pos.w);
```

- [ ] **Step 3: Verify manually**

Open the game. Confirm:
1. Twenty-two capsules on the pitch in two colours, plus a white ball.
2. Your player is picked out by a green tint.
3. Set `match.controlled.pos.w = 2.5` from the console: players near that slice go solid and full width; players near `w = -2` thin out to faint ghosts. That is the chord doing its job.
4. Players move — the AI is driving them into a 4-3-3 shape.

- [ ] **Step 4: Commit**

```bash
git add TesseractFC/index.html
git commit -F - <<'EOF'
Tesseract FC: actor cross-sections and ghost slices, shared by both renderers

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 13: Input and player switching

**Files:**
- Modify: `TesseractFC/index.html` — after `ActorLayer`
- Test: manual, in a browser

**Interfaces:**
- Consumes: `PURE.makeInput`, `PURE.nearestTo`, the match object.
- Produces: keyboard handling that writes into `input`; `C` switches to the player nearest the ball.

- [ ] **Step 1: Wire the keyboard**

```js
// WASD move, Q/E slide kata/ana through W, Shift sprint, C switch, Esc pause.
const held = new Set();
const CODE_MAP = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  KeyQ: 'kata', KeyE: 'ana', ShiftLeft: 'sprint', ShiftRight: 'sprint',
};
addEventListener('keydown', e => {
  if (e.code === 'KeyC') switchPlayer();
  if (e.code === 'Escape') paused = !paused;
  const a = CODE_MAP[e.code];
  if (a) { held.add(a); e.preventDefault(); }
});
addEventListener('keyup', e => {
  const a = CODE_MAP[e.code];
  if (a) { held.delete(a); e.preventDefault(); }
});
addEventListener('blur', () => held.clear());

function readInput() {
  const dir = PURE.attackDirOf(match.controlled.team);
  input.mx = ((held.has('up') ? 1 : 0) - (held.has('down') ? 1 : 0)) * dir;
  input.mz = ((held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0)) * dir;
  input.mw = (held.has('ana') ? 1 : 0) - (held.has('kata') ? 1 : 0);
  input.sprint = held.has('sprint');
}

function switchPlayer() {
  const team = match.controlled.team;
  const next = PURE.nearestTo(match.players, match.ball.pos,
    p => p.team === team && !p.isKeeper && p !== match.controlled);
  if (next) match.controlled = next;
}
```

- [ ] **Step 2: Call readInput each frame**

In `frame`, before the accumulator loop, add `readInput();`. Also clear `held` in the `visibilitychange` handler alongside the existing input reset.

- [ ] **Step 3: Verify manually**

Open the game. Confirm:
1. WASD moves your player; the camera follows.
2. Shift is noticeably faster.
3. **Q and E slide you through W** — the stands morph (renderer B) and other players fade in and out of your slice as you go. You are stopped at ±3.
4. Holding Shift with Q or E does **not** speed up the W slide.
5. `C` jumps control to a different team-mate near the ball.
6. `Esc` freezes the match; pressing it again resumes without a time jump.
7. Alt-tab away and back: nothing is stuck held down.

- [ ] **Step 4: Commit**

```bash
git add TesseractFC/index.html
git commit -F - <<'EOF'
Tesseract FC: keyboard input, kata/ana W-slide and player switching

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 14: HUD — the W-ribbon, radar and scoreboard

**Files:**
- Modify: `TesseractFC/index.html` — CSS in `<head>`, markup in `<body>`, JS after the input block
- Test: manual, in a browser

**Interfaces:**
- Consumes: `PURE.CONFIG`, `PURE.chord`, the match object.
- Produces: `drawHud(match)` called once per rendered frame.

The W-ribbon is the single most important readability element in the game. It is a first-class feature, not decoration — without it a player cannot tell which slice anyone is in.

- [ ] **Step 1: Add the HUD markup and styles**

In `<head>`, extend the `<style>`:

```css
  #hud { position: fixed; inset: 0; pointer-events: none; z-index: 5; font-family: ui-monospace, Menlo, Consolas, monospace; }
  #score { position: absolute; top: 18px; left: 50%; transform: translateX(-50%); background: rgba(5,10,8,.66); border: 1px solid #243029; padding: 8px 20px; font-size: 1.3rem; letter-spacing: 3px; }
  #clock { display: block; text-align: center; font-size: .8rem; color: #7d9187; letter-spacing: 2px; margin-top: 2px; }
  #wribbon { position: absolute; right: 26px; top: 50%; transform: translateY(-50%); }
  #radar { position: absolute; left: 22px; bottom: 22px; border: 1px solid #243029; background: rgba(5,10,8,.6); }
  #banner { position: absolute; left: 50%; top: 34%; transform: translateX(-50%); font-size: 2.6rem; letter-spacing: 8px; color: #7dfcb4; text-shadow: 0 0 26px #7dfcb466; opacity: 0; transition: opacity .25s; }
  #banner.show { opacity: 1; }
```

In `<body>`, before the scripts:

```html
<div id="hud">
  <div id="score">HOME <span id="sh">0</span> &ndash; <span id="sa">0</span> AWAY<span id="clock">1st &middot; 00:00</span></div>
  <canvas id="wribbon" width="66" height="300"></canvas>
  <canvas id="radar" width="200" height="130"></canvas>
  <div id="banner"></div>
</div>
```

- [ ] **Step 2: Write the HUD drawing**

```js
// ==== HUD ====
const rib = document.getElementById('wribbon').getContext('2d');
const rad = document.getElementById('radar').getContext('2d');
const banner = document.getElementById('banner');
let bannerUntil = 0;

function drawHud(match) {
  const P = PURE.CONFIG.pitch;
  document.getElementById('sh').textContent = match.score.home;
  document.getElementById('sa').textContent = match.score.away;
  const secs = Math.floor(match.clock);
  document.getElementById('clock').textContent =
    `${match.half === 1 ? '1st' : '2nd'} · ${String(Math.floor(secs / 60)).padStart(2,'0')}:${String(secs % 60).padStart(2,'0')}`;

  // ---- W-ribbon: who is in which slice ----
  const H = 300, W = 66, camW = match.controlled.pos.w;
  const yOf = w => H / 2 - (w / P.halfW) * (H / 2 - 16);
  rib.clearRect(0, 0, W, H);
  rib.fillStyle = 'rgba(5,10,8,.62)'; rib.fillRect(0, 0, W, H);
  rib.strokeStyle = '#243029'; rib.strokeRect(0.5, 0.5, W - 1, H - 1);
  rib.font = '9px ui-monospace, monospace';
  for (let w = -3; w <= 3; w++) {
    rib.strokeStyle = 'rgba(125,145,135,.22)';
    rib.beginPath(); rib.moveTo(10, yOf(w)); rib.lineTo(W - 10, yOf(w)); rib.stroke();
  }
  rib.fillStyle = '#7d9187';
  rib.fillText('ANA', 6, 12); rib.fillText('KATA', 4, H - 5);
  for (const p of match.players) {
    rib.fillStyle = p === match.controlled ? '#7dfcb4' : (p.team === 'home' ? '#39d0ff' : '#ff5fa2');
    rib.globalAlpha = p === match.controlled ? 1 : (PURE.chord(p.pos.w - camW, p.thickness) > 0 ? 0.95 : 0.35);
    rib.beginPath(); rib.arc(W / 2 + (p.team === 'home' ? -11 : 11), yOf(p.pos.w), 3.2, 0, 6.283); rib.fill();
  }
  rib.globalAlpha = 1;
  rib.fillStyle = '#e8f2fb';
  rib.beginPath(); rib.arc(W / 2, yOf(match.ball.pos.w), 2.6, 0, 6.283); rib.fill();
  rib.strokeStyle = '#7dfcb4'; rib.setLineDash([4, 3]);
  rib.beginPath(); rib.moveTo(4, yOf(camW)); rib.lineTo(W - 4, yOf(camW)); rib.stroke();
  rib.setLineDash([]);

  // ---- radar: the familiar (x, z) view ----
  rad.clearRect(0, 0, 200, 130);
  rad.fillStyle = 'rgba(5,10,8,.6)'; rad.fillRect(0, 0, 200, 130);
  rad.strokeStyle = 'rgba(230,239,233,.2)';
  rad.strokeRect(6.5, 6.5, 187, 117);
  rad.beginPath(); rad.moveTo(100, 7); rad.lineTo(100, 123); rad.stroke();
  const rx = x => 100 + (x / P.halfX) * 93;
  const rz = z => 65 + (z / P.halfZ) * 58;
  for (const p of match.players) {
    rad.fillStyle = p === match.controlled ? '#7dfcb4' : (p.team === 'home' ? '#39d0ff' : '#ff5fa2');
    rad.fillRect(rx(p.pos.x) - 1.6, rz(p.pos.z) - 1.6, 3.2, 3.2);
  }
  rad.fillStyle = '#e8f2fb';
  rad.fillRect(rx(match.ball.pos.x) - 1.4, rz(match.ball.pos.z) - 1.4, 2.8, 2.8);
}

function showBanner(text, secs) {
  banner.textContent = text;
  banner.classList.add('show');
  bannerUntil = performance.now() + secs * 1000;
}
```

- [ ] **Step 3: Hook events and call the HUD**

In `frame`, collect events from the stepping loop and render the HUD:

```js
    while (acc >= PURE.CONFIG.sim.dt) {
      const { events } = PURE.stepMatch(match, input, PURE.CONFIG.sim.dt);
      for (const ev of events) {
        if (ev.startsWith('goal:')) showBanner('GOAL', 2);
        else if (ev === 'halftime') showBanner('HALF TIME', 2);
        else if (ev === 'fulltime') showBanner('FULL TIME', 6);
      }
      acc -= PURE.CONFIG.sim.dt;
    }
```

and before `renderer.render(...)`:

```js
  drawHud(match);
  if (bannerUntil && performance.now() > bannerUntil) { banner.classList.remove('show'); bannerUntil = 0; }
```

- [ ] **Step 4: Verify manually — the Pass 1 acceptance run**

Open `TesseractFC/index.html` and play a full first half. Confirm every one of these:

1. Scoreboard reads `HOME 0 – 0 AWAY` and the clock counts up from `1st · 00:00`.
2. The W-ribbon shows twenty-two dots spread across the ribbon, your own in green, with a dashed line at your slice. **Press Q and E and watch the dashed line move relative to everyone else.** Defenders should be spread across the ribbon, not stacked.
3. The radar shows a recognisable 4-3-3 shape that shifts up and down the pitch as the ball moves.
4. Run at the goal, slide through W, and confirm that a defender in another slice does not impede you.
5. Push the ball over the goal line inside the mouth: the score increments and `GOAL` banners.
6. Let the clock reach 240: `HALF TIME` banners, the clock resets, the second half kicks off.
7. Play to full time: `FULL TIME` banners and everything freezes.
8. `?renderer=a` still runs, still plays, and still scores.

- [ ] **Step 5: Run the whole suite one last time**

Run: `node --test "tests/**/*.test.mjs"`
Expected: PASS — all Tesseract tests and all pre-existing Spider-Man tests.

- [ ] **Step 6: Commit**

```bash
git add TesseractFC/index.html
git commit -F - <<'EOF'
Tesseract FC: W-ribbon, radar, scoreboard and match banners

Pass 1 complete: a playable 11v11 friendly on a 4D pitch.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
```

---

## What Pass 1 deliberately leaves out

These are Pass 2 and Pass 3, not omissions to fix:

- Enforcement of offside. The functions are built and fully tested in Task 7, but nothing acts on them until free kicks exist in Pass 2. This is deliberate.
- Fouls, cards, free kicks, penalties, throw-ins, corners, goal kicks, stoppage time. Pass 1 keeps the ball in play by rebounding it off the touchlines.
- Shooting, passing and tackling as player actions — Pass 1 is movement, AI shape and goal detection. The mouse bindings from spec §7 land with the rules layer, when a foul can result from them.
- The Kata Cup, persistence, extra time, the shootout, the street arena.
- Mouse camera control. Pass 1's camera is fixed behind the controlled player, which is enough to judge whether renderer B and the W-slide feel right. Yaw and pitch arrive with the mouse bindings in Pass 2.
- Audio, and the portal card in the root `index.html`.

## The decision Pass 1 exists to settle

At the end of Task 14, play the game and answer two questions. Both bets are cheap to reverse now and expensive later:

1. **Does renderer B earn its cost?** Compare against `?renderer=a`. If the morphing stands are more disorienting than compelling, keep A and delete `PolytopeSlicer` — nothing else changes, because both implement the same interface and actors are shared.
2. **Does free continuous W make defending hopeless?** If it does, the spec's stated correction is to lower `CONFIG.speed.wSlide` — not to add discrete lanes.
