# Spider-Man: Brand New Day — Phase 1 Design (Traversal Core + Mission 1)

**Date:** 2026-09-04
**Status:** Approved in brainstorming, awaiting spec review
**Location:** `SpiderMan/index.html` (new game in the portal)

## 1. Summary

A 3D third-person web-swinging game set in an open procedural city, themed on the
2026 MCU film *Spider-Man: Brand New Day*. Uses the Spider-Man name and branding
(user decision; fan work on Marvel IP, hosted on the public GitHub Pages portal).

The full game is a 5-mission story. This spec covers **Phase 1 only**: the complete
traversal core (city, swing, crawl, zip, camera, HUD, minimap, audio) plus
**Mission 1 — "Rooftop Reboot"**, with an objective system designed so Missions 2–5
plug in later as new step types. Each later mission gets its own spec.

## 2. Story arc (whole game, for context)

Peter is alone in a city that has forgotten him. Crime is spiking, and someone is
arming street gangs with venom-green gamma tech.

1. **Rooftop Reboot** *(Phase 1)* — First night back on patrol. Tutorial: swing,
   crawl, zip. Stop a smash-and-grab; the thieves carry strange green tech.
2. **The Sting** — Chase a getaway truck; Mac Gargan's crew. First sight of
   **Scorpion**, who wrecks the truck to bury evidence and escapes. Boss tease.
3. **Crossfire** — Gang war. Save civilians while the **Punisher** is already
   killing gangsters; web thugs before Castle reaches them. Standoff; Punisher
   leaves a lead on Gargan.
4. **Code Green** — Gargan's tech is gamma-based; a test goes wrong and **Hulk**
   rampages through midtown. Containment set-piece; Banner becomes an ally and
   reveals the lab location.
5. **Brand New Day** *(finale)* — Assault on Scorpion's waterfront lab. Boss fight
   vs. gamma-boosted Scorpion (tail sweeps, wall-climbing, acid spray). Win state:
   Scorpion webbed to a crane at dawn. The city knows Spider-Man again.

## 3. Decisions made

| Topic | Decision |
|---|---|
| Perspective | 3D third-person chase camera |
| Renderer | Three.js **r128 from cdnjs** (same tag as Escape Room) |
| Physics | Hand-rolled: AABB collision + rope-length constraint (no physics library) |
| Swing targeting | Auto-anchor (forward cone), plus aimed **zip** (E) |
| Controls | Pointer-lock mouse-look + WASD, Space jump, hold LMB swing, E zip, Esc pause |
| Art style | Stylized low-poly comic: flat shading, bold palette, daytime sky, comic text pops |
| Architecture | Single self-contained `index.html` per portal convention |
| Phase 1 scope | Traversal core + Mission 1 |

Approaches rejected: physics engine via CDN (fights superhero movement, extra
dependency), kinematic scripted swings (canned feel).

## 4. File layout & scene

Single `<script>` with clearly labeled sections in this order:
`CONFIG → AUDIO → INPUT → CITY → HERO → WEB → CAMERA → MISSIONS → HUD → MAIN LOOP`.
Sections communicate via a few plain objects (`hero.pos/vel/state`,
`city.buildings[]`, `mission.current`). No framework.

- **Loop:** fixed 60 Hz physics step with accumulator; render every rAF.
  Fullscreen canvas, resizes with window.
- **Lighting:** hemisphere light + one directional sun. Shadows **off** (perf).
  Gradient sky dome.
- **Materials:** `MeshLambertMaterial`, flat shaded, no textures. ~8 bold comic
  building colors; darker roof caps; window grids as emissive strips on a shared
  material.
- **Comic pops:** "THWIP!", "WHAM!" billboard sprites that scale up and fade.
- **Hero model:** primitives only (capsule body, sphere head, box limbs), red/blue,
  black web-lines as thin line segments on red parts, white eye shapes. ~200 tris.
  Thin black outline via slightly scaled `BackSide` mesh. Procedural poses per state
  (arms up swinging, spread falling, crouched crawling) — no skeletal animation.

## 5. City generator

- **Grid:** 12×12 blocks, ~40 m per block, 10 m streets → ~600 m across.
- **Seeded PRNG** — layout identical every load (missions need stable landmarks).
- **Buildings:** 1–4 per block, varying footprints. Heights mostly 20–60 m, ~10%
  towers up to 120 m. Low-rise zone along one edge = waterfront (reserved for
  Mission 5). Fixed landmarks in the seed: tall central spire; crane at waterfront.
- **Collision primitive:** every building is an AABB `{min, max, color}`. This is
  the only collision shape in the game.
- **Streets:** road strips, lane lines, static props (box cars, lamp posts) as
  `InstancedMesh`. Civilians as two-box figures walking sidewalk rails; visual
  only in Phase 1.
- **Anchor selection (runtime, not precomputed):** on swing request, sample top
  edges/corners of buildings in a forward cone (±35°, 15–70 m away, ≥8 m above
  hero); pick the best "forward and up" candidate. Fallback: phantom sky anchor
  when hero is far above all buildings, so the player is never stranded.
