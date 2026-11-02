# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A browser-based game portal hosting HTML5 games. Each game is a self-contained single-file `index.html` — no build system, no bundler. The root `index.html` is the portal landing page with animated thumbnail cards linking to each game. Hosted via GitHub Pages from `tfanshteyn/games`.

## Running

Open any `index.html` in a modern browser. No build step or server required. All games work offline except Escape Room 3D (loads Three.js from CDN).

## Repository Structure

```
index.html              — Portal landing page (card grid with canvas thumbnails)
DinoDash/index.html     — Dino Dash: Mario-style platformer (Canvas 2D, ~2350 lines)
VoidDrift/index.html    — Void Drift: neon space shooter (Canvas 2D, ~1700 lines)
AlpineDescent/index.html— Alpine Descent: 3D ski racing (Three.js inline, ~1400 lines)
Cascade/index.html      — Cascade: chain-reaction puzzle (Canvas 2D, ~1700 lines)
VoidArena/index.html    — Neon Clash: feudal arena brawler (Canvas 2D, ~2900 lines)
escape-room/index.html  — Escape Room 3D: 20-level puzzle (Three.js via CDN, ~2400 lines)
SpiderMan/index.html    — Spider-Man: Brand New Day: 3D web-swinging open city (Three.js via CDN, ~1150 lines)
MiniGolf/index.html     — Mini Golf 3D: realistic adventure mini golf, 6 themed courses (Three.js via CDN)
DinoSumo/index.html     — Dino Sumo: goofy 2-player dino sumo in a realistic 3D sumo hall (Three.js + r128 post-processing via CDN)
GrandmaBowling/index.html — Grandma Bowling: realistic ten-pin bowling in a modern 2026 centre (Three.js + r128 examples via CDN)
tests/                  — Node tests for the pure-logic blocks of Spider-Man, Tesseract FC, Mini Golf, Dino Sumo and Grandma Bowling (`node --test "tests/**/*.test.mjs"`)
DinoDash/TODO.md        — Improvement ideas for Dino Dash
```

## Conventions

- **Single-file architecture**: each game is one self-contained HTML file with embedded CSS + JS. Keep it that way.
- **No external dependencies** except Three.js where 3D is needed (Alpine Descent embeds it inline; Escape Room loads from CDN).
- **Portal card**: when adding a new game, add a `<a class="game-card">` block in the root `index.html` with a canvas thumbnail drawing and matching `--glow`/`--accent` CSS vars.
- **Audio**: games use Web Audio API synthesized SFX — no audio files.
- **Game loop**: `requestAnimationFrame`-based, typically 60 FPS.

## Dino Dash (DinoDash/) — Details

The flagship platformer, originally "Neon Runner". Most detailed game with ASCII-art level design.

- **Tile System**: 32×32px grid. Tile chars: `#` ground, `B` brick, `?` question block, `P`/`p` pipe, `S` spike, `G` goal, `-` platform, `^` spring, `L` lava
- **Entity markers**: `@` player spawn, `c` coin, `e`/`f`/`j` enemies (walk/fly/jump), `*` star, `m` mushroom, `F` flag
- **Physics**: Gravity 0.45, max fall 9, walk 2.8, run 4.5, jump -9.5, friction 0.82/0.92 (ground/air)
- **Player mechanics**: Jump buffering (8 frames), coyote time (6 frames), variable jump height, wall jump/slide
- **Canvas**: 960×540 (16:9), player size 24×32px
- **Controls**: Arrow Keys / WASD to move, Space/Enter/Up/W to jump, Shift to run

## Spider-Man: Brand New Day (SpiderMan/) — Details

3D third-person web-swinging in a procedural 12×12-block city. Spec: `docs/superpowers/specs/2026-09-04-spiderman-brand-new-day-design.md`.

