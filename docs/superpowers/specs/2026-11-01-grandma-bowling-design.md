# Grandma Bowling — design

Idea 5 from the second multiplayer list, brainstormed with the user on 2026-11-01.

## Intent

A ten-pin bowling game that is **as realistic as humanly possible** and **dramatic**. Deadly serious old ladies compete in a modern 2026 bowling centre. The comedy comes from how seriously and theatrically the grannies take it, not from cartoon looks. The drama comes from a "director" that turns tense moments into cinema.

It joins the portal next to Mini Golf 3D and Dino Sumo, and it must be playable on a phone as well as a computer.

## Decided with the user

- **Real-skill bowling.** You choose where to stand, which arrow to aim at, how fast to throw and how much to rotate your hand. Spin makes the ball hook.
- **Every realism dial "all the way":**
  1. **Real lane oil.** The oil pattern is heavy in the front part of the lane and dry toward the pins. A spinning ball skids, then hooks, then rolls. Hook depends on the oil the ball crosses.
  2. **Real pin physics.** Ten real-shaped, real-weight 3D pins collide with the ball, each other, the kickbacks, the pin deck and the pit. Messengers, tap-outs (a pin left standing on a good hit), wobbling pins and splits all come out of the simulation, not from scripts.
  3. **Ball choice.** Weights from 6 to 16 lb, and covers from a plastic house ball (goes nearly straight) to a reactive ball (hooks hard).
  4. **The full approach.** Standing board, target arrow, speed and hand rotation.
  5. **The lane changes as you play.** The oil wears down where balls roll and gets carried toward the pins, so the right line shifts during a game.
  6. **A photo-real alley.**
  7. **A modern bowling centre, as in 2026:** dark and sleek, with LED lane lights, big overhead screens, a black-light glow and glossy lanes. Not retro.
  8. **Realistic sound:**
     - the ball rolling
     - the crack of a strike, distinct from a light hit
     - the pinsetter
     - the crowd
  9. **Realistic grannies** who take bowling deadly seriously.
- **Dramatic moments**, all eight wanted:
  1. **Last-frame showdown:** the lights dim, the crowd goes quiet, the camera follows the ball.
  2. **Wobbling pin:** slow motion while a teetering pin decides.
  3. **The 7-10 split** and other big splits: the alley erupts if one is converted.
  4. **Perfect-game chase:** the crowd gathers and the screens flash.
  5. **Gutter heartbreak:** a groan from the crowd.
  6. **The rival grannies' reactions:** pearl-clutching, praying, the evil eye, victory dances.
  7. **The comeback:** music builds and the screens show the gap closing.
  8. **A jammed pinsetter:** a comic pause before a big throw.
- **The director.** Ordinary throws stay quick, and the cinema switches on only when a moment is actually tense.
- **Turn-based play,** so it works passed around one phone or on a computer.

## Constraints

- **One file:** `GrandmaBowling/index.html`, in the portal's single-file style. Three.js r128 comes from cdnjs, plus r128's own example scripts (post-processing, reflector) from jsDelivr, as Dino Sumo does. There's no build step and no audio files: all sound is synthesised with Web Audio.
- **Physics:** in a PURE block (no THREE or DOM) with Node tests, following `tests/pure-dinosumo.mjs`.
- **Phones:**
  - It must run smoothly. Scale the pixel ratio and shadows down on phones, as Dino Sumo does.
  - Touch controls.
  - Sound must work with the iPhone silent switch: set `navigator.audioSession` to playback and unlock audio on a finished tap.
- **The portal:** add a card with an animated thumbnail to the root `index.html`, and update CLAUDE.md.

## Real-world numbers to build on

- **Lane:** 18.29 m from the foul line to the head pin and 1.0541 m wide (39 boards). There are gutters on both sides and an approach of about 4.6 m. Aiming arrows sit about 4.6 m past the foul line.
- **Pins:** 38.1 cm tall, about 1.53 kg each, set in a triangle with centres 30.48 cm apart.
- **Ball:** 21.6 cm in diameter.
- **Oil:** a typical "house shot" is oiled for about the first 12 m. It's heavier in the middle boards and lighter on the outside, which helps the ball steer back. Oiled boards have very low friction (about 0.04) and dry boards about 0.2.
- **Typical throws:**
  - a ball speed of about 7–9 m/s
  - a rev rate of 250–400 rpm for a hook bowler
  - a strike pocket between the 1 and 3 pins (1 and 2 for left-handers) at about a 4–6° entry angle

## Players and modes (Claude's guesses; the user said "perfect")

- **Players:** 1–4 human players taking turns, plus CPU grannies to fill seats or play solo.
- **Scoring:** standard ten-pin, 10 frames, strikes and spares, with bonus balls in the 10th frame. Shown on modern overhead screens.
- **The grannies:** each one is a character with a name and a personality, which drive her reactions and her bowling style (straight or big hook, speed). Human players pick a granny to bowl as.

## Decided after the review (user: "start building it")

The user went ahead without choosing, so Claude's suggestions stand:
- **Built in stages**, as Mini Golf was.
  - **Stage 1** is the bowling itself: ball and oil physics, rigid-body pins, scoring, throw controls and 1–4 players on a good-looking modern lane. Check the pin physics here, before stacking visuals on top.
  - **Later stages:** the grannies, the photo-real centre and the director's dramatic moments, then CPU grannies.
- **Everything built in code:** no downloaded models or images. The grannies are as realistic as code allows.
- **Phones are held upright (portrait).** Desktop works at any window shape.

## Builder's calls

- **Controls (Claude's call):** a three-step throw.
  1. Slide to choose the standing board.
  2. Aim at an arrow; a faint target line shows on the lane.
  3. Swipe or drag forward to release. The swipe's speed sets the ball speed, and its sideways curl sets the hand rotation, which gives the spin. Keyboard and mouse on a computer; touch on a phone.

  Pros use a real approach, so the controls should reward consistency. The same swipe should give the same ball, with only a little human variance.
- **CPU grannies:** they "throw" through the same physics with personality-based skill and a little error, so they can miss too.
- **How the pin physics is built:** a small rigid-body simulation in the PURE block. For example, pins as compound spheres or capsules with tipping, rolling, restitution and friction, using sub-stepping for stability. Pin-to-pin and pin-to-ball contact, with the kickback walls and pit. Must be tuned and tested so that:
  - a pocket hit at the right angle usually strikes
  - a light or high hit leaves realistic leaves (the 10 pin, the 4 pin, splits)

  If an in-house solver can't reach believable results, stop and ask the user before adding a physics library. That would break the "Three.js only" convention.
- **Visual pipeline (realistic):**
  - the lane reflects the pins and lights; using r128's `Reflector` or an equivalent is allowed
  - bloom
  - the pin deck lit brightly, the rest of the centre darker
  - LED strips and screens glowing
  - a realistic granny model with a procedural four-step approach and release animation, and reaction animations

  Detail level and technique are the builder's call, with "photo-real" as the bar.
- **The director's rules:** exactly when each dramatic moment triggers, and how long the slow motion lasts. Keep ordinary throws snappy, under about 6 seconds from release to the next player's turn.

## Non-goals

- No online play, leagues, unlocks or story.
- No bumpers, no cartoon power-ups and no arcade physics.

## Anti-goals: things that would make it a failure even if it works

- Pins that fall in scripted or "fake" ways.
- A ball that moves on rails.
- A cartoon look.
- Drama that slows down every throw.
