# Spider-Man: Brand New Day — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the traversal core (3D city, swing/crawl/zip/camera/HUD/audio) and Mission 1 of a Spider-Man web-swinging game as a new self-contained portal game.

**Architecture:** One file `SpiderMan/index.html`. All game logic that does not need Three.js or the DOM (PRNG, city generation, collision, anchor selection, hero state machine, mission steps) lives in a marked **pure block** using plain `{x,y,z}` objects. A tiny Node test runner extracts that block from the HTML and runs `node --test` against it. Rendering, input, HUD and audio sit below the pure block and are verified manually in the browser.

**Tech Stack:** Three.js r128 (cdnjs), Canvas 2D (minimap), Web Audio API, Node ≥ 20 built-in test runner (dev only).

**Spec:** `docs/superpowers/specs/2026-09-04-spiderman-brand-new-day-design.md`

## Global Constraints

- Single self-contained `SpiderMan/index.html`; the only external resource is `https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js`.
- Everything between `// ==== PURE BEGIN ====` and `// ==== PURE END ====` must not reference `THREE`, `window`, `document`, or `performance`.
- The pure block ends with `const PURE = { ... };` listing every exported symbol; the test harness evaluates the block and reads `PURE`.
- City: 12×12 blocks, 40 m blocks, 10 m streets, seeded PRNG (`CONFIG.citySeed = 20260904`).
- Hero: radius 0.5 m, height 1.8 m, gravity 22 m/s², run 8, sprint 12, crawl 4, zip 40 m/s, zip range 60 m.
- Anchor cone ±35°, 15–70 m away, ≥ 8 m above hero, sky-anchor fallback.
- Camera 7 → 10 m, FOV 60° → 75°, target 2 m above hero, realign after 1.5 s idle.
- No audio files, no textures, shadows off. Target 60 FPS.
- Commit after every task. Commit message style: short imperative summary + `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- Run tests with: `node --test tests/` from `D:\dev\game`.

## Coordinate conventions (used everywhere)

- Y is up. Ground plane is `y = 0`. `hero.pos` is the **feet** position.
- Camera yaw `0` looks down `-Z`. `yawDir(yaw) = { x: -sin(yaw), y: 0, z: -cos(yaw) }`.
- Street centre lines: `x_i = -300 + 50*i` and `z_i = -300 + 50*i` for `i = 0..12`. Block `(ix, iz)` spans `[x_ix + 5, x_ix + 45] × [z_iz + 5, z_iz + 45]`.
- Waterfront = block row `iz = 0` (low-rise). Spire = block `(6,6)`. Crane = block `(6,0)`.

## File Structure

| File | Responsibility |
|---|---|
| `SpiderMan/index.html` (create) | The game. Sections in order: `STYLE`, `HTML overlays`, `PURE BLOCK` (CONFIG, PRNG, V, SpatialGrid, generateCity, collision, anchors, hero, missions), `AUDIO`, `INPUT`, `RENDER CITY`, `RENDER HERO/WEB`, `CAMERA`, `HUD`, `MISSION 1 CONTENT`, `MAIN LOOP`. |
| `tests/pure.mjs` (create) | Loads the pure block from the HTML via `node:vm`, exports `PURE`. |
| `tests/spiderman.*.test.mjs` (create, one per pure task) | Node tests for each pure module. |
| `index.html` (modify) | Add portal card + thumbnail drawing. |
| `CLAUDE.md` (modify) | Add game to repository structure. |

---

### Task 1: Scaffold game file and Node test harness

**Files:**
- Create: `SpiderMan/index.html`
- Create: `tests/pure.mjs`
- Create: `tests/spiderman.config.test.mjs`

**Interfaces:**
- Produces: `PURE` object exported from `tests/pure.mjs`; `CONFIG` with the fields listed below, used by every later task.

- [ ] **Step 1: Write the failing test**

`tests/spiderman.config.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { PURE } from './pure.mjs';

test('pure block exports CONFIG with city and hero constants', () => {
  const { CONFIG } = PURE;
  assert.equal(CONFIG.citySeed, 20260904);
  assert.equal(CONFIG.gridN, 12);
  assert.equal(CONFIG.blockSize, 40);
  assert.equal(CONFIG.streetW, 10);
  assert.equal(CONFIG.gravity, 22);
  assert.equal(CONFIG.heroRadius, 0.5);
  assert.equal(CONFIG.heroHeight, 1.8);
});
```

`tests/pure.mjs`:
```js
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../SpiderMan/index.html', import.meta.url), 'utf8');
const begin = html.indexOf('// ==== PURE BEGIN ====');
const end = html.indexOf('// ==== PURE END ====');
if (begin < 0 || end < 0) throw new Error('PURE markers not found in SpiderMan/index.html');
const src = html.slice(begin, end) + '\n;PURE';
export const PURE = vm.runInNewContext(src, { Math, console }, { filename: 'SpiderMan/pure.js' });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/`
Expected: FAIL — `ENOENT ... SpiderMan/index.html`.

- [ ] **Step 3: Create the game skeleton**

`SpiderMan/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Spider-Man: Brand New Day</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; overflow: hidden; background: #0c0c1a; font-family: 'Segoe UI', Tahoma, Verdana, sans-serif; color: #fff; }
  canvas#game { display: block; }
  .overlay { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(6,6,20,0.85); z-index: 10; text-align: center; }
  .overlay.hidden { display: none; }
  .overlay h1 { font-size: 3rem; letter-spacing: 6px; color: #e62429; text-shadow: 0 0 20px #e6242988, 3px 3px 0 #0b3d91; }
  .overlay h2 { font-size: 1.2rem; letter-spacing: 3px; color: #7fb3ff; margin-bottom: 30px; }
  .overlay p { max-width: 520px; line-height: 1.6; color: #ccc; margin-bottom: 20px; }
  .overlay button { padding: 12px 36px; font-size: 1.1rem; letter-spacing: 2px; background: #e62429; color: #fff; border: none; border-radius: 6px; cursor: pointer; margin: 6px; }
  .overlay button:hover { background: #ff3b40; }
  kbd { background: #222; border: 1px solid #555; border-radius: 4px; padding: 1px 6px; font-family: monospace; }
</style>
</head>
<body>
<canvas id="game"></canvas>

<div id="title" class="overlay">
  <h1>SPIDER-MAN</h1>
  <h2>BRAND NEW DAY</h2>
  <p>Nobody remembers Peter Parker. Time to remind them about Spider-Man.</p>
  <p><kbd>W A S D</kbd> move · <kbd>Mouse</kbd> look · <kbd>Space</kbd> jump · hold <kbd>LMB</kbd> swing · <kbd>E</kbd> zip · <kbd>Esc</kbd> pause</p>
  <button id="startBtn">START PATROL</button>
</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script>
// ==== PURE BEGIN ====
// Everything in this block is plain JS math: no THREE, no DOM. Tested by tests/*.test.mjs.
const CONFIG = {
  // city
  citySeed: 20260904, gridN: 12, blockSize: 40, streetW: 10,
  // hero body
  heroRadius: 0.5, heroHeight: 1.8,
  // movement
  gravity: 22, maxFall: 60, runSpeed: 8, sprintSpeed: 12, groundAccel: 40, groundFriction: 10, airSteer: 6,
  jumpSpeed: 10, highJumpSpeed: 15, doubleTapWindow: 0.25,
  // swing
  anchorConeDeg: 35, anchorMinDist: 15, anchorMaxDist: 70, anchorMinAbove: 8, skyAnchorHeight: 40,
  ropePump: 6, ropeShortenRate: 0.1, ropeMinFrac: 0.6, releaseBonus: 1.2, swingLateral: 5, swingAutoReleaseDelay: 0.3,
  // crawl / zip
  crawlSpeed: 4, wallJumpOut: 8, wallJumpUp: 9, zipSpeed: 40, zipMaxDist: 60,
  // camera
  camDist: 7, camDistFast: 10, camFovMin: 60, camFovMax: 75, camHeight: 2, camIdleRealign: 1.5, mouseSens: 0.002,
  fastSpeed: 25, // speed at which camera/FOV reach their "fast" values
};

const PURE = { CONFIG };
// ==== PURE END ====

// (rendering, input, HUD, audio and main loop are added in later tasks)
</script>
</body>
</html>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/`
Expected: `# pass 1`.

- [ ] **Step 5: Commit**

```bash
git add SpiderMan/index.html tests/pure.mjs tests/spiderman.config.test.mjs
git commit -m "Scaffold Spider-Man game file and pure-block test harness"
```

---

### Task 2: PRNG and vector helpers

**Files:**
- Modify: `SpiderMan/index.html` (pure block, after `CONFIG`)
- Create: `tests/spiderman.math.test.mjs`

**Interfaces:**
- Produces: `mulberry32(seed) → () => number in [0,1)`; `V` with `add, sub, scale, dot, cross, len, dist, norm, lerp, clone, set, horiz`; `yawDir(yaw)`.

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { PURE } from './pure.mjs';
const { mulberry32, V, yawDir } = PURE;

test('mulberry32 is deterministic and in [0,1)', () => {
  const a = mulberry32(42), b = mulberry32(42);
  const seqA = [a(), a(), a()], seqB = [b(), b(), b()];
  assert.deepEqual(seqA, seqB);
  for (const v of seqA) assert.ok(v >= 0 && v < 1);
  assert.notDeepEqual(seqA, [mulberry32(43)(), mulberry32(43)(), mulberry32(43)()]);
});

test('V basic ops', () => {
  const a = { x: 1, y: 2, z: 3 }, b = { x: 4, y: 5, z: 6 };
  assert.deepEqual(V.add(a, b), { x: 5, y: 7, z: 9 });
  assert.deepEqual(V.sub(b, a), { x: 3, y: 3, z: 3 });
  assert.deepEqual(V.scale(a, 2), { x: 2, y: 4, z: 6 });
  assert.equal(V.dot(a, b), 32);
  assert.deepEqual(V.cross({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }), { x: 0, y: 0, z: 1 });
  assert.equal(V.len({ x: 3, y: 4, z: 0 }), 5);
  assert.equal(V.dist(a, { x: 1, y: 2, z: 8 }), 5);
  const n = V.norm({ x: 0, y: 0, z: -7 });
  assert.deepEqual(n, { x: 0, y: 0, z: -1 });
  assert.deepEqual(V.norm({ x: 0, y: 0, z: 0 }), { x: 0, y: 0, z: 0 });
  assert.deepEqual(V.lerp(a, b, 0.5), { x: 2.5, y: 3.5, z: 4.5 });
  assert.deepEqual(V.horiz(a), { x: 1, y: 0, z: 3 });
  const c = V.clone(a); c.x = 9; assert.equal(a.x, 1);
  const s = { x: 0, y: 0, z: 0 }; V.set(s, b); assert.deepEqual(s, b);
});

test('yawDir: yaw 0 faces -Z, yaw +90deg faces -X', () => {
  const d0 = yawDir(0);
  assert.ok(Math.abs(d0.x) < 1e-9 && Math.abs(d0.z + 1) < 1e-9);
  const d90 = yawDir(Math.PI / 2);
  assert.ok(Math.abs(d90.x + 1) < 1e-9 && Math.abs(d90.z) < 1e-9);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/`
Expected: FAIL — `mulberry32 is not a function`.

- [ ] **Step 3: Implement**

Insert after `const CONFIG = {...};` inside the pure block:
```js
// --- PRNG (mulberry32) ---
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Plain {x,y,z} vector helpers (allocating; hot paths reuse via V.set) ---
const V = {
  add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }),
  sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }),
  scale: (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s }),
  dot: (a, b) => a.x * b.x + a.y * b.y + a.z * b.z,
  cross: (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }),
  len: (a) => Math.hypot(a.x, a.y, a.z),
  dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z),
  norm: (a) => { const l = Math.hypot(a.x, a.y, a.z); return l > 0 ? { x: a.x / l, y: a.y / l, z: a.z / l } : { x: 0, y: 0, z: 0 }; },
  lerp: (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }),
  clone: (a) => ({ x: a.x, y: a.y, z: a.z }),
  set: (out, a) => { out.x = a.x; out.y = a.y; out.z = a.z; return out; },
  horiz: (a) => ({ x: a.x, y: 0, z: a.z }),
};

// Camera yaw 0 looks down -Z (Three.js convention)
function yawDir(yaw) { return { x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) }; }
```
Update the export line: `const PURE = { CONFIG, mulberry32, V, yawDir };`

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/`
Expected: `# pass 4`.

- [ ] **Step 5: Commit**

```bash
git add SpiderMan/index.html tests/spiderman.math.test.mjs
git commit -m "Add seeded PRNG and vector helpers to pure block"
```

---

### Task 3: Spatial grid and city generator

**Files:**
- Modify: `SpiderMan/index.html` (pure block)
- Create: `tests/spiderman.city.test.mjs`

**Interfaces:**
- Consumes: `CONFIG`, `mulberry32`.
- Produces:
  - `class SpatialGrid { constructor(cellSize, halfSize); insert(box); query(min, max) → box[] }`
  - `generateCity(seed = CONFIG.citySeed) → { size, buildings, grid, landmarks: { spire, crane }, spawn, props: { cars, lamps }, civilians, streetLine(i) }`
  - Building: `{ id, min:{x,y,z}, max:{x,y,z}, color:int(0..7), kind:'building'|'spire'|'crane'|'craneArm' }`
  - `streetLine(i) = -300 + 50*i`

- [ ] **Step 1: Write the failing tests**

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/`
Expected: FAIL — `SpatialGrid is not a constructor`.

- [ ] **Step 3: Implement**

Add to the pure block after `yawDir`:
```js
// --- Spatial grid: buckets AABBs by XZ cell so collision checks ~10 boxes not 400 ---
class SpatialGrid {
  constructor(cellSize, halfSize) {
    this.cell = cellSize; this.half = halfSize;
    this.n = Math.ceil((halfSize * 2) / cellSize) + 1;
    this.cells = new Map();
    this.all = [];
  }
  _key(cx, cz) { return cx * 100000 + cz; }
  _cell(v) { return Math.floor((v + this.half) / this.cell); }
  insert(box) {
    this.all.push(box);
    for (let cx = this._cell(box.min.x); cx <= this._cell(box.max.x); cx++)
      for (let cz = this._cell(box.min.z); cz <= this._cell(box.max.z); cz++) {
        const k = this._key(cx, cz);
        if (!this.cells.has(k)) this.cells.set(k, []);
        this.cells.get(k).push(box);
      }
  }
  query(min, max) {
    const out = [], seen = new Set();
    for (let cx = this._cell(min.x); cx <= this._cell(max.x); cx++)
      for (let cz = this._cell(min.z); cz <= this._cell(max.z); cz++) {
        const list = this.cells.get(this._key(cx, cz));
        if (!list) continue;
        for (const b of list) {
          if (seen.has(b)) continue; seen.add(b);
          if (b.min.x < max.x && b.max.x > min.x && b.min.y < max.y && b.max.y > min.y && b.min.z < max.z && b.max.z > min.z) out.push(b);
        }
      }
    return out;
  }
}

