# Tesseract FC — Design Spec

**Date:** 2026-09-06
**Folder:** `TesseractFC/index.html`
**One line:** Eleven-a-side soccer with real rules, played on a pitch that is six metres deep through a fourth spatial dimension.

---

## 1. Concept

Tesseract FC is a proper game of soccer — 11v11, offside, fouls, set pieces, two
halves — played in four spatial dimensions. The pitch is not a plane. It is a
solid volume: 105 m long, 68 m wide, and **6 m deep through the fourth axis, W**.
Height (`y`) is the usual vertical for jumps and ball flight.

You always see a three-dimensional cross-section of that four-dimensional world,
taken at your own W. Players sharing your slice are solid and can tackle you.
Players elsewhere in W thin out into ghosts you run straight through. Sliding
through W is a body feint — slower than running — that opens a passing lane or a
shooting angle a defender cannot close in time.

The design target is **a real match that happens to be 4D**, not a 4D toy wearing
a soccer skin. Every rule is the real rule; W changes the geometry the rules
apply to, not the rules themselves.

The two directions along the fourth axis are named **ana** and **kata**, after
Charles Howard Hinton's 1880s terminology. The controls are labelled that way in
the HUD.

---

## 2. Decisions already made

These were settled during brainstorming and are not open for re-litigation
during implementation.

| Decision | Choice | Rationale |
|---|---|---|
| Genre | Soccer | User's call |
| Meaning of "4D" | A genuine fourth **spatial** axis | Not time, not spectacle |
| Renderer | **B — true 4-polytope slicing** | Chosen over the cheaper slab renderer for the morphing-world spectacle |
| Fallback renderer | A — slab renderer, behind the same interface | User asked explicitly to be able to switch back |
| W movement | **Free and continuous**, no charges or cooldown | Chosen over discrete lanes |
| W depth | **6 m** | Roughly one keeper's reach; keeps the keeper a real opponent |
| Rules | Full real soccer | 11v11, offside, fouls, set pieces, two halves |
| Shell | Tournament cup run — the Kata Cup | Group of four, semi-final, final |
| Street arena | **Separate unlockable exhibition**, not part of the cup | A walled no-out-of-bounds box contradicts a rulebook match |

---

## 3. World model

### 3.1 Coordinates

`(x, y, z, w)` in metres, `y` up.

| Axis | Meaning | Extent |
|---|---|---|
| `x` | Pitch length, goal to goal | −52.5 … +52.5 |
| `y` | Height | 0 … (unbounded) |
| `z` | Pitch width, touchline to touchline | −34 … +34 |
| `w` | The fourth axis, kata to ana | −3 … +3 |

The playing surface is the three-dimensional volume `(x, z, w)` at `y = 0`.

### 3.2 The hyper-goal

The goal mouth is a three-dimensional box: **7.32 m wide (`z`) × 2.44 m tall
(`y`) × 6 m deep (`w`)** — it spans the full W extent of the pitch. A goal is
scored when the ball's centre fully crosses `|x| = 52.5` within that box.

The keeper's dive reaches ±2.2 m in W, covering 4.4 m of the 6 m mouth. He
cannot cover all of it, but he covers most of it, and he actively tracks the
ball's slice. Beating him is a matter of separation and timing, not of walking
into empty space.

### 3.3 Boundaries

- `z = ±34` are touchlines. Ball out → **throw-in**.
- `x = ±52.5` are goal lines. Ball out → **corner** or **goal kick**.
- `w = ±3` are **walls**, not touchlines. The stands enclose the pitch through W.

The W walls are a deliberate invention. Treating W as a third pair of touchlines
would roughly double the rate of stoppages and destroy the flow of the match.

### 3.4 Entity thickness through W

Every actor is a 4D capsule with a half-thickness `T` along W. Its cross-section
at your slice is scaled by the chord

```
chord(Δw, T) = √(1 − (Δw / T)²)   for |Δw| < T, else 0
```

| Entity | `T` | Consequence |
|---|---|---|
| Outfield player | 1.2 m | Tackle window is ±1.2 m in W |
| Goalkeeper | 2.2 m | Dive reach through W |
| Ball | 0.3 m | You must match its slice closely to touch it — the 4D first touch |

An actor with `chord = 0` renders as a translucent dashed ghost and has no
collision with you.

---

## 4. Rendering

### 4.1 The renderer interface

Both renderers implement one interface, so switching is a single line plus a
`?renderer=a` URL override for side-by-side comparison:

```js
interface WorldRenderer {
  build(world)      // called once with the static 4D scene description
  setW(w)           // called each frame with the camera's W
  dispose()
}
```

Actors — players and ball — are rendered identically by both renderers using the
chord scaling above. Only static world geometry differs. If renderer B
disappoints in practice, we delete `PolytopeSlicer` and lose nothing else.

### 4.2 Renderer B — live 4-polytope slicing (default)

Static geometry (stands, stadium arches, goal frames, structural detail) is
authored as a soup of **4-simplices**: five vertices each, with per-vertex
colour.