- **Pure block**: logic between `// ==== PURE BEGIN ====` and `// ==== PURE END ====` uses plain `{x,y,z}` objects and no THREE/DOM; `tests/pure.mjs` extracts it for `node --test "tests/**/*.test.mjs"`.
- **Collision**: every building is an AABB; `SpatialGrid` buckets them per 50 m cell.
- **Hero states**: ground / air / swing / crawl / zip in `stepHero`. Feel constants live in `CONFIG`.
- **Missions**: `createMission` + `updateMission` step types `reach, collect, chase, webUp, interact`; Mission 1 geometry from `mission1Def(city)`.
- **Controls**: WASD move, Shift sprint, Space jump (tap on landing = high jump), hold LMB swing, E zip/interact, Esc pause.

## Mini Golf 3D (MiniGolf/) — Details

Realistic 3D adventure mini golf. Spec: `docs/superpowers/specs/2026-10-31-mini-golf-3d-design.md`. All six courses are playable, 15 holes each: Sunny Park, Pirate Cove, Volcano Island, Castle Kingdom, Frozen Peaks and Robot Factory. Each course has a `style` (`park` / `beach` / `jungle` / `castle` / `ice` / `factory`) that picks ground, borders, props and scenery.

- **Pure block**: physics, hole parsing and course data between the PURE markers; `tests/pure-minigolf.mjs` loads it. A brute-force bot (`botPlay`) proves every hole can be finished — run the course tests after editing any hole.
- **Holes are ASCII grids of 0.5 m cells**: `g` green, `@` tee, `o` cup, `^v<>` ramp rising that way, `w` water, `=` bridge, `t` tunnel mouth, `.` scenery, plus Pirate Cove's `s` sand (slows the ball hard), `d` ship deck, `p` plank (narrow strip over water, no rails), and Volcano Island's `L` lava (a hazard like water) and `j` trampoline (throws a falling ball back up), Castle Kingdom's `D` drawbridge (moat when raised), Frozen Peaks' `i` ice (barely slows the ball) and `n` snow (drags it to a stop), and Robot Factory's `N S E W` conveyor belts (run that way; every belt must run out onto open course, never into a wall) — `L` is molten metal there. Optional `levels` grid (digit × 0.25 m). `extras`: `hill`, `bumper`, `windmill` (`front` = side the blades face, toward the approaching ball), `tunnel`, `lift`, `loop` (needs a 1-cell channel), `slider`, `pendulum`, `post`, `cannon`, `ship` (decoration over the `d` cells), `volcano` (decoration), `drawbridge`, `portcullis` (a gatehouse with a timed gate), `castlewall` (decoration), `chute` (a bobsled run / marble-run tube from an upper mouth down to a lower one through `via` points; the ball follows a smoothed Catmull-Rom line), `press` (a hydraulic press: the portcullis mechanism with a factory model). Timed machines are deterministic in the sim time `t`; balls are never left resting where one sweeps (`clearOfMachines`).
- **Machines that carry the ball** (tunnel, lift, loop, cannon, chute) use `ball.transport`: a timed path the ball follows, then an exit position and velocity.
- **Walls are generated**: borders where course meets scenery, rails between bridge and water, step faces between levels (they stop only the ball on the lower side).
- **Colours**: r128 treats colour codes as linear; flat-colour materials are converted with `convertSRGBToLinear()` so they don't render washed out.
- **Reflections**: materials in `SHINY` get an environment map built per course from a painted sky panorama (`updateEnvironment`, PMREM `fromEquirectangular`; `fromScene` rendered black in r128). `userData.env` scales a material's reflection (water 0.3).
- **Controls**: drag down for power, sideways to aim, release to putt; ←→ aim, ↑↓ power, Space putt, V overview.

## Dino Sumo (DinoSumo/) — Details

Goofy cartoon dinosaurs in sumo belts shove each other out of a realistic sumo ring. Spec: `docs/superpowers/specs/2026-11-01-dino-sumo-design.md`.