// --- City generator ---
function generateCity(seed = CONFIG.citySeed) {
  const rng = mulberry32(seed);
  const N = CONFIG.gridN, pitch = CONFIG.blockSize + CONFIG.streetW; // 50
  const size = N * pitch;                                             // 600
  const half = size / 2;
  const streetLine = (i) => -half + pitch * i;
  const buildings = [], cars = [], lamps = [], civilians = [];
  let id = 0;
  const box = (x0, z0, x1, z1, h, color, kind = 'building', y0 = 0) =>
    ({ id: id++, min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y0 + h, z: z1 }, color, kind });

  const pickHeight = (iz) => {
    if (iz === 0) return 8 + rng() * 8;                 // waterfront low-rise 8–16
    if (rng() < 0.1) return 60 + rng() * 60;            // towers 60–120
    return 20 + rng() * 40;                             // 20–60
  };

  for (let ix = 0; ix < N; ix++) for (let iz = 0; iz < N; iz++) {
    const bx = streetLine(ix) + CONFIG.streetW / 2, bz = streetLine(iz) + CONFIG.streetW / 2; // block min corner (5..45)
    const B = CONFIG.blockSize, m = 2;                                                     // 2 m margin from sidewalk
    if (ix === 6 && iz === 6) {                                                            // landmark: central spire
      buildings.push(box(bx + 10, bz + 10, bx + B - 10, bz + B - 10, 130, 7, 'spire'));
      continue;
    }
    if (ix === 6 && iz === 0) {                                                            // landmark: waterfront crane
      buildings.push(box(bx + 18, bz + 18, bx + 22, bz + 22, 50, 6, 'crane'));
      buildings.push(box(bx + 2, bz + 19, bx + B - 2, bz + 21, 2, 6, 'craneArm', 48));
      continue;
    }
    const count = 1 + Math.floor(rng() * 4);                                               // 1–4 lots
    let lots;
    if (count === 1) lots = [[0, 0, B, B]];
    else if (count === 2) lots = rng() < 0.5 ? [[0, 0, B / 2, B], [B / 2, 0, B, B]] : [[0, 0, B, B / 2], [0, B / 2, B, B]];
    else {
      lots = [[0, 0, B / 2, B / 2], [B / 2, 0, B, B / 2], [0, B / 2, B / 2, B], [B / 2, B / 2, B, B]];
      if (count === 3) lots.splice(Math.floor(rng() * 4), 1);
    }
    for (const [lx0, lz0, lx1, lz1] of lots) {
      const shrink = m + rng() * 3;
      buildings.push(box(bx + lx0 + shrink, bz + lz0 + shrink, bx + lx1 - shrink, bz + lz1 - shrink, pickHeight(iz), Math.floor(rng() * 8)));
    }
  }

  // Street props: cars and lamps along each street line, civilians on sidewalks
  for (let i = 0; i <= N; i++) {
    const line = streetLine(i);
    for (let t = -half + 10; t < half - 10; t += 18) {
      if (rng() < 0.5) cars.push({ x: line + (rng() < 0.5 ? -2.5 : 2.5), z: t + rng() * 6, dir: 0, color: Math.floor(rng() * 8) });
      if (rng() < 0.5) cars.push({ x: t + rng() * 6, z: line + (rng() < 0.5 ? -2.5 : 2.5), dir: 1, color: Math.floor(rng() * 8) });
      lamps.push({ x: line + 4.5, z: t }, { x: t, z: line + 4.5 });
      if (rng() < 0.6) civilians.push({ x: line + 4.6, z: t + rng() * 10, dir: rng() < 0.5 ? 1 : -1, axis: 'z', phase: rng() * 6.28 });
      if (rng() < 0.6) civilians.push({ x: t + rng() * 10, z: line + 4.6, dir: rng() < 0.5 ? 1 : -1, axis: 'x', phase: rng() * 6.28 });
    }
  }

  const grid = new SpatialGrid(pitch, half);
  for (const b of buildings) grid.insert(b);

  const spire = buildings.find(b => b.kind === 'spire');
  const crane = buildings.find(b => b.kind === 'crane');
  // spawn: roof of the first building in block (5,7)
  const sbx = streetLine(5) + 5, sbz = streetLine(7) + 5;
  const spawnB = buildings.find(b => b.kind === 'building' && b.min.x >= sbx && b.max.x <= sbx + 40 && b.min.z >= sbz && b.max.z <= sbz + 40);
  const spawn = { x: (spawnB.min.x + spawnB.max.x) / 2, y: spawnB.max.y, z: (spawnB.min.z + spawnB.max.z) / 2 };

  return { size, half, buildings, grid, landmarks: { spire, crane }, spawn, props: { cars, lamps }, civilians, streetLine };
}
```
Update exports: `const PURE = { CONFIG, mulberry32, V, yawDir, SpatialGrid, generateCity };`

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/`
Expected: `# pass 8`. If the towers-ratio assertion fails for this seed, change `CONFIG.citySeed` to a neighbouring value (e.g. `20260905`) and update `tests/spiderman.config.test.mjs` to match — do not loosen the assertion.

- [ ] **Step 5: Commit**

```bash
git add SpiderMan/index.html tests/spiderman.city.test.mjs
git commit -m "Add spatial grid and seeded city generator"
```

---

### Task 4: AABB collision and raycast

**Files:**
- Modify: `SpiderMan/index.html` (pure block)
- Create: `tests/spiderman.collision.test.mjs`

**Interfaces:**
- Consumes: `CONFIG`, `SpatialGrid`.
- Produces:
  - `resolveCollisions(pos, vel, grid) → { onGround: bool, wall: { normal:{x,y,z}, building } | null }` — mutates `pos` (feet) and `vel`. Hero is treated as a box of `CONFIG.heroRadius` × `CONFIG.heroHeight`.
  - `raycastAABBs(origin, dir, grid, maxDist) → { point, normal, building, dist } | null`.

- [ ] **Step 1: Write the failing tests**

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/`
Expected: FAIL — `resolveCollisions is not a function`.

- [ ] **Step 3: Implement**

Add to the pure block after `generateCity`:
```js
// --- Collision: hero box (feet at pos) vs AABBs, minimum-penetration axis resolve ---
function resolveCollisions(pos, vel, grid) {
  const r = CONFIG.heroRadius, h = CONFIG.heroHeight;
  let onGround = false, wall = null;
  if (pos.y < 0) { pos.y = 0; if (vel.y < 0) vel.y = 0; onGround = true; }
  const min = { x: pos.x - r, y: pos.y, z: pos.z - r }, max = { x: pos.x + r, y: pos.y + h, z: pos.z + r };
  const candidates = grid.query({ x: min.x - 1, y: min.y - 1, z: min.z - 1 }, { x: max.x + 1, y: max.y + 1, z: max.z + 1 });
  for (const b of candidates) {
    min.x = pos.x - r; min.y = pos.y; min.z = pos.z - r; max.x = pos.x + r; max.y = pos.y + h; max.z = pos.z + r;
    const ox = Math.min(max.x - b.min.x, b.max.x - min.x);
    const oy = Math.min(max.y - b.min.y, b.max.y - min.y);
    const oz = Math.min(max.z - b.min.z, b.max.z - min.z);
    if (ox <= 0 || oy <= 0 || oz <= 0) continue;
    if (oy <= ox && oy <= oz) {
      if (pos.y + h / 2 > (b.min.y + b.max.y) / 2) { pos.y = b.max.y; if (vel.y < 0) vel.y = 0; onGround = true; }
      else { pos.y = b.min.y - h; if (vel.y > 0) vel.y = 0; }
    } else if (ox <= oz) {
      const side = pos.x > (b.min.x + b.max.x) / 2 ? 1 : -1;
      pos.x = side > 0 ? b.max.x + r : b.min.x - r;
      if (vel.x * side < 0) vel.x = 0;
      wall = { normal: { x: side, y: 0, z: 0 }, building: b };
    } else {
      const side = pos.z > (b.min.z + b.max.z) / 2 ? 1 : -1;
      pos.z = side > 0 ? b.max.z + r : b.min.z - r;
      if (vel.z * side < 0) vel.z = 0;
      wall = { normal: { x: 0, y: 0, z: side }, building: b };
    }
  }
  return { onGround, wall };
}

// --- Ray vs AABBs (slab method); returns nearest hit ---
function raycastAABBs(origin, dir, grid, maxDist) {
  const end = { x: origin.x + dir.x * maxDist, y: origin.y + dir.y * maxDist, z: origin.z + dir.z * maxDist };
  const qmin = { x: Math.min(origin.x, end.x), y: Math.min(origin.y, end.y), z: Math.min(origin.z, end.z) };
  const qmax = { x: Math.max(origin.x, end.x), y: Math.max(origin.y, end.y), z: Math.max(origin.z, end.z) };
  let best = null;
  for (const b of grid.query(qmin, qmax)) {
    let tmin = 0, tmax = maxDist, axis = -1, sign = 0;
    for (const k of ['x', 'y', 'z']) {
      const inv = 1 / dir[k];
      let t1 = (b.min[k] - origin[k]) * inv, t2 = (b.max[k] - origin[k]) * inv, s = -1;
      if (t1 > t2) { [t1, t2] = [t2, t1]; s = 1; }
      if (t1 > tmin) { tmin = t1; axis = k; sign = s; }
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) { tmin = Infinity; break; }
    }
    if (tmin === Infinity || tmin > maxDist || axis === -1) continue;
    if (!best || tmin < best.dist) {
      const normal = { x: 0, y: 0, z: 0 }; normal[axis] = sign;
      best = { dist: tmin, normal, building: b, point: { x: origin.x + dir.x * tmin, y: origin.y + dir.y * tmin, z: origin.z + dir.z * tmin } };
    }
  }
  return best;
}
```
Update exports: add `resolveCollisions, raycastAABBs`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/`
Expected: `# pass 13`.

- [ ] **Step 5: Commit**

```bash
git add SpiderMan/index.html tests/spiderman.collision.test.mjs
git commit -m "Add AABB collision resolve and raycast"
```

---

### Task 5: Anchor selection

**Files:**
- Modify: `SpiderMan/index.html` (pure block)
- Create: `tests/spiderman.anchor.test.mjs`

**Interfaces:**
- Consumes: `CONFIG`, `V`, `SpatialGrid`.
- Produces: `findAnchor(pos, forward, grid) → { x, y, z, sky: bool } | null`. `pos` is the hero's feet; `forward` is a horizontal unit vector. Never returns `null` when `pos.y < 200` (sky fallback).

- [ ] **Step 1: Write the failing tests**

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/`
Expected: FAIL — `findAnchor is not a function`.

- [ ] **Step 3: Implement**

Add to the pure block after `raycastAABBs`:
```js
// --- Auto-anchor: best roof edge/corner in a forward cone; sky fallback ---
function findAnchor(pos, forward, grid) {
  const head = { x: pos.x, y: pos.y + CONFIG.heroHeight, z: pos.z };
  const maxD = CONFIG.anchorMaxDist, cosCone = Math.cos(CONFIG.anchorConeDeg * Math.PI / 180);
  const qmin = { x: head.x - maxD, y: head.y + CONFIG.anchorMinAbove, z: head.z - maxD };
  const qmax = { x: head.x + maxD, y: 1000, z: head.z + maxD };
  let best = null, bestScore = -Infinity;
  for (const b of grid.query(qmin, qmax)) {
    if (b.max.y < head.y + CONFIG.anchorMinAbove) continue;
    // candidate points: 4 roof corners + 4 roof edge midpoints
    const xs = [b.min.x, b.max.x, (b.min.x + b.max.x) / 2], zs = [b.min.z, b.max.z, (b.min.z + b.max.z) / 2];
    for (const x of xs) for (const z of zs) {
      if (x === xs[2] && z === zs[2]) continue;               // skip roof centre
      const c = { x, y: b.max.y, z };
      const d = V.sub(c, head), dh = { x: d.x, y: 0, z: d.z };
      const distH = V.len(dh), dist = V.len(d);
      if (dist < CONFIG.anchorMinDist || dist > maxD || distH < 1e-6) continue;
      const cosA = V.dot(dh, forward) / distH;
      if (cosA < cosCone) continue;
      // prefer forward-aligned, moderately high, mid-range anchors
      const height = d.y / dist;                             // 0..1
      const score = cosA * 2 + height * 1.5 - Math.abs(dist - 40) / 40;
      if (score > bestScore) { bestScore = score; best = { x, y: b.max.y, z, sky: false }; }
    }
  }
  if (best) return best;
  if (pos.y >= 200) return null;
  const s = 30;
  return { x: head.x + forward.x * s, y: head.y + CONFIG.skyAnchorHeight, z: head.z + forward.z * s, sky: true };
}
```
Update exports: add `findAnchor`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/`
Expected: `# pass 17`.

- [ ] **Step 5: Commit**

```bash
git add SpiderMan/index.html tests/spiderman.anchor.test.mjs
git commit -m "Add forward-cone auto-anchor selection with sky fallback"
```

---

### Task 6: Hero state machine — Ground and Air

**Files:**
- Modify: `SpiderMan/index.html` (pure block)
- Create: `tests/spiderman.hero.test.mjs`

**Interfaces:**
- Consumes: `CONFIG`, `V`, `yawDir`, `resolveCollisions`, `findAnchor`, `raycastAABBs`.
- Produces:
  - `createHero(spawn) → hero` where `hero = { pos, vel, state:'ground'|'air'|'swing'|'crawl'|'zip', facing:{x,y,z}, anchor:null|{x,y,z}, ropeLen, ropeLen0, swingTime, wall:null|{normal,building}, zipTarget:null, lastJumpTime, time, landedSpeed }`.
  - `makeInput() → { forward:0, strafe:0, jump:false, jumpHeld:false, sprint:false, swing:false, zip:false, camYaw:0, camPitch:0 }` (`jump`/`zip` are edge-triggered "pressed this step").
  - `stepHero(hero, input, dt, world) → events[]` where `world = { grid }`, events are `{ type: 'jump'|'land'|'swingStart'|'swingRelease'|'crawlStart'|'zipStart'|'zipEnd'|'wallJump', ... }`.

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { PURE } from './pure.mjs';
const { CONFIG, SpatialGrid, createHero, makeInput, stepHero } = PURE;

