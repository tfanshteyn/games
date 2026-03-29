# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NEON RUNNER — a browser-based Mario-style platformer built as a single-file HTML5 Canvas game (`index.html`, ~1580 lines). Zero external dependencies, no build system.

## Running

Open `index.html` in any modern browser. No build step, no server required. Works offline.

## Architecture

Everything lives in `index.html` — embedded CSS + JavaScript using Canvas 2D API. The game loop runs at 60 FPS via `requestAnimationFrame`.

**Frame cycle:** `loop()` → `update()` → `render()`

### Key Systems (by line region)

- **Audio** (~50-78): Web Audio API synthesizer — all SFX are generated oscillator tones, no audio files
- **Game State** (~82-98): State machine with states `menu`, `playing`, `dead`, `levelComplete`
- **Input** (~102-131): Action-mapped keyboard system (Arrow Keys + WASD + Space/Shift)
- **Tile System** (~134-171): 32×32 pixel tile grid. Tile chars: `#` ground, `B` brick, `?` question block, `P`/`p` pipe, `S` spike, `G` goal, `-` platform, `^` spring, `L` lava
- **Entity markers in levels**: `@` player spawn, `c` coin, `e`/`f`/`j` enemies (walk/fly/jump), `*` star, `m` mushroom, `F` flag
- **Levels** (~196-276): 4 ASCII-art levels parsed by `parseLevel()`
- **Physics** (~387-395): Gravity 0.45, max fall 9, walk 2.8, run 4.5, jump -9.5, friction 0.82/0.92 (ground/air)
- **Collision** (~359-382, ~529-593): Tile-based with separate X/Y resolution. One-way platforms, hazard checks
- **Player** (~427-527): Jump buffering (8 frames), coyote time (6 frames), variable jump height
- **Entities** (~699-843): Coins, 3 enemy styles (walk/fly/jump), powerups (star/mushroom), flag goal
- **Block interaction** (~595-668): Question blocks reveal items, bricks break when player is big
- **Particles/Effects** (~845-898): Emission system, trails, floating text, glow effects
- **Camera** (~899-906): Horizontal follow with smooth tracking, player at 30% from left
- **Rendering** (~921-1568): Parallax background, tile culling, animated sprites, HUD, menu/death/complete screens

### Key Data

- Canvas: 960×540 (16:9)
- Tile size: 32px
- Player size: 24×32px
- Every 50 coins = 1UP

## Controls

- Move: Arrow Keys / WASD
- Jump: Space / Enter / Up / W
- Run: Shift
