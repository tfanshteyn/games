# Dino Sumo — design

Idea 16 from the game brainstorm, approved in chat on 2026-11-01 ("That's all perfect, start building it").

## Intent

A goofy two-player shoving game. Chunky cartoon dinosaurs in sumo belts try to push each other out of the ring. The joke is the contrast: the dinos are ridiculous, but they take it completely seriously, inside a grand, realistic sumo hall.

## Decided with the user

- **Players:** two on one keyboard. Player 1 uses WASD plus action keys; Player 2 uses the arrow keys plus action keys. Shove your rival out of the ring; the first to win 3 rounds is champion.
- **Funny physics:**
  - wobbly, floppy bodies
  - tiny-arm T-rexes that shove with the belly or tail
  - charged belly-bumps that bounce both dinos apart
  - face-first ragdoll flops
  - slow-motion knockouts with a cartoon "boing" and a crowd gasp
  - a taunt roar that comes out as a squeak
- **Dinos:**
  - T-rex: belly bump
  - Triceratops: horn charge
  - Stegosaurus: tail swipe
  - Brachiosaurus: long-neck slap
- **Realistic hall, in 3D:**
  - a clay ring with a straw-rope border
  - the hanging roof
  - wooden stands full of spectators
  - warm paper lanterns, dust in the light
  - a referee with a fan
  - realistic lighting and shadows
- **Tech:** a single `DinoSumo/index.html` using Three.js r128 from cdnjs (like Mini Golf and Spider-Man), with sounds generated in code. The physics gets Node tests, and the game gets a portal card.

## Builder's calls (Claude's)

- **Controls:**
  - P1: WASD to move, F (or Space) to shove, G to roar.
  - P2: arrow keys to move, Enter (or `/`) to shove, Right Shift (or `.`) to roar.
  - Hold shove to charge, then release to attack. A quick tap gives a weak attack.
- **1-player mode** against a simple CPU dino, so a lone player can play too. Two players is the default.
- **Physics:** 2D on the ring plane, in a PURE block (no THREE or DOM) tested via `tests/pure-dinosumo.mjs`. Bodies are circles with mass. Bumping uses bouncy restitution. A big hit causes a "flop" (no control, slides further). A ring-out happens when the centre crosses the rope. All flying, tumbling and squash-and-stretch is visual only.
- **Round flow:**
  1. Ready: the referee raises the fan and shouts "Hakkeyoi!"
  2. Fight.
  3. Knockout: slow motion, then a joke move name (for example "Belly Bounce-Out").
  4. Next round.
- **Keyboard first** (1-player mode also takes the left mouse button to charge).
- **Phones (user's call):** touch screens play 1 player vs the CPU only, with a floating stick on the left and SHOVE / ROAR buttons on the right. Phones cap the pixel ratio at 2 to keep the frame rate up.

## Visual upgrade (user request, mid-build)

The user then asked for "premium, modern" visuals: full device-pixel-ratio rendering, detailed entities instead of basic shapes, cinematic lighting, bloom, vignette, camera shake, a colour-shifting particle system and a thin-line HUD. The request was written for a 2D space shooter (thrusters, neon hulls), so each item was applied to fit the sumo hall:
- **Rendering:** the full `devicePixelRatio` and a bloom pass.
- **Dinos:** sculpted bodies with skin bump maps and fresnel rim lighting, eyes with blinking lids, and eyebrows that scowl.
- **Lighting:** a volumetric light shaft and a glowing roof panel.
- **Particles:**
  - dust that fades from tan to grey
  - impact sparks that cool from orange to cinder grey
  - salt tossing
  - thrown cushions
- **HUD:**
  - thin-line nameplates with glowing balance bars, showing how far each dino is from the rope
  - a circular ring diagram showing where both dinos are
  - charge rings around each dino

## Non-goals

- No gore and no real injury: a knocked-out dino flops, then bounces back up.
- No online play, no unlocks, no story.