function world(...boxes) { const g = new SpatialGrid(50, 300); boxes.forEach((b, i) => g.insert({ id: i, kind: 'building', ...b })); return { grid: g }; }
const DT = 1 / 60;
function run(hero, input, w, steps) { const ev = []; for (let i = 0; i < steps; i++) { ev.push(...stepHero(hero, input, DT, w)); input.jump = false; input.zip = false; } return ev; }

test('createHero starts grounded at spawn', () => {
  const h = createHero({ x: 1, y: 30, z: 2 });
  assert.deepEqual(h.pos, { x: 1, y: 30, z: 2 }); assert.deepEqual(h.vel, { x: 0, y: 0, z: 0 }); assert.equal(h.state, 'ground');
});

test('ground: W accelerates toward run speed in camera-forward direction; sprint is faster', () => {
  const w = world();
  const h = createHero({ x: 0, y: 0, z: 0 });
  const inp = makeInput(); inp.forward = 1; inp.camYaw = 0;
  run(h, inp, w, 120);
  assert.ok(h.vel.z < -CONFIG.runSpeed * 0.95 && h.vel.z > -CONFIG.runSpeed * 1.05, `vel.z ${h.vel.z}`);
  assert.ok(Math.abs(h.vel.x) < 1e-6);
  inp.sprint = true; run(h, inp, w, 120);
  assert.ok(Math.abs(-h.vel.z - CONFIG.sprintSpeed) < 0.5);
  assert.equal(h.state, 'ground');
});

test('ground: releasing keys slows to a stop', () => {
  const w = world(); const h = createHero({ x: 0, y: 0, z: 0 });
  const inp = makeInput(); inp.forward = 1; run(h, inp, w, 60); inp.forward = 0; run(h, inp, w, 120);
  assert.ok(Math.abs(h.vel.z) < 0.1);
});

test('jump enters air and lands again; double-tap gives high jump', () => {
  const w = world(); const h = createHero({ x: 0, y: 0, z: 0 });
  const inp = makeInput(); inp.jump = true;
  const ev = run(h, inp, w, 1);
  assert.equal(h.state, 'air'); assert.equal(ev[0].type, 'jump'); assert.ok(Math.abs(h.vel.y - CONFIG.jumpSpeed) < 1e-6);
  let peak = 0; const ev2 = run(h, inp, w, 180); for (const e of ev2) if (e.type === 'land') peak = e.fallSpeed;
  assert.equal(h.state, 'ground'); assert.ok(ev2.some(e => e.type === 'land'));
  // double tap: jump, land, jump again within window
  inp.jump = true; run(h, inp, w, 1);
  assert.ok(Math.abs(h.vel.y - CONFIG.highJumpSpeed) < 1e-6, `high jump ${h.vel.y}`);
});

test('air: gravity applies and falling is capped; walking off a roof → air', () => {
  const roof = { min: { x: -5, y: 0, z: -5 }, max: { x: 5, y: 30, z: 5 } };
  const w = world(roof); const h = createHero({ x: 0, y: 30, z: 0 });
  const inp = makeInput(); inp.forward = 1;
  run(h, inp, w, 90);                       // runs off the -Z edge
  assert.equal(h.state, 'air'); assert.ok(h.vel.y < 0);
  run(h, inp, w, 600);
  assert.ok(h.vel.y === 0 && h.state === 'ground' && h.pos.y === 0);
});