Each frame we slice by the hyperplane `w = cameraW`. For each simplex, edges
whose endpoints straddle the hyperplane produce intersection points. A 4-simplex
split `k / (5−k)` yields `k·(5−k)` points, so at most **6** — a tetrahedron for a
1/4 split, a triangular-prism-like hexahedron for a 2/3 split. Those points are
coplanar per cell face and are triangulated straight into a preallocated
`Float32Array` backing a single `THREE.BufferGeometry`.

This is marching tetrahedra, one dimension up. As the camera moves through W the
stadium visibly morphs and re-forms — that is the whole reason for choosing B.

Performance controls:

- Simplices are bucketed by their W-interval; only straddling buckets are visited.
- Vertex and index buffers are preallocated at a fixed cap and reused; no
  per-frame allocation.
- Normals are per-triangle geometric (flat shading). Faceted is the correct look
  for a sliced polytope anyway.

### 4.3 Renderer A — slab renderer (fallback)

Static geometry is a set of ordinary 3D meshes, each with a W-interval. Meshes
outside the camera's slice fade out; meshes inside render normally. No
per-frame geometry work.

### 4.4 Camera

Third-person, behind and above the controlled player, looking along the attack
direction. Mouse controls yaw and a limited pitch. The camera sits at the
controlled player's W, which is what makes the cross-section *yours*.

---

## 5. Physics

Fixed timestep of 1/120 s, with rendering interpolated, so match simulation is
deterministic and independent of frame rate.

**Ball.** 4D position and velocity, gravity on `y`, quadratic air drag, and
spin. The Magnus force is a cross product of spin and velocity, so a struck ball
can curve in `z` **and** in `w`. A shot that bends through W around a committed
keeper is the signature goal of this game, and it emerges from the physics rather
than being special-cased. Bounce and rolling friction on `y = 0`; restitution off
the goal frame and the W walls.

**Players.** Acceleration-based movement with momentum and turning cost. Sprint
7.5 m/s, jog 5.2 m/s. **W-slide tops out at 2.5 m/s** and cannot be sprinted —
this single number is what keeps W a feint rather than an escape.

**Contact.** Player-ball and player-player contact require overlap in W as well
as in `x`/`z`. Tackles are resolved by a timing window; a mistimed tackle inside
the W window is a foul.

**Spatial queries.** One hash grid bucketing entities by `(x, z, w)` at 8 m
cells. `y` is too shallow to be worth bucketing. Same approach as Spider-Man's
`SpatialGrid`, one dimension up.

---

## 6. Rules

Implemented as a pure state machine: `stepMatch(state, inputs, dt) → state`.

**In play:** possession, tackles, shots, passes.

**Offside.** Unchanged from real soccer. The offside line is a hyperplane at
constant `x`, set by the second-last defender. W does not enter into it — a
player level in `x` is onside regardless of slice. This is deliberate: adding a
4D wrinkle to the single most argued-about rule in soccer would make it
unreadable.

**Fouls.** Mistimed tackles, holding, and dangerous play produce free kicks.
Yellow and red cards accumulate; a red reduces the offending side to ten.

**Restarts.** Explicit states for kickoff, throw-in, corner, goal kick, free
kick (direct and indirect), and penalty. Each restart places the ball, positions
both sides legally — including a legal spread through W — and enforces the
required distance.

**Match length.** Two halves of four real-time minutes, plus stoppage. Extra
time and penalties apply in knockout ties only.

---

## 7. Controls

| Input | Action |
|---|---|
| `W A S D` | Move in `x` / `z` |
| Mouse | Camera yaw and pitch |
| `Q` / `E` | Slide **kata** / **ana** through W |
| `Shift` | Sprint |
| LMB (hold) | Shoot, with a power meter |
| RMB | Pass to a team-mate |
| `Space` | Through-ball / lob |
| `F` | Slide tackle (when defending) |
| `C` | Switch to the player nearest the ball |
| `Esc` | Pause |

**HUD.** Scoreboard and clock; a conventional `(x, z)` radar; and a **W-ribbon**
— a vertical strip showing every nearby player's slice relative to yours, with
the keeper's coverage band highlighted when you're in a shooting position. The
W-ribbon is the single most important readability element in the game and should
be treated as a first-class feature, not decoration.

---

## 8. AI

Two layers, both with their decision logic in the pure block.

**Team layer.** A possession state machine — attacking, defending, transition —
that sets defensive line height, the pressing trigger, and marking assignments.

**Player layer.** Each AI player holds a role (GK, CB, FB, CM, W, ST) and derives
a home position in `(x, z, w)` from the formation and the ball. Default shape is
4-3-3.

**The 4D part.** The back line must **spread through W** to deny slices rather
than stacking on one `w`. A defence that stacks is walked through — which is
exactly the mistake a human player should be able to punish, and exactly the
thing lower difficulties should make more often.

**Difficulty** is two knobs: reaction lag, and W-tracking speed. Nothing else
changes between levels — no stat inflation.

**Keeper.** Positions in W by predicting the ball's arrival slice, with a
reaction lag that makes early separation genuinely rewarding.

---

## 9. Modes

