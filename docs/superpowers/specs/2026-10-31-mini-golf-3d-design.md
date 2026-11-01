# Mini Golf 3D — Design Spec

**Date:** 2026-10-31
**Folder:** `MiniGolf/index.html`
**One line:** A realistic 3D adventure mini-golf game — six themed courses you can pick freely, 10- or 15-hole rounds, 1–4 players taking turns on one computer.

---

## 1. Intent

The user wants a mini-golf game that looks and plays like **an actual mini-golf course people go to**:
green carpet, brick and timber borders, a windmill, ponds with little bridges, tunnels, rolling slopes,
and — on later courses — the theme-park machines real adventure-golf parks have (ball lifts, loops,
cannons, conveyors, set pieces).

"Realistic" means all three of: the **look** (lighting, shadows, materials), the **ball physics**
(true-to-life roll, slope break, wall bounce, cup capture) and a **single realistic mode** — there is
no separate "crazy mode". Every mechanism is a believable physical park prop; the ball only ever does
what physics allows.

Audience: ages 12 and up. Played on the GitHub Pages portal (`tfanshteyn/games`), on desktop and phone.

## 2. Decisions already made (by the user)

| Decision | Choice |
|---|---|
| Camera / dimension | **3D**, camera behind the ball (chosen over top-down 2D) |
| Realism | Realistic look **and** physics; **one mode only** |
| Mechanisms | **All 14** from the brainstorm menu, each built as a real park prop |
| Courses | **6 themes**, freely selectable — nothing locked, no required order |
| Round length | Player picks **10 or 15 holes** |
| Delivery | **Phased** — each phase playable and published |

## 3. Calls made by Claude (open to change)

| Call | Choice | Why |
|---|---|---|
| Players | 1–4, taking turns on one computer | User grouped this game with the shared-computer ideas |
| Turn order | Each player plays the whole hole, then the next player | One ball on the course at a time; no ball–ball collisions |
| Stroke cap | After 6 strokes without holing out, the hole scores **7** | Standard park rule; keeps rounds moving |
| Water | +1 stroke, ball returns to where it was hit from | Standard park rule |
| Tech | One self-contained `index.html`, Three.js r128 from cdnjs, Web Audio SFX, no image/model files | Matches the portal's conventions (Spider-Man uses the same CDN build) |
| "Realistic" within one file | Procedural canvas textures, sun + soft shadows, sky dome, physically-flavoured materials | No asset files allowed; the target is a polished indie look, not photo-realism |
| Hole format | Data, like Dino Dash's ASCII levels (§6) | 90 holes must be cheap to author |
| Theme names | Sunny Park, Pirate Cove, Volcano Island, Castle Kingdom, Frozen Peaks, Robot Factory | Each showcases different mechanisms (§8) |

## 4. Goals, non-goals, anti-goals

**Goals**
- A putt feels like a real putt: speed falls off naturally, slopes visibly break the ball, walls kick it
  back slightly softer, a ball racing over the cup lips out or skims past.
- A course reads as a real place you could visit.
- Pick up and play in seconds; easy for a 12-year-old, with skill in reading slopes and pace.

**Non-goals (all phases)**
- Online multiplayer, accounts, leaderboards.
- Physics engine libraries — the ball physics is hand-written and tested.

**Anti-goals** (would make it a failure even if it "works")
- Arcade or magic behaviour: power-ups, curving the ball mid-roll, impossible bounces.
- Courses that look like abstract floating tiles instead of a park.
- Aiming that is frustrating on a phone.

## 5. Gameplay (all phases)

**Menu → round → scorecard.**
1. Menu: enter 1–4 player names, pick a theme (six cards; themes not built yet show "Coming soon"),
   pick 10 or 15 holes, Play.
2. Each hole: hole number, par, and current player shown. The current player putts until holed out
   or capped, then the next player. After the last player, a short scorecard, then the next hole.
3. End of round: full scorecard (strokes per hole, totals, ± par), winner = lowest total. Play again /
   menu.

**10-hole round:** each theme defines which 10 of its 15 holes form the short round, chosen to keep
that theme's best holes.

**Controls**
- **Mouse / touch (primary):** press anywhere on the course and drag. Sideways movement turns the aim;
  pulling down sets power (shown on a power meter). Release to putt. Dragging back to the start
  cancels.
- **Keyboard:** ← → aim, ↑ ↓ power, Space putt.
- **Overview:** a button (and key V) flies the camera up to look down on the whole hole; press again to
  return. Overview is for planning only — you can't putt from it.
- An **aim line** shows the starting direction only (a short line, not a predicted path — reading the
  green is the skill).

**Camera:** behind the ball, looking along the aim, low enough to read slopes. While the ball rolls,
the camera follows smoothly from behind its direction of travel.

## 6. Hole data format

Holes are ASCII grids of **0.5 m cells** (x = column, z = row), plus an optional level grid and a list
of extras.

```js
{
  name: 'Windmill Lane', par: 3,
  map: [            // one char per cell
    '..........',
    '.ggggggg..',
  ],
  levels: [         // optional, same shape; digit = height step (0.25 m each); default 0
    '..........',
  ],
  extras: [ { type: 'windmill', ... }, { type: 'tunnel', ... }, { type: 'bumper', ... }, { type: 'hill', ... } ],
}
```