test('air: hitting a wall while moving into it starts crawl; wall jump from air pushes away', () => {
  const wallB = { min: { x: -50, y: 0, z: -40 }, max: { x: 50, y: 60, z: -20 } };
  const w = world(wallB); const h = createHero({ x: 0, y: 0, z: 0 });
  const inp = makeInput(); inp.forward = 1; inp.sprint = true; inp.jump = true;
  const ev = run(h, inp, w, 240);
  assert.ok(ev.some(e => e.type === 'crawlStart'));
  assert.equal(h.state, 'crawl'); assert.deepEqual(h.wall.normal, { x: 0, y: 0, z: 1 });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/`
Expected: FAIL — `createHero is not a function`.

- [ ] **Step 3: Implement**

Add to the pure block after `findAnchor`:
```js
// --- Hero ---
function createHero(spawn) {
  return {
    pos: V.clone(spawn), vel: { x: 0, y: 0, z: 0 }, state: 'ground', facing: { x: 0, y: 0, z: -1 },
    anchor: null, ropeLen: 0, ropeLen0: 0, swingTime: 0, wall: null, zipTarget: null, zipNormal: null,
    lastJumpTime: -10, time: 0, landedSpeed: 0,
  };
}
function makeInput() {
  return { forward: 0, strafe: 0, jump: false, jumpHeld: false, sprint: false, swing: false, zip: false, camYaw: 0, camPitch: 0 };
}

// Desired horizontal move direction from WASD relative to camera yaw (unit or zero)
function moveDir(input) {
  const f = yawDir(input.camYaw), r = { x: -f.z, y: 0, z: f.x };
  const d = { x: f.x * input.forward + r.x * input.strafe, y: 0, z: f.z * input.forward + r.z * input.strafe };
  return V.norm(d);
}

function applyGravity(hero, dt) {
  hero.vel.y = Math.max(hero.vel.y - CONFIG.gravity * dt, -CONFIG.maxFall);
}
function integrate(hero, dt) {
  hero.pos.x += hero.vel.x * dt; hero.pos.y += hero.vel.y * dt; hero.pos.z += hero.vel.z * dt;
}
function updateFacing(hero) {
  const hv = V.horiz(hero.vel);
  if (V.len(hv) > 0.5) hero.facing = V.norm(hv);
}
function tryJump(hero, input, events) {
  if (!input.jump) return false;
  const high = hero.time - hero.lastJumpTime < CONFIG.doubleTapWindow + 1.0 && hero.landedSpeed > 0; // landed recently after a jump
  hero.vel.y = high ? CONFIG.highJumpSpeed : CONFIG.jumpSpeed;
  hero.lastJumpTime = hero.time; hero.landedSpeed = 0;
  hero.state = 'air';
  events.push({ type: 'jump', high });
  return true;
}

function stepGround(hero, input, dt, world, events) {
  const dir = moveDir(input);
  const target = V.scale(dir, input.sprint ? CONFIG.sprintSpeed : CONFIG.runSpeed);
  const hv = V.horiz(hero.vel);
  const diff = V.sub(target, hv);
  const accel = V.len(dir) > 0 ? CONFIG.groundAccel : CONFIG.groundFriction * Math.max(V.len(hv), 1);
  const step = Math.min(V.len(diff), accel * dt);
  const nv = V.add(hv, V.scale(V.norm(diff), step));
  hero.vel.x = nv.x; hero.vel.z = nv.z;
  if (tryJump(hero, input, events)) { integrate(hero, dt); resolveCollisions(hero.pos, hero.vel, world.grid); return; }
  if (input.swing && startSwing(hero, input, world, events)) return;
  hero.vel.y = -1;                                   // keep contact with the floor
  integrate(hero, dt);
  const c = resolveCollisions(hero.pos, hero.vel, world.grid);
  if (!c.onGround) { hero.state = 'air'; hero.vel.y = 0; }
}

function stepAir(hero, input, dt, world, events) {
  if (input.swing && startSwing(hero, input, world, events)) return;
  if (input.zip && startZip(hero, input, world, events)) return;
  const dir = moveDir(input);
  hero.vel.x += dir.x * CONFIG.airSteer * dt; hero.vel.z += dir.z * CONFIG.airSteer * dt;
  applyGravity(hero, dt);
  const before = hero.vel.y;
  integrate(hero, dt);
  const c = resolveCollisions(hero.pos, hero.vel, world.grid);
  if (c.onGround) {
    hero.state = 'ground'; hero.landedSpeed = -before;
    events.push({ type: 'land', fallSpeed: -before });
    return;
  }
  if (c.wall) {
    if (input.jump) {                                 // wall jump
      hero.vel = V.add(V.scale(c.wall.normal, CONFIG.wallJumpOut), { x: 0, y: CONFIG.wallJumpUp, z: 0 });
      events.push({ type: 'wallJump' }); return;
    }
    const intoWall = V.dot(V.horiz(moveDir(input)), c.wall.normal) < -0.3 || V.len(V.horiz(hero.vel)) < 0.5;
    if (hero.pos.y > 1 && intoWall !== false) { startCrawl(hero, c.wall, events); return; }
  }
}

// placeholders replaced in Tasks 7–8
function startSwing() { return false; }
function startZip() { return false; }
function startCrawl(hero, wall, events) { hero.state = 'crawl'; hero.wall = wall; hero.vel = { x: 0, y: 0, z: 0 }; events.push({ type: 'crawlStart' }); }
function stepSwing() {} function stepCrawl() {} function stepZip() {}

function stepHero(hero, input, dt, world) {
  const events = [];
  hero.time += dt;
  switch (hero.state) {
    case 'ground': stepGround(hero, input, dt, world, events); break;
    case 'air': stepAir(hero, input, dt, world, events); break;
    case 'swing': stepSwing(hero, input, dt, world, events); break;
    case 'crawl': stepCrawl(hero, input, dt, world, events); break;
    case 'zip': stepZip(hero, input, dt, world, events); break;
  }
  updateFacing(hero);
  return events;
}
```
Update exports: add `createHero, makeInput, stepHero, moveDir`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/`
Expected: `# pass 23`. If the crawl test fails because the hero lands before reaching the wall, the wall is 20 m away and a sprint-jump covers ~12 m/s × ~1 s — the test runs 240 steps (4 s) so the hero reaches it on foot and, on contact with `forward` held, `stepGround` transitions to air only when leaving ground; so on **ground** contact with a wall the hero must also start crawling. Add to `stepGround` after `resolveCollisions`: `if (c.wall && V.dot(moveDir(input), c.wall.normal) < -0.3) { startCrawl(hero, c.wall, events); return; }`.

- [ ] **Step 5: Commit**

```bash
git add SpiderMan/index.html tests/spiderman.hero.test.mjs
git commit -m "Add hero ground/air state machine with jump, landing, wall contact"
```

---

### Task 7: Hero state machine — Swing

**Files:**
- Modify: `SpiderMan/index.html` (pure block: replace `startSwing`/`stepSwing` placeholders)
- Modify: `tests/spiderman.hero.test.mjs` (append)

**Interfaces:**
- Consumes: `findAnchor`, hero fields `anchor, ropeLen, ropeLen0, swingTime`.
- Produces: events `swingStart {anchor}`, `swingRelease {bonus:bool}`.

- [ ] **Step 1: Write the failing tests** (append to `tests/spiderman.hero.test.mjs`)

```js
test('swing: holding swing from a rooftop attaches a rope and keeps hero within rope length', () => {
  const start = { min: { x: -5, y: 0, z: -5 }, max: { x: 5, y: 30, z: 5 } };
  const tall = { min: { x: -10, y: 0, z: -60 }, max: { x: 10, y: 70, z: -40 } };
  const w = world(start, tall); const h = createHero({ x: 0, y: 30, z: 0 });
  const inp = makeInput(); inp.forward = 1; inp.sprint = true; run(h, inp, w, 30);
  inp.swing = true;
  const ev = run(h, inp, w, 1);
  assert.equal(h.state, 'swing'); assert.equal(ev[0].type, 'swingStart'); assert.ok(h.anchor && !h.anchor.sky);
  const L0 = h.ropeLen;
  for (let i = 0; i < 90; i++) {
    stepHero(h, inp, DT, w);
    if (h.state !== 'swing') break;
    const d = Math.hypot(h.pos.x - h.anchor.x, h.pos.y + CONFIG.heroHeight - h.anchor.y, h.pos.z - h.anchor.z);
    assert.ok(d <= h.ropeLen + 0.05, `rope stretched ${d} > ${h.ropeLen}`);
  }
  assert.ok(h.ropeLen < L0, 'rope shortens over the arc');
});

test('swing: release on the upswing gives a velocity bonus and returns to air', () => {
  const start = { min: { x: -5, y: 0, z: -5 }, max: { x: 5, y: 30, z: 5 } };
  const tall = { min: { x: -10, y: 0, z: -60 }, max: { x: 10, y: 70, z: -40 } };
  const w = world(start, tall); const h = createHero({ x: 0, y: 30, z: 0 });
  const inp = makeInput(); inp.forward = 1; inp.sprint = true; run(h, inp, w, 30);
  inp.swing = true; run(h, inp, w, 1);
  // swing until we pass the bottom and start rising
  let guard = 0; while (h.vel.y <= 0 && guard++ < 600) stepHero(h, inp, DT, w);
  assert.equal(h.state, 'swing');
  const speedBefore = Math.hypot(h.vel.x, h.vel.y, h.vel.z);
  inp.swing = false;
  const ev = stepHero(h, inp, DT, w);
  assert.equal(h.state, 'air');
  assert.equal(ev[0].type, 'swingRelease'); assert.equal(ev[0].bonus, true);
  const speedAfter = Math.hypot(h.vel.x, h.vel.y, h.vel.z);
  assert.ok(speedAfter > speedBefore * 1.1, `bonus ${speedBefore} → ${speedAfter}`);
});

test('swing: from ground with nothing ahead uses the sky anchor', () => {
  const w = world(); const h = createHero({ x: 0, y: 0, z: 0 });
  const inp = makeInput(); inp.swing = true; run(h, inp, w, 1);
  assert.equal(h.state, 'swing'); assert.equal(h.anchor.sky, true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/`
Expected: FAIL — `state` is `'ground'`/`'air'` not `'swing'`.

- [ ] **Step 3: Implement** — replace the `startSwing` and `stepSwing` placeholders:

```js
function startSwing(hero, input, world, events) {
  const hv = V.horiz(hero.vel);
  const fwd = V.len(hv) > 2 ? V.norm(hv) : yawDir(input.camYaw);
  const a = findAnchor(hero.pos, fwd, world.grid);
  if (!a) return false;
  hero.anchor = a;
  const head = { x: hero.pos.x, y: hero.pos.y + CONFIG.heroHeight, z: hero.pos.z };
  hero.ropeLen0 = hero.ropeLen = V.dist(head, a);
  hero.swingTime = 0;
  hero.state = 'swing';
  if (hero.vel.y < 0) hero.vel.y *= 0.5;            // soften the catch
  events.push({ type: 'swingStart', anchor: a });
  return true;
}

function stepSwing(hero, input, dt, world, events) {
  hero.swingTime += dt;
  const head = () => ({ x: hero.pos.x, y: hero.pos.y + CONFIG.heroHeight, z: hero.pos.z });
  // release?
  const toAnchorH = V.horiz(V.sub(hero.anchor, hero.pos));
  const passed = hero.swingTime > CONFIG.swingAutoReleaseDelay && V.dot(V.horiz(hero.vel), toAnchorH) < 0 && hero.vel.y > 0;
  if (!input.swing || passed) {
    const bonus = hero.vel.y > 0;
    if (bonus) hero.vel = V.scale(hero.vel, CONFIG.releaseBonus);
    hero.anchor = null; hero.state = 'air';
    events.push({ type: 'swingRelease', bonus, auto: passed });
    return;
  }
  // forces: gravity, pump along velocity (W), lateral (A/D)
  applyGravity(hero, dt);
  const f = yawDir(input.camYaw), r = { x: -f.z, y: 0, z: f.x };
  if (input.forward > 0 && V.len(hero.vel) > 0.1) hero.vel = V.add(hero.vel, V.scale(V.norm(hero.vel), CONFIG.ropePump * dt));
  hero.vel = V.add(hero.vel, V.scale(r, input.strafe * CONFIG.swingLateral * dt));
  // rope shortens over the arc
  hero.ropeLen = Math.max(hero.ropeLen0 * CONFIG.ropeMinFrac, hero.ropeLen - hero.ropeLen0 * CONFIG.ropeShortenRate * dt);
  integrate(hero, dt);
  // rope constraint: project head onto sphere, remove outward velocity
  const d = V.sub(head(), hero.anchor);
  const L = V.len(d);
  if (L > hero.ropeLen) {
    const n = V.scale(d, 1 / L);
    const corrected = V.add(hero.anchor, V.scale(n, hero.ropeLen));
    hero.pos.x = corrected.x; hero.pos.y = corrected.y - CONFIG.heroHeight; hero.pos.z = corrected.z;
    const vn = V.dot(hero.vel, n);
    if (vn > 0) hero.vel = V.sub(hero.vel, V.scale(n, vn));
  }
  const c = resolveCollisions(hero.pos, hero.vel, world.grid);
  if (c.onGround) { hero.anchor = null; hero.state = 'ground'; events.push({ type: 'swingRelease', bonus: false, auto: true }, { type: 'land', fallSpeed: 0 }); }
  else if (c.wall && V.dot(V.horiz(hero.vel), c.wall.normal) <= 0) { hero.anchor = null; startCrawl(hero, c.wall, events); }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/`
Expected: `# pass 26`.

- [ ] **Step 5: Commit**

```bash
git add SpiderMan/index.html tests/spiderman.hero.test.mjs
git commit -m "Add swing state: rope constraint, pump, shortening, release bonus"
```

---

### Task 8: Hero state machine — Crawl and Zip

**Files:**
- Modify: `SpiderMan/index.html` (pure block: replace `stepCrawl`, `startZip`, `stepZip`)
- Modify: `tests/spiderman.hero.test.mjs` (append)

**Interfaces:**
- Consumes: `raycastAABBs`, `input.camPitch`.
- Produces: events `zipStart {target}`, `zipEnd`, `crawlStart`. `startZip` aims from the hero's head along `camYaw/camPitch`.

- [ ] **Step 1: Write the failing tests** (append)

```js
test('crawl: W climbs the wall, reaching the roof puts hero on top', () => {
  const wallB = { min: { x: -50, y: 0, z: -40 }, max: { x: 50, y: 12, z: -20 } };
  const w = world(wallB); const h = createHero({ x: 0, y: 0, z: 0 });
  const inp = makeInput(); inp.forward = 1;
  run(h, inp, w, 200);                       // walk into wall → crawl
  assert.equal(h.state, 'crawl');
  const y0 = h.pos.y;
  run(h, inp, w, 60);
  assert.ok(h.pos.y > y0 + 3, `climbed ${h.pos.y - y0}`);
  run(h, inp, w, 400);
  assert.equal(h.state, 'ground'); assert.equal(h.pos.y, 12); assert.ok(h.pos.z < -20, 'on the roof, not floating at the edge');
});

test('crawl: A/D moves along the wall; Space jumps away from it', () => {
  const wallB = { min: { x: -50, y: 0, z: -40 }, max: { x: 50, y: 60, z: -20 } };
  const w = world(wallB); const h = createHero({ x: 0, y: 0, z: 0 });
  const inp = makeInput(); inp.forward = 1; run(h, inp, w, 200); assert.equal(h.state, 'crawl');
  inp.forward = 0; inp.strafe = 1; const x0 = h.pos.x; run(h, inp, w, 60);
  assert.ok(Math.abs(h.pos.x - x0) > 3, 'moved sideways');
  assert.ok(Math.abs(h.pos.z - (-20 + CONFIG.heroRadius)) < 1e-6, 'still glued');
  inp.strafe = 0; inp.jump = true; const ev = run(h, inp, w, 1);
  assert.equal(h.state, 'air'); assert.equal(ev[0].type, 'wallJump'); assert.ok(h.vel.z > 0 && h.vel.y > 0);
});

test('zip: E while aiming at a roof dashes there and lands', () => {
  const target = { min: { x: -10, y: 0, z: -50 }, max: { x: 10, y: 30, z: -30 } };
  const w = world(target); const h = createHero({ x: 0, y: 0, z: 0 });
  const inp = makeInput(); inp.jump = true; run(h, inp, w, 2);          // must be airborne to zip
  inp.camYaw = 0; inp.camPitch = Math.atan2(30 - 1.8, 30);             // aim at the roof's near edge
  inp.zip = true; const ev = run(h, inp, w, 1);
  assert.equal(h.state, 'zip', JSON.stringify(ev)); assert.equal(ev[0].type, 'zipStart');
  const ev2 = run(h, inp, w, 120);
  assert.ok(ev2.some(e => e.type === 'zipEnd'));
  assert.ok(h.state === 'ground' || h.state === 'crawl');
  assert.ok(h.pos.y >= 29.9, `arrived high ${h.pos.y}`);
});

test('zip: nothing in range → no state change', () => {
  const w = world(); const h = createHero({ x: 0, y: 0, z: 0 });
  const inp = makeInput(); inp.jump = true; run(h, inp, w, 2); inp.zip = true; run(h, inp, w, 1);
  assert.equal(h.state, 'air');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/`
Expected: FAIL — crawl never climbs / zip never starts.

- [ ] **Step 3: Implement** — replace `stepCrawl`, `startZip`, `stepZip`:

```js
function stepCrawl(hero, input, dt, world, events) {
  const n = hero.wall.normal, b = hero.wall.building;
  if (input.swing && startSwing(hero, input, world, events)) return;
  if (input.jump) {
    hero.vel = V.add(V.scale(n, CONFIG.wallJumpOut), { x: 0, y: CONFIG.wallJumpUp, z: 0 });
    hero.state = 'air'; hero.wall = null; events.push({ type: 'wallJump' }); return;
  }
  // tangent along the wall (horizontal), signed so that camera-right maps to tangent-right
  const t = { x: -n.z, y: 0, z: n.x };
  const camR = (() => { const f = yawDir(input.camYaw); return { x: -f.z, y: 0, z: f.x }; })();
  const sideSign = V.dot(t, camR) >= 0 ? 1 : -1;
  hero.vel = V.add(V.scale(t, input.strafe * sideSign * CONFIG.crawlSpeed), { x: 0, y: input.forward * CONFIG.crawlSpeed, z: 0 });
  integrate(hero, dt);
  // glue to face
  const r = CONFIG.heroRadius;
  if (n.x !== 0) hero.pos.x = (n.x > 0 ? b.max.x : b.min.x) + n.x * r;
  else hero.pos.z = (n.z > 0 ? b.max.z : b.min.z) + n.z * r;
  // reached the roof: hop on top
  if (hero.pos.y + CONFIG.heroHeight * 0.5 >= b.max.y) {
    hero.pos.y = b.max.y;
    hero.pos.x -= n.x * (r * 2 + 0.2); hero.pos.z -= n.z * (r * 2 + 0.2);
    hero.vel = { x: 0, y: 0, z: 0 }; hero.state = 'ground'; hero.wall = null;
    events.push({ type: 'land', fallSpeed: 0 }); return;
  }
  if (hero.pos.y <= 0) { hero.pos.y = 0; hero.state = 'ground'; hero.wall = null; return; }
  // slid off the side of the face → fall
  const lo = n.x !== 0 ? b.min.z : b.min.x, hi = n.x !== 0 ? b.max.z : b.max.x, along = n.x !== 0 ? hero.pos.z : hero.pos.x;
  if (along < lo - r || along > hi + r) { hero.state = 'air'; hero.wall = null; }
}

function startZip(hero, input, world, events) {
  const head = { x: hero.pos.x, y: hero.pos.y + CONFIG.heroHeight, z: hero.pos.z };
  const f = yawDir(input.camYaw), cp = Math.cos(input.camPitch);
  const dir = { x: f.x * cp, y: Math.sin(input.camPitch), z: f.z * cp };
  const hit = raycastAABBs(head, dir, world.grid, CONFIG.zipMaxDist);
  if (!hit) return false;
  // land on the surface: stand on roofs, hang on walls
  hero.zipNormal = hit.normal;
  hero.zipTarget = hit.normal.y > 0.5
    ? { x: hit.point.x, y: hit.point.y, z: hit.point.z }
    : { x: hit.point.x + hit.normal.x * CONFIG.heroRadius, y: hit.point.y - CONFIG.heroHeight * 0.5, z: hit.point.z + hit.normal.z * CONFIG.heroRadius };
  hero.zipBuilding = hit.building;
  hero.state = 'zip'; hero.anchor = null;
  events.push({ type: 'zipStart', target: hero.zipTarget });
  return true;
}

function stepZip(hero, input, dt, world, events) {
  const to = V.sub(hero.zipTarget, hero.pos), d = V.len(to);
  const stepLen = CONFIG.zipSpeed * dt;
  if (d <= stepLen) {
    V.set(hero.pos, hero.zipTarget);
    const n = hero.zipNormal;
    hero.vel = { x: 0, y: 0, z: 0 };
    if (n.y > 0.5) { hero.state = 'ground'; }
    else { startCrawl(hero, { normal: n, building: hero.zipBuilding }, events); }
    hero.zipTarget = null;
    events.push({ type: 'zipEnd' });
    return;
  }
  hero.vel = V.scale(to, CONFIG.zipSpeed / d);
  integrate(hero, dt);
}
```
Also allow zip from the ground: in `stepGround`, after the swing check add `if (input.zip && startZip(hero, input, world, events)) return;`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/`
Expected: `# pass 30`.

- [ ] **Step 5: Commit**

```bash
git add SpiderMan/index.html tests/spiderman.hero.test.mjs
git commit -m "Add crawl and zip states"
```

---

### Task 9: Mission objective system

**Files:**
- Modify: `SpiderMan/index.html` (pure block)
- Create: `tests/spiderman.mission.test.mjs`

**Interfaces:**
- Produces:
  - `createMission(def) → { id, title, steps, current, state:'active'|'complete', timer:0 }` where `def = { id, title, steps: [step] }`.
  - Step shapes: `{ type:'reach', target, radius, text }`, `{ type:'collect', tokenIds:[], text }`, `{ type:'chase', maxDist, loseDist, duration, text }`, `{ type:'webUp', thugIds:[], text }`, `{ type:'interact', target, radius, text }`.
  - `updateMission(m, ctx, dt) → events[]` with `ctx = { heroPos, tokens:{id→{pos,collected}}, thugs:{id→{pos,webbed}}, vanPos, webPressed, interactPressed }`. Events: `stepComplete {index}`, `missionComplete`, `chaseLost`, `thugWebbed {id}`, `tokenCollected {id}`.
  - `currentStep(m) → step | null`, `stepProgress(m, ctx) → string` for the HUD.

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { PURE } from './pure.mjs';
const { createMission, updateMission, currentStep, stepProgress } = PURE;

const P = (x, y, z) => ({ x, y, z });
function ctx(over = {}) {
  return { heroPos: P(0, 0, 0), tokens: {}, thugs: {}, vanPos: P(0, 0, 0), webPressed: false, interactPressed: false, ...over };
}
const def = () => ({ id: 'm1', title: 'Test', steps: [
  { type: 'reach', target: P(100, 0, 0), radius: 5, text: 'Go' },
  { type: 'collect', tokenIds: ['a', 'b'], text: 'Grab' },
  { type: 'chase', maxDist: 30, loseDist: 60, duration: 2, text: 'Chase' },
  { type: 'webUp', thugIds: ['t1', 't2'], text: 'Web' },
  { type: 'interact', target: P(0, 0, 0), radius: 3, text: 'Take' },
]});

test('reach completes within radius', () => {
  const m = createMission(def());
  assert.equal(currentStep(m).type, 'reach');
  assert.deepEqual(updateMission(m, ctx({ heroPos: P(50, 0, 0) }), 0.016), []);
  const ev = updateMission(m, ctx({ heroPos: P(97, 0, 0) }), 0.016);
  assert.deepEqual(ev, [{ type: 'stepComplete', index: 0 }]); assert.equal(m.current, 1);
});

test('collect: tokens near hero get collected; step completes when all are', () => {
  const m = createMission(def()); m.current = 1;
  const tokens = { a: { pos: P(0, 0, 0), collected: false }, b: { pos: P(50, 0, 0), collected: false } };
  let ev = updateMission(m, ctx({ tokens }), 0.016);
  assert.deepEqual(ev, [{ type: 'tokenCollected', id: 'a' }]); assert.equal(tokens.a.collected, true);
  assert.equal(stepProgress(m, ctx({ tokens })), '1 / 2');
  ev = updateMission(m, ctx({ tokens, heroPos: P(49, 0, 0) }), 0.016);
  assert.deepEqual(ev, [{ type: 'tokenCollected', id: 'b' }, { type: 'stepComplete', index: 1 }]); assert.equal(m.current, 2);
});

test('chase: timer runs while close, resets on lose, completes after duration', () => {
  const m = createMission(def()); m.current = 2;
  for (let i = 0; i < 60; i++) updateMission(m, ctx({ vanPos: P(10, 0, 0) }), 1 / 60);
  assert.ok(m.timer > 0.9 && m.timer < 1.1);
  const lost = updateMission(m, ctx({ vanPos: P(100, 0, 0) }), 1 / 60);
  assert.deepEqual(lost, [{ type: 'chaseLost' }]); assert.equal(m.timer, 0); assert.equal(m.current, 2);
  let ev = [];
  for (let i = 0; i < 130; i++) ev = ev.concat(updateMission(m, ctx({ vanPos: P(10, 0, 0) }), 1 / 60));
  assert.ok(ev.some(e => e.type === 'stepComplete' && e.index === 2)); assert.equal(m.current, 3);
});

test('webUp: pressing web near an unwebbed thug webs it; all webbed completes', () => {
  const m = createMission(def()); m.current = 3;
  const thugs = { t1: { pos: P(2, 0, 0), webbed: false }, t2: { pos: P(20, 0, 0), webbed: false } };
  assert.deepEqual(updateMission(m, ctx({ thugs, webPressed: false }), 0.016), []);
  let ev = updateMission(m, ctx({ thugs, webPressed: true }), 0.016);
  assert.deepEqual(ev, [{ type: 'thugWebbed', id: 't1' }]); assert.equal(thugs.t1.webbed, true);
  ev = updateMission(m, ctx({ thugs, webPressed: true, heroPos: P(18, 0, 0) }), 0.016);
  assert.deepEqual(ev, [{ type: 'thugWebbed', id: 't2' }, { type: 'stepComplete', index: 3 }]);
});

test('interact completes the mission', () => {
  const m = createMission(def()); m.current = 4;
  assert.deepEqual(updateMission(m, ctx({ interactPressed: false }), 0.016), []);
  const ev = updateMission(m, ctx({ interactPressed: true }), 0.016);
  assert.deepEqual(ev, [{ type: 'stepComplete', index: 4 }, { type: 'missionComplete' }]);
  assert.equal(m.state, 'complete'); assert.equal(currentStep(m), null);
  assert.deepEqual(updateMission(m, ctx(), 0.016), []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/`
Expected: FAIL — `createMission is not a function`.

- [ ] **Step 3: Implement** — add to the pure block before `const PURE`:

```js
// --- Missions: a list of steps; one active at a time ---
function createMission(def) {
  return { id: def.id, title: def.title, steps: def.steps, current: 0, state: 'active', timer: 0 };
}
function currentStep(m) { return m.state === 'active' ? m.steps[m.current] || null : null; }
function stepProgress(m, ctx) {
  const s = currentStep(m); if (!s) return '';
  switch (s.type) {
    case 'collect': return `${s.tokenIds.filter(id => ctx.tokens[id]?.collected).length} / ${s.tokenIds.length}`;
    case 'webUp': return `${s.thugIds.filter(id => ctx.thugs[id]?.webbed).length} / ${s.thugIds.length}`;
    case 'chase': return `${Math.ceil(Math.max(0, s.duration - m.timer))}s`;
    default: return '';
  }
}
function advanceMission(m, events) {
  events.push({ type: 'stepComplete', index: m.current });
  m.current++; m.timer = 0;
  if (m.current >= m.steps.length) { m.state = 'complete'; events.push({ type: 'missionComplete' }); }
}
function updateMission(m, ctx, dt) {
  const events = [];
  const s = currentStep(m); if (!s) return events;
  const near = (p, r) => V.dist(ctx.heroPos, p) <= r;
  switch (s.type) {
    case 'reach':
      if (near(s.target, s.radius)) advanceMission(m, events);
      break;
    case 'collect':
      for (const id of s.tokenIds) {
        const t = ctx.tokens[id];
        if (t && !t.collected && near(t.pos, 2.5)) { t.collected = true; events.push({ type: 'tokenCollected', id }); }
      }
      if (s.tokenIds.every(id => ctx.tokens[id]?.collected)) advanceMission(m, events);
      break;
    case 'chase': {
      const d = V.dist(ctx.heroPos, ctx.vanPos);
      if (d > s.loseDist) { if (m.timer > 0) { m.timer = 0; events.push({ type: 'chaseLost' }); } else events.push({ type: 'chaseLost' }); m.timer = 0; }
      else if (d <= s.maxDist) { m.timer += dt; if (m.timer >= s.duration) advanceMission(m, events); }
      break;
    }
    case 'webUp':
      if (ctx.webPressed) {
        for (const id of s.thugIds) {
          const t = ctx.thugs[id];
          if (t && !t.webbed && near(t.pos, 5)) { t.webbed = true; events.push({ type: 'thugWebbed', id }); break; }
        }
      }
      if (s.thugIds.every(id => ctx.thugs[id]?.webbed)) advanceMission(m, events);
      break;
    case 'interact':
      if (ctx.interactPressed && near(s.target, s.radius)) advanceMission(m, events);
      break;
  }
  return events;
}
```
Simplify the `chase` lose branch to: `if (d > s.loseDist) { m.timer = 0; events.push({ type: 'chaseLost' }); }` — the test expects exactly one `chaseLost` per step while out of range, which this gives (one per update). In the game, the HUD only reacts to the first `chaseLost` after a positive timer, so store `m.lostNotified` there, not here.

Update exports: add `createMission, updateMission, currentStep, stepProgress`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/`
Expected: `# pass 35`.

- [ ] **Step 5: Commit**

```bash
git add SpiderMan/index.html tests/spiderman.mission.test.mjs
git commit -m "Add mission step system: reach, collect, chase, webUp, interact"
```

---

### Task 10: Render the city (scene, sky, buildings, props, civilians)

**Files:**
- Modify: `SpiderMan/index.html` (below `// ==== PURE END ====`)

**Interfaces:**
- Consumes: `generateCity`, `CONFIG`.
- Produces: globals `scene, camera, renderer, city, PALETTE`, function `buildCityMeshes(city)`, `updateCivilians(t)`; `startRender()` renders a static test view. Verified manually.

- [ ] **Step 1: Add renderer setup and city meshes** after the pure block:

```js
// ==== RENDER: SCENE & CITY ====
const PALETTE = [0xe63946, 0xf4a261, 0x2a9d8f, 0x457b9d, 0x8e5bd6, 0xffb703, 0x3fa7d6, 0xef476f];
let scene, camera, renderer, city, civMeshes = [], clockT = 0;

function initScene() {
  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game'), antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fd3ff);
  scene.fog = new THREE.Fog(0x8fd3ff, 250, 700);
  camera = new THREE.PerspectiveCamera(CONFIG.camFovMin, window.innerWidth / window.innerHeight, 0.1, 1500);
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  scene.add(new THREE.HemisphereLight(0xdff4ff, 0x6b7a8f, 0.9));
  const sun = new THREE.DirectionalLight(0xfff4e0, 0.9); sun.position.set(200, 400, 150); scene.add(sun);
  // sky dome: big inverted sphere with vertex-colour gradient
  const skyGeo = new THREE.SphereGeometry(1200, 24, 12);
  const cols = []; const p = skyGeo.attributes.position;
  for (let i = 0; i < p.count; i++) { const t = Math.max(0, Math.min(1, p.getY(i) / 1200)); const c = new THREE.Color(0x8fd3ff).lerp(new THREE.Color(0x1e5bb8), t); cols.push(c.r, c.g, c.b); }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  scene.add(new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })));
}

function buildCityMeshes(c) {
  // ground + roads
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(c.size + 40, c.size + 40), new THREE.MeshLambertMaterial({ color: 0x3b3f4a }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; scene.add(ground);
  const sidewalkMat = new THREE.MeshLambertMaterial({ color: 0x9aa0a6 });
  const laneMat = new THREE.MeshBasicMaterial({ color: 0xf1d302 });
  const sidewalks = [], lanes = [];
  for (let ix = 0; ix < CONFIG.gridN; ix++) for (let iz = 0; iz < CONFIG.gridN; iz++) {
    const x0 = c.streetLine(ix) + 5, z0 = c.streetLine(iz) + 5;
    const g = new THREE.BoxGeometry(CONFIG.blockSize + 2, 0.3, CONFIG.blockSize + 2);
    g.translate(x0 + CONFIG.blockSize / 2, 0.15, z0 + CONFIG.blockSize / 2); sidewalks.push(g);
  }
  for (let i = 0; i <= CONFIG.gridN; i++) {
    const l = c.streetLine(i);
    const gx = new THREE.PlaneGeometry(c.size, 0.3); gx.rotateX(-Math.PI / 2); gx.translate(0, 0.01, l); lanes.push(gx);
    const gz = new THREE.PlaneGeometry(0.3, c.size); gz.rotateX(-Math.PI / 2); gz.translate(l, 0.01, 0); lanes.push(gz);
  }
  scene.add(new THREE.Mesh(mergeGeos(sidewalks), sidewalkMat));
  scene.add(new THREE.Mesh(mergeGeos(lanes), laneMat));

  // buildings merged by colour (8 draw calls) + one dark cap mesh + one window mesh
  const byColor = PALETTE.map(() => []), caps = [], windows = [];
  for (const b of c.buildings) {
    const w = b.max.x - b.min.x, h = b.max.y - b.min.y, d = b.max.z - b.min.z;
    const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
    const g = new THREE.BoxGeometry(w, h, d); g.translate(cx, b.min.y + h / 2, cz);
    byColor[b.color].push(g);
    if (b.kind === 'building' || b.kind === 'spire') {
      const cap = new THREE.BoxGeometry(w + 0.6, 0.8, d + 0.6); cap.translate(cx, b.max.y + 0.4, cz); caps.push(cap);
      // window strips: one thin emissive slab per 4 m of height on the ±Z faces
      for (let y = 3; y < h - 2; y += 4) {
        const s1 = new THREE.BoxGeometry(w * 0.8, 1.2, 0.1); s1.translate(cx, b.min.y + y, b.max.z + 0.05); windows.push(s1);
        const s2 = new THREE.BoxGeometry(w * 0.8, 1.2, 0.1); s2.translate(cx, b.min.y + y, b.min.z - 0.05); windows.push(s2);
        const s3 = new THREE.BoxGeometry(0.1, 1.2, d * 0.8); s3.translate(b.max.x + 0.05, b.min.y + y, cz); windows.push(s3);
        const s4 = new THREE.BoxGeometry(0.1, 1.2, d * 0.8); s4.translate(b.min.x - 0.05, b.min.y + y, cz); windows.push(s4);
      }
    }
  }
  byColor.forEach((list, i) => { if (list.length) scene.add(new THREE.Mesh(mergeGeos(list), new THREE.MeshLambertMaterial({ color: PALETTE[i] }))); });
  scene.add(new THREE.Mesh(mergeGeos(caps), new THREE.MeshLambertMaterial({ color: 0x22232b })));
  scene.add(new THREE.Mesh(mergeGeos(windows), new THREE.MeshLambertMaterial({ color: 0xbfe9ff, emissive: 0x5ec4ff, emissiveIntensity: 0.6 })));

  // props: instanced cars and lamps
  const carGeo = new THREE.BoxGeometry(4, 1.5, 2); const carMesh = new THREE.InstancedMesh(carGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), c.props.cars.length);
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  c.props.cars.forEach((car, i) => {
    m4.makeRotationY(car.dir ? 0 : Math.PI / 2); m4.setPosition(car.x, 0.75, car.z); carMesh.setMatrixAt(i, m4);
    carMesh.setColorAt(i, col.setHex(PALETTE[car.color]));
  });
  scene.add(carMesh);
  const lampGeo = new THREE.CylinderGeometry(0.12, 0.12, 6, 6); lampGeo.translate(0, 3, 0);
  const lampMesh = new THREE.InstancedMesh(lampGeo, new THREE.MeshLambertMaterial({ color: 0x1b1b1b }), c.props.lamps.length);
  c.props.lamps.forEach((l, i) => { m4.identity(); m4.setPosition(l.x, 0.3, l.z); lampMesh.setMatrixAt(i, m4); });
  scene.add(lampMesh);

  // civilians: two boxes each, animated in updateCivilians
  const bodyGeo = new THREE.BoxGeometry(0.5, 1.0, 0.3), headGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  const civMat = PALETTE.map(h => new THREE.MeshLambertMaterial({ color: h }));
  const skin = new THREE.MeshLambertMaterial({ color: 0xf1c27d });
  civMeshes = c.civilians.map((cv, i) => {
    const grp = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, civMat[i % 8]); body.position.y = 0.8; grp.add(body);
    const head = new THREE.Mesh(headGeo, skin); head.position.y = 1.5; grp.add(head);
    grp.position.set(cv.x, 0.3, cv.z); grp.userData = cv; scene.add(grp); return grp;
  });
}
function mergeGeos(list) {
  // manual merge (BufferGeometryUtils is not in three.min.js)
  let total = 0; for (const g of list) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3); let off = 0; const idx = [];
  for (const g of list) {
    const ng = g.index ? g.toNonIndexed() : g;
    pos.set(ng.attributes.position.array, off * 3); nor.set(ng.attributes.normal.array, off * 3); off += ng.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}
function updateCivilians(t) {
  for (const g of civMeshes) {
    const cv = g.userData, s = 1.2;
    const off = Math.sin(t * 0.25 + cv.phase) * 6;          // wander back and forth 6 m
    if (cv.axis === 'z') g.position.z = cv.z + off * cv.dir; else g.position.x = cv.x + off * cv.dir;
    g.rotation.y = cv.axis === 'z' ? 0 : Math.PI / 2;
    g.children[0].rotation.z = Math.sin(t * 6 + cv.phase) * 0.08;   // little bob
  }
}
```

- [ ] **Step 2: Add a temporary bootstrap** at the end of the script so the city can be seen:

```js
// ==== MAIN (temporary — replaced in Task 11) ====
initScene();
city = generateCity();
buildCityMeshes(city);
camera.position.set(city.spawn.x + 30, city.spawn.y + 40, city.spawn.z + 60);
camera.lookAt(city.spawn.x, city.spawn.y, city.spawn.z);
document.getElementById('title').classList.add('hidden');
(function loop() { requestAnimationFrame(loop); clockT += 1 / 60; updateCivilians(clockT); renderer.render(scene, camera); })();
```

- [ ] **Step 3: Verify in the browser**

Open `SpiderMan/index.html` in Chrome. Expected: bright sky gradient, a colourful blocky city with dark roof caps and light-blue window strips, grey sidewalk slabs with yellow lane lines, small cars and lamp posts along the streets, little figures bobbing on sidewalks, a tall gold spire near the centre. Open DevTools → Console: no errors. Rendering ≥ 55 FPS in the Performance monitor.

- [ ] **Step 4: Run tests** — `node --test tests/` still `# pass 35` (pure block untouched).

- [ ] **Step 5: Commit**

```bash
git add SpiderMan/index.html
git commit -m "Render low-poly comic city: sky, merged buildings, props, civilians"
```

---

### Task 11: Input, hero mesh, camera, web strand, comic pops — first playable

**Files:**
- Modify: `SpiderMan/index.html` (replace the temporary MAIN block; add INPUT, HERO MESH, WEB, CAMERA, MAIN LOOP)

**Interfaces:**
- Consumes: `createHero, makeInput, stepHero, findAnchor`.
- Produces: globals `hero, input, heroGroup, camState = { yaw, pitch, idleT, dist, fov }`, functions `buildHeroMesh()`, `poseHero(hero, t)`, `updateWebStrand()`, `spawnPop(text, pos)`, `updateCamera(dt)`, `handleHeroEvents(events)`. Fully playable traversal.

- [ ] **Step 1: Input + pointer lock**

```js
// ==== INPUT ====
const input = makeInput();
const keys = {};
let pointerLocked = false, paused = false, started = false;
const pressedThisFrame = { jump: false, zip: false, web: false, interact: false };
const camState = { yaw: 0, pitch: -0.25, idleT: 0, dist: CONFIG.camDist, fov: CONFIG.camFovMin };

document.addEventListener('keydown', e => {
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === 'Space') { pressedThisFrame.jump = true; e.preventDefault(); }
  if (e.code === 'KeyE') { pressedThisFrame.zip = true; pressedThisFrame.interact = true; }
});
document.addEventListener('keyup', e => { keys[e.code] = false; });
document.addEventListener('mousedown', e => { if (pointerLocked && e.button === 0) { keys.LMB = true; pressedThisFrame.web = true; } });
document.addEventListener('mouseup', e => { if (e.button === 0) keys.LMB = false; });
document.addEventListener('mousemove', e => {
  if (!pointerLocked) return;
  camState.yaw -= e.movementX * CONFIG.mouseSens;
  camState.pitch = Math.max(-1.2, Math.min(0.9, camState.pitch - e.movementY * CONFIG.mouseSens));
  camState.idleT = 0;
});
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === renderer.domElement;
  if (!pointerLocked && started) setPaused(true);
});
function lockPointer() { renderer.domElement.requestPointerLock(); }
function setPaused(p) { paused = p; document.getElementById('pause').classList.toggle('hidden', !p); if (!p) lockPointer(); }

function readInput() {
  input.forward = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  input.strafe = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  input.sprint = !!(keys.ShiftLeft || keys.ShiftRight);
  input.jumpHeld = !!keys.Space;
  input.swing = !!keys.LMB;
  input.jump = pressedThisFrame.jump; input.zip = pressedThisFrame.zip;
  input.camYaw = camState.yaw; input.camPitch = camState.pitch;
}
function clearPressed() { for (const k in pressedThisFrame) pressedThisFrame[k] = false; }
```
Add a pause overlay to the HTML after the title overlay:
```html
<div id="pause" class="overlay hidden">
  <h1>PAUSED</h1>
  <p><kbd>W A S D</kbd> move · <kbd>Shift</kbd> sprint · <kbd>Space</kbd> jump (tap again on landing for a high jump) · hold <kbd>LMB</kbd> swing, release on the upswing · <kbd>E</kbd> zip to what you're looking at / interact · <kbd>Esc</kbd> pause</p>
  <button id="resumeBtn">RESUME</button>
  <button id="restartBtn">RESTART MISSION</button>
</div>
```

- [ ] **Step 2: Hero mesh, poses, web strand, pops**

```js
// ==== HERO MESH & WEB ====
let hero, heroGroup, heroParts, webLine, webSplat, pops = [];
const RED = new THREE.MeshLambertMaterial({ color: 0xe62429 }), BLUE = new THREE.MeshLambertMaterial({ color: 0x0b3d91 });
const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide });
function part(geo, mat, x, y, z) {
  const grp = new THREE.Group();
  const m = new THREE.Mesh(geo, mat); grp.add(m);
  const o = new THREE.Mesh(geo, OUTLINE); o.scale.setScalar(1.12); grp.add(o);
  grp.position.set(x, y, z); return grp;
}
function buildHeroMesh() {
  heroGroup = new THREE.Group();
  const torso = part(new THREE.BoxGeometry(0.5, 0.65, 0.3), RED, 0, 1.15, 0);
  const hips = part(new THREE.BoxGeometry(0.44, 0.3, 0.28), BLUE, 0, 0.72, 0);
  const head = part(new THREE.SphereGeometry(0.19, 12, 10), RED, 0, 1.68, 0);
  // eyes: two white flat lenses
  const eyeGeo = new THREE.SphereGeometry(0.07, 8, 6); eyeGeo.scale(1, 1.4, 0.4);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const eL = new THREE.Mesh(eyeGeo, eyeMat); eL.position.set(-0.075, 1.7, -0.16); eL.rotation.z = 0.35;
  const eR = new THREE.Mesh(eyeGeo, eyeMat); eR.position.set(0.075, 1.7, -0.16); eR.rotation.z = -0.35;
  // web lines on torso and head: thin black lines
  const lineMat = new THREE.LineBasicMaterial({ color: 0x000000 });
  const lines = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const y = 0.85 + i * 0.15;
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.26, y, -0.16), new THREE.Vector3(0.26, y, -0.16)]);
    lines.add(new THREE.Line(g, lineMat));
  }
  for (let i = -2; i <= 2; i++) {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(i * 0.12, 0.82, -0.16), new THREE.Vector3(i * 0.12, 1.48, -0.16)]);
    lines.add(new THREE.Line(g, lineMat));
  }
  const limb = (mat, len) => { const g = new THREE.BoxGeometry(0.16, len, 0.16); g.translate(0, -len / 2, 0); return part(g, mat, 0, 0, 0); };
  const armL = limb(RED, 0.65), armR = limb(RED, 0.65), legL = limb(BLUE, 0.7), legR = limb(BLUE, 0.7);
  armL.position.set(-0.34, 1.45, 0); armR.position.set(0.34, 1.45, 0); legL.position.set(-0.13, 0.7, 0); legR.position.set(0.13, 0.7, 0);
  heroGroup.add(torso, hips, head, eL, eR, lines, armL, armR, legL, legR);
  heroParts = { armL, armR, legL, legR, torso };
  scene.add(heroGroup);
  // web strand: a thin cylinder we re-aim every frame
  webLine = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 6, 1, true), new THREE.MeshBasicMaterial({ color: 0xf5f5f5 }));
  webLine.visible = false; scene.add(webLine);
  webSplat = new THREE.Mesh(new THREE.CircleGeometry(0.6, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
  webSplat.visible = false; scene.add(webSplat);
}
// procedural poses per state (target angles, eased each frame)
function poseHero(h, t) {
  const P = heroParts, lerpR = (obj, x, z) => { obj.rotation.x += (x - obj.rotation.x) * 0.2; obj.rotation.z += (z - obj.rotation.z) * 0.2; };
  const speed = V.len(V.horiz(h.vel));
  switch (h.state) {
    case 'ground': { const s = Math.sin(t * (speed > 0.5 ? 12 : 0)) * Math.min(speed / 8, 1);
      lerpR(P.armL, -s * 1.0, 0.1); lerpR(P.armR, s * 1.0, -0.1); lerpR(P.legL, s * 0.9, 0); lerpR(P.legR, -s * 0.9, 0); break; }
    case 'air': lerpR(P.armL, -0.6, 1.4); lerpR(P.armR, -0.6, -1.4); lerpR(P.legL, 0.6, 0.3); lerpR(P.legR, -0.4, -0.3); break;
    case 'swing': lerpR(P.armL, -2.9, 0.15); lerpR(P.armR, -2.6, -0.4); lerpR(P.legL, 0.9, 0.2); lerpR(P.legR, 0.3, -0.2); break;
    case 'crawl': lerpR(P.armL, -2.2, 0.6); lerpR(P.armR, -2.2, -0.6); lerpR(P.legL, 1.6, 0.5); lerpR(P.legR, 1.6, -0.5); break;
    case 'zip': lerpR(P.armL, -3.0, 0); lerpR(P.armR, -3.0, 0); lerpR(P.legL, 0, 0); lerpR(P.legR, 0, 0); break;
  }
  heroGroup.position.set(h.pos.x, h.pos.y, h.pos.z);
  if (h.state === 'crawl') {
    const n = h.wall.normal; heroGroup.rotation.set(0, Math.atan2(-n.x, -n.z), 0);      // face the wall
    heroGroup.rotation.x = -Math.PI / 2 * 0.85; heroGroup.position.y += 0.9;             // lie against it
  } else {
    heroGroup.rotation.set(0, Math.atan2(h.facing.x, h.facing.z) + Math.PI, 0);
    if (h.state === 'swing' || h.state === 'air') heroGroup.rotation.x = Math.max(-0.9, Math.min(0.9, -h.vel.y * 0.04));
    if (h.state === 'zip') heroGroup.rotation.x = -1.2;
  }
}
function updateWebStrand() {
  if (hero.state === 'swing' && hero.anchor) {
    const a = new THREE.Vector3(hero.anchor.x, hero.anchor.y, hero.anchor.z);
    const b = new THREE.Vector3(hero.pos.x, hero.pos.y + 1.6, hero.pos.z);
    const mid = a.clone().add(b).multiplyScalar(0.5), len = a.distanceTo(b);
    webLine.position.copy(mid); webLine.scale.set(1, len, 1);
    webLine.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    webLine.visible = true;
    webSplat.position.copy(a); webSplat.position.y += 0.05; webSplat.rotation.set(-Math.PI / 2, 0, 0); webSplat.visible = !hero.anchor.sky;
  } else { webLine.visible = false; webSplat.visible = false; }
}
// comic text pops as canvas sprites
function spawnPop(text, pos, color = '#ffe14d') {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128; const g = cv.getContext('2d');
  g.font = 'bold 64px Impact, "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 10; g.strokeStyle = '#000'; g.strokeText(text, 128, 64); g.fillStyle = color; g.fillText(text, 128, 64);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false }));
  sp.position.set(pos.x, pos.y + 2.5, pos.z); sp.scale.set(0.1, 0.05, 1); sp.userData.t = 0; scene.add(sp); pops.push(sp);
}
function updatePops(dt) {
  for (let i = pops.length - 1; i >= 0; i--) {
    const s = pops[i]; s.userData.t += dt; const t = s.userData.t;
    const sc = Math.min(1, t * 6) * 6; s.scale.set(sc, sc / 2, 1); s.position.y += dt * 1.5;
    s.material.opacity = t < 0.6 ? 1 : Math.max(0, 1 - (t - 0.6) / 0.4);
    if (t > 1) { scene.remove(s); s.material.map.dispose(); s.material.dispose(); pops.splice(i, 1); }
  }
}
```

- [ ] **Step 3: Camera**

```js
// ==== CAMERA ====
const camPos = new THREE.Vector3(), camTarget = new THREE.Vector3();
function updateCamera(dt) {
  const speed = V.len(hero.vel), f = Math.min(speed / CONFIG.fastSpeed, 1);
  camState.idleT += dt;
  if (camState.idleT > CONFIG.camIdleRealign && speed > 3) {           // gently realign behind the velocity
    const want = Math.atan2(-hero.vel.x, -hero.vel.z);
    let d = want - camState.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    camState.yaw += d * Math.min(1, dt * 1.5);
  }
  camState.dist += ((CONFIG.camDist + (CONFIG.camDistFast - CONFIG.camDist) * f) - camState.dist) * Math.min(1, dt * 4);
  camState.fov += ((CONFIG.camFovMin + (CONFIG.camFovMax - CONFIG.camFovMin) * f) - camState.fov) * Math.min(1, dt * 4);
  camera.fov = camState.fov; camera.updateProjectionMatrix();
  const target = { x: hero.pos.x, y: hero.pos.y + CONFIG.camHeight, z: hero.pos.z };
  const cp = Math.cos(camState.pitch);
  const back = { x: Math.sin(camState.yaw) * cp, y: -Math.sin(camState.pitch), z: Math.cos(camState.yaw) * cp }; // behind the view dir
  let dist = camState.dist;
  const hit = raycastAABBs(target, back, city.grid, dist);
  if (hit) dist = Math.max(1.5, hit.dist - 0.5);
  const desired = new THREE.Vector3(target.x + back.x * dist, Math.max(0.5, target.y + back.y * dist), target.z + back.z * dist);
  camPos.lerp(desired, Math.min(1, dt * 12));
  camTarget.lerp(new THREE.Vector3(target.x, target.y, target.z), Math.min(1, dt * 20));
  camera.position.copy(camPos); camera.lookAt(camTarget);
}
```

- [ ] **Step 4: Main loop and event handling** — replace the temporary MAIN block:

```js
// ==== MAIN LOOP ====
let last = 0, acc = 0; const STEP = 1 / 60;
function handleHeroEvents(events) {
  for (const e of events) {
    if (e.type === 'swingStart') spawnPop('THWIP!', hero.pos, '#ffffff');
    if (e.type === 'land' && e.fallSpeed > 15) spawnPop('WHUMP!', hero.pos, '#ffb703');
    if (e.type === 'zipStart') spawnPop('ZIP!', hero.pos, '#7fb3ff');
    if (e.type === 'wallJump') spawnPop('HUP!', hero.pos);
  }
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000 || 0); last = now;
  if (!started || paused) { renderer.render(scene, camera); return; }
  acc += dt;
  while (acc >= STEP) {
    readInput();
    handleHeroEvents(stepHero(hero, input, STEP, { grid: city.grid }));
    clearPressed();
    clockT += STEP; acc -= STEP;
  }
  updateCivilians(clockT); poseHero(hero, clockT); updateWebStrand(); updatePops(dt); updateCamera(dt);
  renderer.render(scene, camera);
}
function startGame() {
  started = true;
  document.getElementById('title').classList.add('hidden');
  lockPointer();
}
initScene();
city = generateCity();
buildCityMeshes(city);
hero = createHero(city.spawn);
buildHeroMesh();
camPos.set(city.spawn.x, city.spawn.y + 4, city.spawn.z + 8);
document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('resumeBtn').addEventListener('click', () => setPaused(false));
requestAnimationFrame(frame);
```
(`restartBtn` is wired in Task 13.)

- [ ] **Step 5: Verify in the browser** (play-test checklist; fix anything that fails before committing)

1. Click START PATROL → pointer locks, hero stands on a rooftop, chase cam behind.
2. WASD runs relative to camera; Shift sprints; Space jumps; jump again right on landing → visibly higher.
3. Run off the roof → falls; near a wall press Space → wall jump; run into a wall → sticks and crawls; W climbs to roof and hops on; A/D moves sideways.
4. Hold LMB in the air → "THWIP!" pop, white strand to a roof corner ahead, pendulum arc; release on the upswing → launches forward. Chain 5 swings across the city without touching the ground.
5. Look at a roof, press E → dashes there. Look at a wall, E → sticks to it crawling.
6. Camera never goes inside a building (pull-in works); FOV widens at speed; camera realigns behind you after ~1.5 s idle.
7. Esc → pause overlay; RESUME re-locks the pointer.
8. Console has no errors; FPS ≥ 55.

Tuning is expected here: adjust `CONFIG` values only (not logic), re-run `node --test tests/` after each change to make sure the pure tests still pass, and note any test that needed a threshold change in the commit message.

- [ ] **Step 6: Commit**

```bash
git add SpiderMan/index.html
git commit -m "Add input, hero mesh, chase camera, web strand and comic pops — playable traversal"
```

---

### Task 12: HUD, minimap, and audio

**Files:**
- Modify: `SpiderMan/index.html`

**Interfaces:**
- Produces: `HUD.setObjective(text, progress)`, `HUD.prompt(text, seconds)`, `HUD.setMarker(pos|null)`, `HUD.update(dt)`, `drawMinimap()`; `SFX.thwip(), SFX.whoosh(), SFX.thud(), SFX.chime(), SFX.hit(), SFX.setWind(speed01), SFX.theme()`.

- [ ] **Step 1: HUD markup + CSS** — add before `<script src=...>`:

```html
<div id="hud" class="hidden">
  <div id="objective"><div id="objTitle">OBJECTIVE</div><div id="objText"></div><div id="objProg"></div></div>
  <div id="speed">0 <span>m/s</span></div>
  <canvas id="minimap" width="200" height="200"></canvas>
  <div id="prompt"></div>
  <div id="marker"><div class="arrow">▲</div><div class="dist"></div></div>
  <div id="card" class="hidden"></div>
</div>
```
CSS (append inside `<style>`):
```css
#hud { position: fixed; inset: 0; pointer-events: none; z-index: 5; }
#hud.hidden { display: none; }
#objective { position: absolute; top: 20px; left: 20px; background: rgba(6,6,20,0.6); border-left: 4px solid #e62429; padding: 10px 16px; min-width: 240px; }
#objTitle { font-size: 0.7rem; letter-spacing: 3px; color: #e62429; }
#objText { font-size: 1.05rem; margin-top: 4px; }
#objProg { font-size: 0.9rem; color: #7fb3ff; margin-top: 2px; }
#speed { position: absolute; bottom: 24px; left: 24px; font-size: 2rem; font-weight: bold; color: #fff; text-shadow: 2px 2px 0 #000; }
#speed span { font-size: 0.9rem; color: #aaa; }
#minimap { position: absolute; right: 20px; bottom: 20px; width: 180px; height: 180px; border-radius: 50%; border: 3px solid #e62429; background: rgba(6,6,20,0.7); }
#prompt { position: absolute; left: 50%; top: 62%; transform: translateX(-50%); font-size: 1.3rem; letter-spacing: 2px; text-shadow: 2px 2px 0 #000; opacity: 0; transition: opacity 0.3s; }
#marker { position: absolute; transform: translate(-50%, -50%); text-align: center; color: #ffe14d; text-shadow: 2px 2px 0 #000; display: none; }
#marker .arrow { font-size: 1.6rem; animation: bob 0.8s infinite alternate; }
@keyframes bob { from { transform: translateY(0); } to { transform: translateY(-8px); } }
#card { position: absolute; left: 50%; top: 20%; transform: translateX(-50%); background: rgba(6,6,20,0.85); border: 2px solid #e62429; padding: 22px 34px; font-size: 1.2rem; max-width: 640px; text-align: center; line-height: 1.6; }
#card.hidden { display: none; }
```

- [ ] **Step 2: HUD + minimap code** (add before `// ==== MAIN LOOP ====`)

```js
// ==== HUD ====
const HUD = (() => {
  const el = id => document.getElementById(id);
  let promptT = 0, marker = null, cardT = 0;
  return {
    show() { el('hud').classList.remove('hidden'); },
    setObjective(text, prog = '') { el('objText').textContent = text; el('objProg').textContent = prog; },
    prompt(text, seconds = 3) { el('prompt').textContent = text; el('prompt').style.opacity = 1; promptT = seconds; },
    card(html, seconds = 5) { el('card').innerHTML = html; el('card').classList.remove('hidden'); cardT = seconds; },
    setMarker(pos) { marker = pos; el('marker').style.display = pos ? 'block' : 'none'; },
    update(dt) {
      if (promptT > 0 && (promptT -= dt) <= 0) el('prompt').style.opacity = 0;
      if (cardT > 0 && (cardT -= dt) <= 0) el('card').classList.add('hidden');
      el('speed').firstChild.textContent = Math.round(V.len(hero.vel)) + ' ';
      if (marker) {
        const v = new THREE.Vector3(marker.x, marker.y + 3, marker.z).project(camera);
        const onScreen = v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1;
        let sx = (v.x + 1) / 2 * window.innerWidth, sy = (1 - v.y) / 2 * window.innerHeight;
        if (!onScreen) {                                   // clamp to screen edge
          const ang = Math.atan2(v.y * (v.z < 1 ? 1 : -1), v.x * (v.z < 1 ? 1 : -1));
          sx = window.innerWidth / 2 + Math.cos(ang) * (window.innerWidth / 2 - 40);
          sy = window.innerHeight / 2 - Math.sin(ang) * (window.innerHeight / 2 - 40);
        }
        el('marker').style.left = sx + 'px'; el('marker').style.top = sy + 'px';
        el('marker').querySelector('.dist').textContent = Math.round(V.dist(hero.pos, marker)) + ' m';
      }
      drawMinimap(marker);
    },
  };
})();
function drawMinimap(marker) {
  const cv = document.getElementById('minimap'), g = cv.getContext('2d'), R = 100, scale = R / 150; // 150 m radius view
  g.clearRect(0, 0, 200, 200);
  g.save(); g.beginPath(); g.arc(R, R, R - 2, 0, Math.PI * 2); g.clip();
  g.translate(R, R); g.rotate(-camState.yaw); g.translate(-hero.pos.x * scale, -hero.pos.z * scale);
  g.fillStyle = '#5a6070';
  for (const b of city.grid.query({ x: hero.pos.x - 160, y: 0, z: hero.pos.z - 160 }, { x: hero.pos.x + 160, y: 500, z: hero.pos.z + 160 }))
    g.fillRect(b.min.x * scale, b.min.z * scale, (b.max.x - b.min.x) * scale, (b.max.z - b.min.z) * scale);
  if (marker) { g.fillStyle = '#ffe14d'; g.beginPath(); g.arc(marker.x * scale, marker.z * scale, 5, 0, Math.PI * 2); g.fill(); }
  g.restore();
  g.fillStyle = '#e62429'; g.save(); g.translate(R, R); g.rotate(Math.atan2(hero.facing.x, -hero.facing.z) - camState.yaw);
  g.beginPath(); g.moveTo(0, -8); g.lineTo(6, 6); g.lineTo(-6, 6); g.closePath(); g.fill(); g.restore();
}
```

- [ ] **Step 3: Audio** (add after the pure block, before RENDER)

```js
// ==== AUDIO (Web Audio synth, no files) ====
const SFX = (() => {
  let ctx, wind, windGain;
  const ac = () => { if (!ctx) { ctx = new (window.AudioContext || window.webkitAudioContext)(); startWind(); } if (ctx.state === 'suspended') ctx.resume(); return ctx; };
  function noise(dur, filterHz, gain, type = 'bandpass') {
    const c = ac(), buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = filterHz; f.Q.value = 1.5;
    const g = c.createGain(); g.gain.value = gain;
    src.connect(f).connect(g).connect(c.destination); src.start();
  }
  function tone(freq, dur, type = 'square', gain = 0.15, slide = 0) {
    const c = ac(), o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, c.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), c.currentTime + dur);
    g.gain.setValueAtTime(gain, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + dur);
  }
  function startWind() {
    const c = ctx, buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    wind = c.createBufferSource(); wind.buffer = buf; wind.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
    windGain = c.createGain(); windGain.gain.value = 0;
    wind.connect(f).connect(windGain).connect(c.destination); wind.start();
  }
  return {
    unlock() { ac(); },
    thwip() { noise(0.12, 2200, 0.5, 'highpass'); tone(900, 0.08, 'triangle', 0.08, -600); },
    whoosh() { noise(0.35, 600, 0.35); },
    thud() { tone(90, 0.18, 'sine', 0.35, -60); noise(0.1, 200, 0.3, 'lowpass'); },
    chime() { tone(880, 0.12, 'sine', 0.2); setTimeout(() => tone(1320, 0.18, 'sine', 0.2), 90); },
    hit() { noise(0.08, 1200, 0.5); tone(160, 0.12, 'square', 0.25, -100); },
    setWind(s01) { if (windGain) windGain.gain.value = Math.min(0.25, s01 * 0.25); },
    theme() { [0, 0.25, 0.5, 0.75].forEach((t, i) => setTimeout(() => tone([330, 392, 494, 659][i], 0.3, 'square', 0.12), t * 1000)); },
  };
})();
```
Wire into events in `handleHeroEvents`: `swingStart → SFX.thwip()`, `swingRelease → SFX.whoosh()`, `land (fallSpeed>8) → SFX.thud()`, `zipStart → SFX.thwip()`, `wallJump → SFX.whoosh()`. In `frame()` after the physics loop: `SFX.setWind(Math.min(1, V.len(hero.vel) / CONFIG.fastSpeed)); HUD.update(dt);`. In `startGame()`: `SFX.unlock(); SFX.theme(); HUD.show();`.

- [ ] **Step 4: Verify in the browser** — objective panel (empty text), speed readout changes, circular minimap rotates with the camera and shows nearby blocks; thwip on swing, whoosh on release, thud on hard landing, wind rises with speed; short theme on start. No console errors.

- [ ] **Step 5: Commit**

```bash
git add SpiderMan/index.html
git commit -m "Add HUD, rotating minimap, and synthesized SFX"
```

---

### Task 13: Mission 1 content, van, thugs, tokens, save, free roam

**Files:**
- Modify: `SpiderMan/index.html` (add MISSION 1 CONTENT section; wire into loop; restart button)
- Create: `tests/spiderman.mission1.test.mjs`

**Interfaces:**
- Consumes: `createMission, updateMission, currentStep, stepProgress, city.landmarks, city.streetLine, HUD, SFX, spawnPop`.
- Produces: pure `mission1Def(city) → def` (in the pure block, so it is testable), and game-side `Mission1` runtime: `tokens`, `thugs`, `van`, `startMission1()`, `updateMission1(dt)`, `restartMission()`. Free roam after completion: 20 extra tokens, running score in the objective panel.

- [ ] **Step 1: Write the failing test** for the mission definition

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/`
Expected: FAIL — `mission1Def is not a function`.

- [ ] **Step 3: Implement `mission1Def`** in the pure block (before `const PURE`):

```js
// --- Mission 1 definition (pure so it is testable; geometry comes from the city) ---
function mission1Def(city) {
  const sl = city.streetLine;
  const roofAt = (ix, iz) => {                                  // tallest 'building' in block (ix,iz)
    const x0 = sl(ix) + 5, z0 = sl(iz) + 5;
    return city.buildings.filter(b => b.kind === 'building' && b.min.x >= x0 && b.max.x <= x0 + 40 && b.min.z >= z0 && b.max.z <= z0 + 40)
      .sort((a, b) => b.max.y - a.max.y)[0];
  };
  const centre = b => ({ x: (b.min.x + b.max.x) / 2, y: b.max.y, z: (b.min.z + b.max.z) / 2 });
  const first = roofAt(5, 4);                                   // ~150 m north of spawn (5,7)
  const tokensRoofs = [roofAt(4, 4), roofAt(6, 4), roofAt(4, 5), roofAt(6, 5), roofAt(5, 5)];
  const tokens = tokensRoofs.map((b, i) => {
    const c = centre(b);
    // alternate: roof-edge token vs. wall-face token 6 m below the roof on the -Z face
    return i % 2 === 0 ? { id: 'tok' + i, pos: { x: c.x, y: b.max.y + 1, z: b.min.z + 1 } }
                       : { id: 'tok' + i, pos: { x: c.x, y: Math.max(4, b.max.y - 6), z: b.min.z - 1 } };
  });
  const vanRoute = [
    { x: sl(4), y: 0, z: sl(4) }, { x: sl(8), y: 0, z: sl(4) }, { x: sl(8), y: 0, z: sl(8) }, { x: sl(4), y: 0, z: sl(8) },
  ];
  const plaza = { x: sl(8), y: 0, z: sl(6) };                   // crash site on the east street
  const thugs = [0, 1, 2].map(i => ({ id: 'thug' + i, pos: { x: plaza.x + [6, -6, 2][i], y: 0, z: plaza.z + [4, 3, -7][i] } }));
  return {
    id: 'm1', title: 'Rooftop Reboot',
    steps: [
      { type: 'reach', target: { x: city.spawn.x, y: city.spawn.y, z: city.spawn.z - 6 }, radius: 3, text: 'Walk to the roof edge (WASD)' },
      { type: 'reach', target: centre(first), radius: 8, text: 'Swing to the marked rooftop — hold LMB, release on the upswing' },
      { type: 'collect', tokenIds: tokens.map(t => t.id), text: 'Collect 5 web cartridges — crawl walls, E to zip' },
      { type: 'chase', maxDist: 30, loseDist: 70, duration: 20, text: 'Getaway van! Stay on it' },
      { type: 'webUp', thugIds: thugs.map(t => t.id), text: 'Web up the thugs — get close and tap LMB' },
      { type: 'interact', target: plaza, radius: 4, text: 'Pick up the device (E)' },
    ],
    tokens, thugs, vanRoute, plaza,
  };
}
```
Update exports: add `mission1Def`.

- [ ] **Step 4: Run test to verify it passes** — `node --test tests/` → `# pass 36`.

- [ ] **Step 5: Mission 1 runtime** (add section `// ==== MISSION 1 CONTENT ====` before MAIN LOOP)

```js
// ==== MISSION 1 CONTENT ====
let mission, m1, tokenMeshes = {}, thugMeshes = {}, vanMesh, vanState, deviceMesh, freeRoam = false, score = 0, chaseWarned = false;
const tokenGeo = new THREE.OctahedronGeometry(0.6), tokenMat = new THREE.MeshLambertMaterial({ color: 0x9dff4a, emissive: 0x39ff14, emissiveIntensity: 0.8 });
const ctxTokens = {}, ctxThugs = {};

function makeThugMesh(pos) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.1, 0.35), new THREE.MeshLambertMaterial({ color: 0x333333 }))).position.y = 0.85;
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshLambertMaterial({ color: 0xf1c27d }))).position.y = 1.6;
  g.position.set(pos.x, pos.y, pos.z); scene.add(g); return g;
}
function startMission1() {
  m1 = mission1Def(city); mission = createMission(m1);
  // restore progress
  try { const s = JSON.parse(localStorage.getItem('spiderman_bnd') || '{}'); if (s.m1Complete) { mission.current = mission.steps.length; mission.state = 'complete'; } } catch (e) {}
  for (const t of m1.tokens) {
    ctxTokens[t.id] = { pos: t.pos, collected: false };
    const mesh = new THREE.Mesh(tokenGeo, tokenMat); mesh.position.set(t.pos.x, t.pos.y, t.pos.z); scene.add(mesh); tokenMeshes[t.id] = mesh;
  }
  for (const t of m1.thugs) { ctxThugs[t.id] = { pos: V.clone(t.pos), webbed: false }; thugMeshes[t.id] = makeThugMesh(t.pos); thugMeshes[t.id].visible = false; }
  vanMesh = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 5.5), new THREE.MeshLambertMaterial({ color: 0x1f1f1f }));
  vanMesh.visible = false; scene.add(vanMesh);
  vanState = { pos: V.clone(m1.vanRoute[0]), wp: 1, speed: 14, active: false, crashed: false };
  deviceMesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshLambertMaterial({ color: 0x39ff14, emissive: 0x39ff14, emissiveIntensity: 1 }));
  deviceMesh.position.set(m1.plaza.x, 0.6, m1.plaza.z); deviceMesh.visible = false; scene.add(deviceMesh);
  if (mission.state === 'complete') enterFreeRoam(); else { HUD.card('<b>Nobody remembers Peter Parker.</b><br>Time to remind them about Spider-Man.', 5); applyStepUI(); }
}
function applyStepUI() {
  const s = currentStep(mission); if (!s) return;
  HUD.setObjective(s.text, stepProgress(mission, { tokens: ctxTokens, thugs: ctxThugs }));
  if (s.type === 'reach' || s.type === 'interact') HUD.setMarker(s.target);
  else if (s.type === 'collect') HUD.setMarker(nearestUncollected());
  else if (s.type === 'chase') { vanState.active = true; vanMesh.visible = true; HUD.setMarker(vanState.pos); HUD.prompt('Keep up with the van!', 3); }
  else if (s.type === 'webUp') { for (const id in thugMeshes) thugMeshes[id].visible = true; HUD.setMarker(m1.plaza); }
  if (s.type === 'interact') deviceMesh.visible = true;
}
function nearestUncollected() {
  let best = null, bd = Infinity;
  for (const id in ctxTokens) { const t = ctxTokens[id]; if (t.collected) continue; const d = V.dist(hero.pos, t.pos); if (d < bd) { bd = d; best = t.pos; } }
  return best;
}
function updateVan(dt) {
  if (!vanState.active || vanState.crashed) return;
  const s = currentStep(mission);
  const target = m1.vanRoute[vanState.wp];
  const to = V.sub(target, vanState.pos), d = V.len(to);
  if (d < 1) { vanState.wp = (vanState.wp + 1) % m1.vanRoute.length; }
  else { vanState.pos = V.add(vanState.pos, V.scale(to, Math.min(1, vanState.speed * dt / d))); vanMesh.rotation.y = Math.atan2(to.x, to.z); }
  vanMesh.position.set(vanState.pos.x, 1.1, vanState.pos.z);
  if (!s || s.type !== 'chase') {                                   // chase over → crash at plaza
    vanState.crashed = true; vanMesh.position.set(m1.plaza.x, 1.1, m1.plaza.z); vanMesh.rotation.set(0.15, 0.6, 0.2);
    spawnPop('CRASH!', m1.plaza, '#ff5533'); SFX.hit();
  }
}
function updateMission1(dt) {
  if (freeRoam) { updateFreeRoam(); return; }
  updateVan(dt);
  const ctx = { heroPos: hero.pos, tokens: ctxTokens, thugs: ctxThugs, vanPos: vanState.pos, webPressed: pressedThisFrame.web, interactPressed: pressedThisFrame.interact };
  for (const e of updateMission(mission, ctx, dt)) {
    if (e.type === 'tokenCollected') { scene.remove(tokenMeshes[e.id]); SFX.chime(); spawnPop('+1', hero.pos, '#9dff4a'); HUD.setMarker(nearestUncollected()); }
    if (e.type === 'thugWebbed') { const m = thugMeshes[e.id]; m.children[0].material = new THREE.MeshLambertMaterial({ color: 0xffffff }); m.rotation.z = 1.4; m.position.y = 0.4; SFX.hit(); spawnPop('THWIP!', m.position, '#ffffff'); }
    if (e.type === 'chaseLost') { if (!chaseWarned) { HUD.prompt('Lost the van — catch up!', 2); chaseWarned = true; } }
    if (e.type === 'stepComplete') { chaseWarned = false; SFX.chime(); applyStepUI(); }
    if (e.type === 'missionComplete') {
      deviceMesh.visible = false;
      HUD.card('<b>Mission complete.</b><br>The tech glows a sick green — gamma? Someone is arming the street gangs.<br><i>Next: The Sting</i>', 7);
      try { localStorage.setItem('spiderman_bnd', JSON.stringify({ m1Complete: true })); } catch (err) {}
      enterFreeRoam();
    }
  }
  if (currentStep(mission)?.type === 'chase') HUD.setMarker(vanState.pos);
  const s = currentStep(mission); if (s) HUD.setObjective(s.text, stepProgress(mission, ctx));
}
// Free roam: 20 tokens scattered on random roofs, running score
let roamTokens = [];
function enterFreeRoam() {
  freeRoam = true; HUD.setMarker(null);
  const rng = mulberry32(99);
  const roofs = city.buildings.filter(b => b.kind === 'building');
  roamTokens = [];
  for (let i = 0; i < 20; i++) {
    const b = roofs[Math.floor(rng() * roofs.length)];
    const pos = { x: (b.min.x + b.max.x) / 2, y: b.max.y + 1, z: (b.min.z + b.max.z) / 2 };
    const mesh = new THREE.Mesh(tokenGeo, tokenMat); mesh.position.set(pos.x, pos.y, pos.z); scene.add(mesh);
    roamTokens.push({ pos, mesh, got: false });
  }
  HUD.setObjective('Free roam — collect web cartridges', `Score ${score}`);
}
function updateFreeRoam() {
  for (const t of roamTokens) {
    if (!t.got && V.dist(hero.pos, t.pos) < 2.5) { t.got = true; scene.remove(t.mesh); score += 100 + Math.round(V.len(hero.vel)) * 5; SFX.chime(); spawnPop('+' + (100 + Math.round(V.len(hero.vel)) * 5), hero.pos, '#9dff4a'); }
    else if (!t.got) t.mesh.rotation.y += 0.03;
  }
  HUD.setObjective('Free roam — collect web cartridges', `Score ${score}  ·  ${roamTokens.filter(t => t.got).length} / 20`);
}
function restartMission() {
  try { localStorage.removeItem('spiderman_bnd'); } catch (e) {}
  location.reload();
}
```
Wire up: in `frame()` inside the physics loop after `handleHeroEvents(...)` add `updateMission1(STEP);`. In `startGame()` add `startMission1();`. Add `document.getElementById('restartBtn').addEventListener('click', restartMission);`. Rotate tokens in the render section of `frame()`: `for (const id in tokenMeshes) tokenMeshes[id].rotation.y += 0.03;`.

- [ ] **Step 6: Verify in the browser** — full Mission 1 run:

1. Title card shows; objective "Walk to the roof edge"; marker on the edge; step completes.
2. Marker jumps to a rooftop ~150 m away; swing there; step completes with a chime.
3. Five glowing green tokens: roof-edge ones and wall-face ones (crawl to reach). Marker points to the nearest; counter "n / 5".
4. Black van appears on the street loop and drives; marker follows it; stay within 30 m for 20 s ("20s" countdown). Fall behind by > 70 m → "Lost the van" prompt, timer resets.
5. Van crashes at the plaza with a "CRASH!" pop; 3 thugs appear; get within 5 m and tap LMB → they turn white and fall over; "3 / 3".
6. Green device visible; press E next to it → completion card; free-roam tokens appear on roofs; score climbs faster when collected at speed.
7. Reload: game starts in free roam directly (save works). Esc → RESTART MISSION → reloads into Mission 1.
8. No console errors; FPS ≥ 55.

- [ ] **Step 7: Commit**

```bash
git add SpiderMan/index.html tests/spiderman.mission1.test.mjs
git commit -m "Add Mission 1 'Rooftop Reboot', van chase, thugs, tokens, save and free roam"
```

---

### Task 14: Portal card, CLAUDE.md, final checklist

**Files:**
- Modify: `index.html` (add card after the Escape Room card at ~line 130–137; add thumbnail drawing near line 847)
- Modify: `CLAUDE.md` (repository structure + a Spider-Man section)

- [ ] **Step 1: Add the portal card** directly after the Escape Room `</a>`:

```html
  <a class="game-card" href="SpiderMan/index.html" style="--glow:rgba(230,36,41,0.3);--accent:#e62429;">
    <canvas id="spiderThumb" width="680" height="400"></canvas>
    <div class="game-info">
      <h2>Spider-Man: Brand New Day</h2>
      <p>Swing through a 3D city, crawl walls, zip between rooftops and stop the gang arming the streets with gamma tech!</p>
      <span class="tag" style="background:#e6242922;color:#e62429;">3D Web-Swinging</span>
    </div>
  </a>
```

- [ ] **Step 2: Add the thumbnail drawing** next to the other thumbnail scripts:

```js
(function () {
  const c = document.getElementById('spiderThumb'); if (!c) return;
  const g = c.getContext('2d'), W = c.width, H = c.height;
  const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#1e5bb8'); sky.addColorStop(1, '#8fd3ff');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  const cols = ['#e63946', '#f4a261', '#2a9d8f', '#457b9d', '#8e5bd6', '#ffb703', '#3fa7d6', '#ef476f'];
  let x = 0, i = 0;
  while (x < W) { const w = 50 + (i * 37) % 60, h = 120 + (i * 53) % 200; g.fillStyle = cols[i % 8]; g.fillRect(x, H - h, w, h);
    g.fillStyle = '#22232b'; g.fillRect(x - 2, H - h - 6, w + 4, 6);
    g.fillStyle = '#bfe9ff'; for (let y = H - h + 16; y < H - 10; y += 22) g.fillRect(x + 6, y, w - 12, 6);
    x += w + 8; i++; }
  // web line + swing arc + hero
  g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.moveTo(430, 90); g.lineTo(300, 200); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.5)'; g.setLineDash([8, 8]); g.beginPath(); g.arc(430, 90, 170, Math.PI * 0.55, Math.PI * 0.95); g.stroke(); g.setLineDash([]);
  g.fillStyle = '#e62429'; g.beginPath(); g.arc(300, 200, 14, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#0b3d91'; g.fillRect(292, 212, 16, 26);
  g.fillStyle = '#fff'; g.font = 'bold 42px Impact, "Arial Black", sans-serif'; g.lineWidth = 6; g.strokeStyle = '#000';
  g.strokeText('THWIP!', 460, 250); g.fillText('THWIP!', 460, 250);
})();
```

- [ ] **Step 3: Update CLAUDE.md** — add to the structure list:
```
SpiderMan/index.html    — Spider-Man: Brand New Day: 3D web-swinging open city (Three.js via CDN, ~2500 lines)
tests/                  — Node tests for the Spider-Man pure-logic block (`node --test tests/`)
```
and add a section:
```markdown
## Spider-Man: Brand New Day (SpiderMan/) — Details

3D third-person web-swinging in a procedural 12×12-block city. Spec: `docs/superpowers/specs/2026-09-04-spiderman-brand-new-day-design.md`.

- **Pure block**: logic between `// ==== PURE BEGIN ====` and `// ==== PURE END ====` uses plain `{x,y,z}` objects and no THREE/DOM; `tests/pure.mjs` extracts it for `node --test tests/`.
- **Collision**: every building is an AABB; `SpatialGrid` buckets them per 50 m cell.
- **Hero states**: ground / air / swing / crawl / zip in `stepHero`. Feel constants live in `CONFIG`.
- **Missions**: `createMission` + `updateMission` step types `reach, collect, chase, webUp, interact`; Mission 1 geometry from `mission1Def(city)`.
- **Controls**: WASD move, Shift sprint, Space jump (tap on landing = high jump), hold LMB swing, E zip/interact, Esc pause.
```

- [ ] **Step 4: Verify** — open root `index.html`: new red card with skyline thumbnail and "THWIP!"; hover glow is red; click opens the game. Run `node --test tests/` → `# pass 36`. Play Mission 1 once more end-to-end.

- [ ] **Step 5: Commit**

```bash
git add index.html CLAUDE.md
git commit -m "Add Spider-Man: Brand New Day to portal and document it"
```

---

## Self-review

**Spec coverage:** §4 file/scene → T1, T10; §5 city → T3, T10; §6 states → T6–T8; §7 camera → T11; §8 missions + Mission 1 → T9, T13; §9 HUD/audio/portal/CLAUDE.md → T12, T14; §10 testing → pure tests in T1–T9, T13 plus manual checklists in T10–T14. Wall-jump (§6 Air) → T6/T8. Double-tap high jump → T6. Rope shortening, release bonus, auto-release → T7. Sky-anchor fallback → T5. `localStorage` save → T13. Comic pops → T11.

**Type consistency:** `resolveCollisions(pos, vel, grid)` used identically in T4/T6/T7; `findAnchor(pos, forward, grid)` T5/T7; `raycastAABBs(origin, dir, grid, maxDist)` T4/T8/T11; mission `ctx` shape identical in T9 tests and T13 runtime; `hero.wall = { normal, building }` from T4 through T11; `pressedThisFrame.web/interact` defined in T11 and consumed in T13.

**Known judgement calls for the executor:** the hero is a box, not a true capsule (spec says "capsule ~1.8 m"; the box gives identical gameplay against axis-aligned buildings). Feel numbers in `CONFIG` are starting points — T11 Step 5 is the tuning pass.