**The Kata Cup** (main mode). Eight teams. A group of four — three matches, top
two advance — then semi-final and final. Extra time and a penalty shootout decide
level knockout ties. Progress persists to `localStorage`; if storage is
unavailable the cup runs in memory for the session.

**Friendly.** A single match against a chosen team at a chosen difficulty.

**Street arena** (unlocked by winning the Kata Cup). 3v3 in a walled 4D box,
no out-of-bounds, wall rebounds, no offside and no fouls. Explicitly arcade —
it exists because arcade is fun, and it is kept out of the cup so it does not
contradict the rulebook match.

---

## 10. Presentation

Web Audio synthesised SFX only, per repo convention: kick, whistle, crowd swell
on a shot, net ripple, and a distinct **W-slide whoosh** whose pitch tracks W
velocity so you can hear yourself phasing.

Visual identity: dark stadium, luminous polytope stands that morph as you slide,
two saturated team colours that stay distinguishable at ghost opacity.

Portal card added to the root `index.html` — an `<a class="game-card">` block
with a canvas thumbnail drawing and matching `--glow` / `--accent` variables,
consistent with the other seven games.

---

## 11. Code structure

Single self-contained `TesseractFC/index.html` with embedded CSS and JS, per repo
convention. Three.js from CDN, as Escape Room and Spider-Man do.

All logic that does not touch THREE or the DOM lives between
`// ==== PURE BEGIN ====` and `// ==== PURE END ====`, using plain `{x, y, z, w}`
objects. `tests/pure-tesseract.mjs` extracts it for `node --test`, mirroring the
existing Spider-Man arrangement.

In the pure block: 4D vector maths, the slicing algorithm, chord computation,
ball and player physics, the rules state machine, offside determination, AI
decision functions, and tournament bracket progression.

Outside it: THREE scene construction, buffer management, input handling, audio,
and HUD rendering.

---

## 12. Testing

`node --test "tests/**/*.test.mjs"`.

- **Slicer.** Slicing an *unrotated* tesseract with vertices at `(±1, ±1, ±1, ±1)`
  by the hyperplane `w = 0` must produce exactly the cube of side 2 centred on
  the origin — eight distinct vertices at `(±1, ±1, ±1)`, six square faces. The
  two cells at `w = ±1` must contribute nothing, since none of their edges
  straddle. This pins the entire slicing algorithm with a hand-checkable
  assertion. Further cases: slicing outside the extent yields nothing; a
  4-simplex split 2/3 across the hyperplane yields six points and 1/4 yields
  four; and the sliced geometry varies continuously as `w` advances in small
  steps.
- **4D maths.** Vector operations, and `chord()` at the boundaries (`Δw = 0`
  gives 1, `|Δw| ≥ T` gives 0).
- **Offside.** Known formations with the second-last defender at a known `x`,
  including the case where the attacker differs only in `w` and must be ruled
  onside.
- **Physics.** A ball struck with known spin lands within tolerance of a
  precomputed position; simulation is deterministic across runs.
- **Rules machine.** Every restart transition; card accumulation; a red card
  reducing the side to ten.
- **Tournament.** Group tables including tie-breaks, bracket progression, and a
  shootout resolving a level tie.

---

## 13. Failure handling

- **Three.js fails to load** → an explicit on-page message, not a blank canvas.
- **Frame time slips** → the slicer degrades before the game does: reduce
  simplex budget, then slice every other frame, then fall back to renderer A.
  The match simulation is never degraded, since it is fixed-timestep.
- **`localStorage` unavailable** → cup progress is held in memory for the session
  and the user is told once.
- **Pointer lock denied** → fall back to click-to-focus mouse handling.
- **Tab backgrounded** → pause the match and release all held inputs, matching
  the fix already applied to Spider-Man.

---

## 14. Build order

Three passes, each independently playable.

**Pass 1 — the core match.** 4D world, both renderers behind the interface, ball
physics, player movement including W-slide, 11v11 with formation AI, goals,
offside, the W-ribbon HUD, and a match clock. At the end of this pass the game is
a playable friendly, and we learn whether renderer B and free continuous W
actually feel good. Both are reversible here at low cost.

**Pass 2 — the rules layer.** Fouls, cards, free kicks, penalties, throw-ins,
corners, goal kicks, stoppage time, and the restart positioning logic.

**Pass 3 — the shell.** The Kata Cup with persistence, extra time, the penalty
shootout, the street-arena exhibition, audio polish, and the portal card.

---

## 15. Known risks

**Free continuous W makes defending hard.** This was chosen deliberately over
discrete lanes. The mitigations are the shallow 6 m depth, the 2.5 m/s W-slide
cap, and AI that spreads through W. If defending still feels hopeless after
Pass 1, the cheapest correction is lowering the W-slide cap, not adding lanes.

**Renderer B may prove disorienting.** This is why renderer A exists behind the
same interface from day one, and why Pass 1 ends with a comparison.

**Scope.** This is roughly four to six times the size of Spider-Man. The three
passes exist so that stopping after Pass 1 or Pass 2 still leaves a real game
rather than a broken one.