| Char | Meaning |
|---|---|
| `.` | Not part of the course (scenery) |
| `g` | Green carpet |
| `^ v < >` | Ramp rising in that direction; height interpolates between the cells before and after the run |
| `w` | Water (hazard) |
| `=` | Bridge (green over water, with rails) |
| `@` | Tee |
| `o` | Cup |
| `t` | Tunnel mouth (paired in `extras`) |

**Walls are generated, not drawn.** A border (top 10 cm above the green) runs along every edge between
the course and `.`, and along bridge/water edges. Where two course cells meet at different heights, a
step face is generated that blocks only the ball on the lower side — the ball on the upper side rolls
off the edge and drops. Angled corner bumpers ("banked walls") are explicit `bumper` segments. Rolling slopes are `hill` extras: smooth mounds (or dips, with a negative height) placed anywhere on the green.

## 7. Physics (the testable core)

Fixed step 1/120 s. Units are metres, seconds.

| Quantity | Value | Note |
|---|---|---|
| Ball radius | 0.02135 | Regulation ball |
| Cup radius | 0.054 | Regulation cup |
| Rolling deceleration (carpet) | ~0.65 m/s² | Tuned so a full putt carries ~25 m on flat |
| Slope acceleration | (5/7)·g·gradient | Rolling sphere |
| Wall restitution | ~0.7 normal, ~0.95 tangential | Rubber-edged border |
| Max putt speed | ~5.5 m/s | |
| Cup capture | holed if the ball crosses the cup below ~1.4 m/s | |
| Lip-out | between ~1.4 and ~2.2 m/s the ball is deflected and slowed | |
| Skim | above ~2.2 m/s the ball rolls over the cup | |

- **Ground** height comes from the cell type, its level, ramp interpolation and hills.
- **Drops:** if the ground falls away faster than the ball can follow (a step edge), the ball goes
  airborne, follows a ballistic arc and lands with some speed loss.
- **Water:** the ball entering a water cell ends the stroke with a penalty.
- **Tunnels:** a ball entering a tunnel mouth disappears for a time proportional to the pipe length,
  then exits the paired mouth along its exit direction, slightly slower.
- **Windmill:** the doorway is blocked whenever a blade is down; the ball bounces off the blade.
- **Stop:** the ball is at rest when its speed and slope push are both below small thresholds.

The physics, hole parsing and wall generation live in a `// ==== PURE BEGIN ==== / PURE END ====`
block with no THREE/DOM, tested by `node --test "tests/**/*.test.mjs"` via a loader like
`tests/pure-tesseract.mjs`. A test bot must be able to finish **every hole** within its stroke cap,
proving holes are playable.

## 8. Themes and mechanisms

| Theme | Look | Mechanisms featured | Phase |
|---|---|---|---|
| **Sunny Park** | Flowers, timber and brick borders, trees, a stream | Windmill, ramps & split levels, water & bridges, tunnels, rolling slopes & banked walls | **1** |
| Pirate Cove | Beach, shipwreck, palms | Ship's plank, ball cannon, sand | 2 |
| Volcano Island | Black rock, lava glow, jungle | Volcano set piece, ramps, bumpers & trampolines | 2 |
| Castle Kingdom | Stone, moat, banners | Drawbridge, pendulums, sliding walls, castle gate | 3 |
| Frozen Peaks | Snow, ice caves, pines | Ice, banked walls, marble-run chutes | 3 |
| Robot Factory | Metal, pipes, hazard stripes | Ball lift, conveyors, loop-the-loop, trampolines | 3 |

Phases 2–3 are scoped when Phase 1 ships; the split above is a starting point.

## 9. Phase 1 — scope

- Physics core with tests, including the hole-completion bot.
- 3D scene: sun + soft shadows, sky, procedural carpet/brick/timber/grass/water textures, scenery
  (trees, flowers, rocks, fence).
- Camera behind the ball, follow camera, overview toggle.
- Putting by drag (mouse and touch) and keyboard, aim line, power meter.
- 1–4 players, turns, stroke cap, water penalty, per-hole and final scorecards.
- Menu with the six themes (five "Coming soon"), 10/15-hole choice.
- **Sunny Park: 15 holes** using the five classic mechanisms; par 2–4; a gentle difficulty curve.
- Web Audio SFX: putt, wall knock, cup rattle, splash, tunnel rumble.
- Portal card in root `index.html` with an animated canvas thumbnail; `CLAUDE.md` updated.

## 10. Left to the builder

Exact tuning constants within the ranges above, hole layouts, scenery placement, texture recipes,
UI styling (in keeping with the portal), and SFX design.

## 11. Phase 2 (built 2026-10-31)

- **Sunny Park made crazier** (user request): ball lift, loop-the-loop, swinging pendulums, a sliding gate and pinball posts added; six plain holes rebuilt as combo holes (Swing Corner, Pinball Hill, Lift Off, Loop de Loop, Lock Gate, Grand Finale).
- **Pirate Cove**, with theming as the priority (user request): a beach island in a turquoise sea, palms, rope fence, pirate flags, barrels, chests, a shipwreck set piece and a ship at anchor offshore. Mechanisms: sand, a ship's plank, a ball cannon, a ship deck with a ramp up and a drop off, a sea-cave tunnel, barrel posts, a cannonball pendulum and a tidal gate.
- Left for later themes: conveyors, trampolines, ice and marble-run chutes.
