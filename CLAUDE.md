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
tests/                  — Node tests for the pure-logic blocks of Spider-Man, Tesseract FC and Mini Golf (`node --test "tests/**/*.test.mjs"`)
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

Realistic 3D adventure mini golf. Spec: `docs/superpowers/specs/2026-10-31-mini-golf-3d-design.md`. Playable: Sunny Park and Pirate Cove (15 holes each); the other four themes show "Coming soon". Each course has a `style` (`park` / `beach`) that picks ground, borders, props and scenery.

- **Pure block**: physics, hole parsing and course data between the PURE markers; `tests/pure-minigolf.mjs` loads it. A brute-force bot (`botPlay`) proves every hole can be finished — run the course tests after editing any hole.
- **Holes are ASCII grids of 0.5 m cells**: `g` green, `@` tee, `o` cup, `^v<>` ramp rising that way, `w` water, `=` bridge, `t` tunnel mouth, `.` scenery, plus Pirate Cove's `s` sand (slows the ball hard), `d` ship deck, `p` plank (narrow strip over water, no rails). Optional `levels` grid (digit × 0.25 m). `extras`: `hill`, `bumper`, `windmill` (`front` = side the blades face, toward the approaching ball), `tunnel`, `lift`, `loop` (needs a 1-cell channel), `slider`, `pendulum`, `post`, `cannon`, `ship` (decoration over the `d` cells).
- **Machines that carry the ball** (tunnel, lift, loop, cannon) use `ball.transport`: a timed path the ball follows, then an exit position and velocity.
- **Walls are generated**: borders where course meets scenery, rails between bridge and water, step faces between levels (they stop only the ball on the lower side).
- **Colours**: r128 treats colour codes as linear; flat-colour materials are converted with `convertSRGBToLinear()` so they don't render washed out.
- **Controls**: drag down for power, sideways to aim, release to putt; ←→ aim, ↑↓ power, Space putt, V overview.