- **Pure block**: top-down physics on the ring plane (x/z metres, angles from +x toward +z), match flow and the CPU, between the PURE markers; `tests/pure-dinosumo.mjs` loads it. All flying, tumbling and squash-and-stretch is visual only.
- **Rules**: a dino whose centre crosses `CONFIG.ringR` is out; first to `winsNeeded` (3) wins. Hold the shove key to charge, release to attack: T-Rex `bump` and Triceratops `horn` lunge and hit on contact; Stegosaurus `swipe` (all round) and Brachiosaurus `slap` (front cone) strike at the end of the wind-up. A hit leaves a steady dino `stun`ned; a second hit while dizzy, or a big hit while off balance (charging or mid-attack), makes it `flop`. Tests guard that no single full-power hit from the start lines ends a round.
- **Rendering**: full `devicePixelRatio`; `EffectComposer` → `UnrealBloomPass` → a finishing pass (vignette, grain, lens fringe, sRGB conversion: materials write linear tone-mapped colour into the render target). Falls back to a plain render if the CDN passes don't load. `rimify()` adds a fresnel rim light to character materials; `sculpt()` reshapes primitive geometry vertex by vertex.
- **Effects**: one `particles` manager (two `Points` layers: soft dust and additive sparks) with per-particle life, drag, gravity, size curve and colour ramp; salt is thrown before each bout, and the crowd throws cushions after a ring-out.
- **Controls**: P1 WASD, hold F/Space to charge, G roar. P2 arrows, hold Enter or `/`, Right Shift or `.` roar. In 1-player mode P1 may also use arrows and the left mouse button; Esc pauses. Touch screens (`pointer: coarse`, or `#touch` in the URL to test on desktop) are 1-player vs CPU only: drag on the left for a floating stick, hold SHOVE, tap ROAR; phones cap the pixel ratio at 2 and use a 2048 shadow map.

## Grandma Bowling (GrandmaBowling/) — Details

Ten-pin bowling as realistic as possible, in a modern 2026 bowling centre. Spec: `docs/superpowers/specs/2026-11-01-grandma-bowling-design.md`. It's being built in stages. Stage 1 (physics, scoring, controls, the lane) is done; the grannies, the photo-real centre, the drama "director" and CPU grannies come later.

- **Pure block**: an in-house rigid-body simulation between the PURE markers; `tests/pure-bowling.mjs` loads it. World frame: y up, z down the lane (foul line z = 0, head pin at 18.288 m), x toward the bowler's **left**. Boards count from the right gutter (board 1) to board 39; use `boardX` / `xBoard`.
- **Ball**: a rigid sphere with Coulomb friction from the oil map, so it skids, hooks and rolls on its own. `releaseBall` turns a throw `{ board, target, speed, revs, axis, hand, cover, lb }` into a velocity and a spin vector. Covers (`COVERS`) scale the friction: plastic barely hooks, reactive hooks hard.
- **Oil**: `createLane` makes a crowned house shot, 12.2 m long; `wearLane` dries the ball's track and carries oil down after each roll.
- **Pins**: the regulation profile (`PIN_PROFILE`, 1.53 kg) with mass properties integrated from it. Collision uses spheres along the axis plus a flat base ring, so pins stand, teeter and fall. Contacts use sequential impulses at 800 Hz, and bodies sleep. Kickbacks, gutters, the pit and the back cushion are all modelled. A pin counts as standing if it is upright on the deck (`isStanding`).
- **Scoring**: `frameState(rolls)` handles standard ten-pin scoring with the 10th frame, `frameMarks` gives scoreboard marks, `createGame` / `recordRoll` run hot-seat turns.
- **Tests guard the realism**: straight ball dead straight; side spin hooks the right way, mostly after the oil; reactive > urethane > plastic; nose hits rarely strike; a good hook line strikes about 30–95% of the time with human error.
- **Rendering**: lane over a `THREE.Reflector` (desktop) for real reflections; bloom plus finishing pass. Phones cap the pixel ratio at 2 and skip the mirror.
- **Controls**: drag low to choose the standing board, drag higher to move the target arrow, swipe the ball to throw (speed = swipe speed, curl = more hook). Keyboard: ← → stand, A / D target, Q / E hand rotation, hold Space for speed.