- **Performance:** buildings merged into a few `BufferGeometry`s by color (~8 draw
  calls). Target 60 FPS on integrated graphics.

## 6. Hero movement state machine

Hero = capsule (~1.8 m) with `pos`, `vel`, `state`. Collision vs. nearby AABBs
via a spatial grid bucketed per block (~10 checks/frame).

| State | Enter | Behavior | Exit |
|---|---|---|---|
| **Ground** | land on street/rooftop | WASD run relative to camera (8 m/s, sprint 12). Space jump; double-tap = high jump | walk off edge → Air; Space → Air; hold LMB → Swing |
| **Air** | jump / fall / swing release | gravity 22 m/s²; light WASD air steering; Space near wall → wall-jump | touch ground → Ground; touch wall while moving into it → Crawl; hold LMB → Swing |
| **Swing** | hold LMB with valid anchor | Rope constraint: if `dist(pos, anchor) > ropeLen`, project onto sphere and remove outward velocity component; gravity drives pendulum. W pumps (small force along velocity); A/D lateral. Rope shortens ~10% over the arc | release LMB → Air with +20% velocity if released on upswing; anchor passes behind → auto-release |
| **Crawl** | air/ground contact with vertical face | Glued to face; WASD moves along it (4 m/s); gravity off; auto-rounds top edge onto roof; Space jumps away from wall | reach roof → Ground; Space → Air; hold LMB → Swing |
| **Zip** | tap E aiming at roof/edge ≤60 m | Straight dash to aim point at 40 m/s; brief invulnerability | arrive → Ground/Crawl |

- Momentum carries across states. No fall damage; high-speed landing plays a short
  roll.
- Web strand: thin cylinder hero→anchor each frame + impact splat sprite at anchor.
- All feel knobs (gravity, rope pump, release bonus, cone angles, speeds) live in
  `CONFIG` for fast tuning. Expect 2–3 play-test tuning passes.

## 7. Camera

Pointer-lock chase camera orbiting a target 2 m above the hero.
- Distance 7 m, stretching to 10 m at high speed. FOV 60°→75° with speed.
- Spring-damped follow.
- Raycast vs. AABBs; pull camera in when a building occludes the hero.
- Auto-realign toward velocity direction only after 1.5 s of mouse idle.

## 8. Objective system & Mission 1

```
mission = { id, title, steps: [ { type, target, onComplete } ], current }
```

Phase 1 step types: `reach`, `collect`, `interact`, `chase`, `webUp`.
Later phases add `escort`, `defend`, `boss` — same shape.

Alerts render as a pulsing world marker + edge-of-screen arrow + HUD distance.

**Mission 1 — "Rooftop Reboot"**
1. Wake on a rooftop. Card: *"Nobody remembers Peter Parker. Time to remind them
   about Spider-Man."*
2. `reach` — marked rooftop 150 m away. Hint overlay: "Hold LMB to swing".
3. `collect` — 5 web-cartridge tokens on building faces and roof edges (teaches
   crawl + zip).
4. `chase` — getaway van on a fixed street loop; stay within 30 m for 20 s.
5. `webUp` — van crashes at a plaza; 3 thugs scatter. Tap LMB within 5 m → cocoon
   + "THWIP!". Web all three.
6. Pick up glowing green tech device (`interact`) → card teasing Mission 2 →
   **Free Roam** unlocked (token collecting + score).

Failure only possible on step 4 (lose the van → step restarts). Progress saved to
`localStorage`.

## 9. HUD, audio, portal

- **HUD:** objective text + distance (top-left); circular canvas-2D **minimap**
  (bottom-right: buildings as blocks, objective dot, hero arrow); speed readout;
  center prompts. **Esc** pause menu: Resume / Restart mission / Controls.
- **Audio (Web Audio synth, no files):** "thwip" (filtered noise burst), wind swell
  scaled by speed, release whoosh, landing thud, token chime, web-up hit, short
  synth theme on title card.
- **Portal card** in root `index.html`: `--accent:#e62429`, red/blue glow, tag
  "3D Web-Swinging", canvas thumbnail of skyline silhouette with swing arc.
- **CLAUDE.md**: add the game to the repository structure list.

## 10. Testing

No test framework in this repo (pure browser games). Verification is:
- Manual play-test checklist per state transition in §6 (each row's enter/exit).
- Anchor selection never returns "no anchor" while hero is below 200 m altitude.
- Camera never clips inside a building during a full city lap.
- Mission 1 completable start to finish; van-loss restarts step 4 only.
- 60 FPS on integrated graphics with the browser's FPS meter.
- Portal card loads the game; game loads with and without a prior `localStorage` save.

## 11. Out of scope for Phase 1

Missions 2–5, combat beyond web-up, enemy AI, boss fights, damage/health, day-night
cycle, skeletal animation, mobile/touch controls.
