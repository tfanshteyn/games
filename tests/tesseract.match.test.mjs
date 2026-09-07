import test from 'node:test';
import assert from 'node:assert/strict';
import { PURE } from './pure-tesseract.mjs';
const { createMatch, stepMatch, makeInput, CONFIG, V4, buildTeam, attackDirOf, FORMATION_433 } = PURE;

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
  assert.equal(m.score.home, 1);
  assert.equal(m.score.away, 0);
  assert.ok(events.includes('goal:home'));
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

test('teams attack opposite ways', () => {
  // Swapping ends at half time is not implemented in Pass 1 — attackDirOf(team) takes
  // no half argument, and this test does not cover end-swapping.
  const m = createMatch();
  const firstHalf = PURE.attackDirOf('home');
  assert.equal(PURE.attackDirOf('away'), -firstHalf);
  assert.equal(typeof firstHalf, 'number');
});

test('the formation-slot lookup recovers the right slot from a player id', () => {
  // stepMatch recovers a player's formation slot with
  // Number(p.id.replace(/^\D+/, '')) % 11 — an off-by-one here would silently hand a
  // player another role's home position while staying within the pitch bounds that
  // every other test checks. Pin the id -> index -> role mapping directly instead.
  for (const team of ['home', 'away']) {
    const players = buildTeam(team, attackDirOf(team));
    players.forEach((p, index) => {
      const recoveredIndex = Number(p.id.replace(/^\D+/, ''));
      assert.equal(recoveredIndex, index, `${p.id} should recover index ${index}`);
      assert.equal(FORMATION_433[recoveredIndex].role, p.role, `${p.id} role mismatch`);
    });
  }
  const home = buildTeam('home', attackDirOf('home'));
  const away = buildTeam('away', attackDirOf('away'));
  assert.equal(home[10].id, 'home10');
  assert.equal(Number(home[10].id.replace(/^\D+/, '')), 10);
  assert.equal(away[10].id, 'away10');
  assert.equal(Number(away[10].id.replace(/^\D+/, '')), 10);
});

test('match.controlled survives a restart as the same object, still in match.players', () => {
  const m = createMatch();
  const controlledBefore = m.controlled;
  advance(m, 3); // enough to pass through the kickoff restart into play
  // Strict reference check, not deep equality: resetPositions copies coordinate values
  // onto the existing player objects in place. If a future refactor made it replace
  // array elements instead, match.controlled would become a detached ghost object that
  // deep-equals a player in match.players without actually being one — deep equality
  // would pass against exactly the bug this test exists to catch.
  assert.strictEqual(m.controlled, controlledBefore);
  assert.ok(m.players.includes(m.controlled));
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

test('ANCHOR: a goal is credited to the team that does NOT defend that end', () => {
  // The defect this pins: stepBall credited `g.dir > 0 ? 'away' : 'home'`, which awarded
  // every goal the human striker scored to the opponent. No previous assertion connected
  // a goal's credit to which team actually defends that end, so fourteen reviews missed
  // it. Derive the expected team from the keeper standing in front of the goal instead of
  // restating a literal, so the two halves of the convention can never drift apart again.
  const { createWorld, createBall, stepBall } = PURE;
  const world = createWorld();
  const keepers = createMatch().players.filter(p => p.isKeeper);
  assert.equal(keepers.length, 2);

  for (const g of [world.goals.home, world.goals.away]) {
    const defender = keepers
      .slice()
      .sort((a, b) => Math.abs(a.pos.x - g.x) - Math.abs(b.pos.x - g.x))[0];
    assert.ok(Math.abs(defender.pos.x - g.x) < 12,
      `no keeper stands in front of the goal at x=${g.x}`);
    // and unambiguously so: the other keeper must be at the far end
    const other = keepers.find(k => k !== defender);
    assert.ok(Math.abs(other.pos.x - g.x) > 60, 'the two keepers must be at opposite ends');

    const b = createBall(V4.make(g.x - g.dir * 2, 1, 0, 0));
    b.vel = V4.make(g.dir * 20, 0, 0, 0);
    let scored = null;
    for (let i = 0; i < 240 && !scored; i++) scored = stepBall(b, world, DT).goal;
    assert.ok(scored, `a shot into the goal at x=${g.x} must be a goal`);
    assert.notEqual(scored, defender.team,
      `the ${defender.team} keeper defends x=${g.x}, so ${defender.team} cannot be credited`);
    assert.equal(scored, defender.team === 'home' ? 'away' : 'home');
  }
});

test('the ball actually moves in a match — a player can reach it and take it away', () => {
  // The defect this pins: canContact and SpatialGrid4.near had no call sites, so the
  // ball sat on the centre spot for the whole match and no goal was reachable in play.
  const m = createMatch();
  advance(m, 2);                                     // out of the kickoff restart
  const spot = { x: m.ball.pos.x, z: m.ball.pos.z };
  m.controlled.pos = V4.make(-3, 0, 0, 0);
  V4.set(m.controlled.vel, V4.make());
  advance(m, 4, Object.assign(makeInput(), { mx: 1, sprint: true }));
  const moved = Math.hypot(m.ball.pos.x - spot.x, m.ball.pos.z - spot.z);
  assert.ok(moved > 5, `the ball should have been dribbled away, moved only ${moved} m`);
  assert.ok(m.ball.pos.x > spot.x, 'and driven toward the goal the striker attacks');
});

test('players in a match obstruct each other only inside their own slice', () => {
  const m = createMatch();
  advance(m, 2);
  const [a, b, ghost] = [m.players[5], m.players[6], m.players[7]];
  // two team-mates stacked on the same spot in the same slice, and a third stacked on
  // them but 2.6 m away in W
  for (const p of [a, b, ghost]) { V4.set(p.vel, V4.make()); }
  V4.set(a.pos, V4.make(0, 0, 20, 0));
  V4.set(b.pos, V4.make(0.1, 0, 20, 0));
  V4.set(ghost.pos, V4.make(0.05, 0, 20, 2.7));
  const ghostBefore = { x: ghost.pos.x, z: ghost.pos.z };
  stepMatch(m, makeInput(), DT);
  const sep = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
  assert.ok(sep > 0.5, `same-slice players must be pushed apart, got ${sep}`);
  const ghostMoved = Math.hypot(ghost.pos.x - ghostBefore.x, ghost.pos.z - ghostBefore.z);
  assert.ok(ghostMoved < 0.05, `the other-slice player was shoved by ${ghostMoved} m`);
});

test('a ball hit long and wide rebounds back into play instead of leaving the pitch', () => {
  // The defect this pins: stepMatch rebounded at |z| > 34 but had no mirror for
  // |x| > 52.5, so once the ball could be kicked at all a long ball left on a ballistic
  // arc and the match was dead until half time.
  const m = createMatch();
  advance(m, 2);
  m.ball.pos = V4.make(40, 1.5, 20, 0);      // wide of the post, so not a goal
  m.ball.vel = V4.make(40, 4, 0, 0);
  advance(m, 4);
  assert.equal(m.state, 'play', 'nothing should have been scored');
  assert.ok(Math.abs(m.ball.pos.x) <= CONFIG.pitch.halfX + 1e-6,
    `the ball escaped on x: ${m.ball.pos.x}`);
  assert.ok(Math.abs(m.ball.pos.z) <= CONFIG.pitch.halfZ + 1e-6);
});

test('a ball driven over the bar does not score on the way down behind the goal', () => {
  const m = createMatch();
  advance(m, 2);
  m.ball.pos = V4.make(48, 3.4, 0, 0);       // already above the 2.44 m bar, dead centre
  m.ball.vel = V4.make(26, 3, 0, 0);
  const events = advance(m, 4);
  assert.ok(!events.some(e => e.startsWith('goal:')),
    'a ball over the bar must not drop in behind the net and score');
  assert.deepEqual(m.score, { home: 0, away: 0 });
});

test('the goal mouth is still not rebounded — a real shot scores', () => {
  const m = createMatch();
  advance(m, 2);
  m.ball.pos = V4.make(50, 1, 0, 0);
  m.ball.vel = V4.make(24, 0, 0, 0);
  const events = advance(m, 1.5);
  assert.ok(events.includes('goal:home'));
  assert.equal(m.score.home, 1);
});

test('one player per team chases the ball while the rest hold the shape', () => {
  const m = createMatch();
  advance(m, 2);
  m.ball.pos = V4.make(-20, CONFIG.ball.radius, 24, 0);   // deep on one flank
  m.ball.vel = V4.make();
  const distFrom = p => Math.hypot(p.pos.x - m.ball.pos.x, p.pos.z - m.ball.pos.z);
  const chaserOf = team => m.players
    .filter(p => p.team === team && !p.isKeeper && p !== m.controlled)
    .sort((a, b) => distFrom(a) - distFrom(b))[0];
  const [homeChaser, awayChaser] = [chaserOf('home'), chaserOf('away')];
  const far = m.players.find(p => p.team === 'home' && !p.isKeeper &&
    p !== homeChaser && p !== m.controlled && distFrom(p) > 30);
  const before = { home: distFrom(homeChaser), away: distFrom(awayChaser), far: distFrom(far) };

  advance(m, 3);
  assert.ok(distFrom(homeChaser) < before.home - 3,
    `the nearest home player must close on the ball (${before.home} -> ${distFrom(homeChaser)})`);
  assert.ok(distFrom(awayChaser) < before.away - 3,
    `and so must the nearest away player (${before.away} -> ${distFrom(awayChaser)})`);
  assert.ok(distFrom(far) > before.far - 12,
    'a player right across the pitch keeps his formation position rather than swarming');
});

test('a goal is reachable in play: dribble it over the line and it counts to home', () => {
  // The whole chain end to end — contact makes the ball movable, the touch drives it
  // forward, the goal registers, and it is credited to the team the human plays for.
  const m = createMatch();
  advance(m, 2);
  m.controlled.pos = V4.make(40, 0, 2, 0);
  V4.set(m.controlled.vel, V4.make());
  m.ball.pos = V4.make(41, CONFIG.ball.radius, 2, 0);
  m.ball.vel = V4.make();
  const events = advance(m, 12, Object.assign(makeInput(), { mx: 1, sprint: true }));
  assert.ok(events.includes('goal:home'), `expected a goal, got ${JSON.stringify(events)}`);
  assert.deepEqual(m.score, { home: 1, away: 0 });
});

test('stepMatch is deterministic: the same inputs give the same match twice', () => {
  // Unlike the ball's determinism test this one has teeth: stepMatch now resolves
  // contacts against a hash grid and picks chasers by nearest-distance search, both of
  // which could pick up an order dependency and drift.
  const snapshot = () => {
    const m = createMatch();
    const drive = Object.assign(makeInput(), { mx: 1, mw: 1, sprint: true });
    advance(m, 20, drive);
    return {
      ball: { x: m.ball.pos.x, y: m.ball.pos.y, z: m.ball.pos.z, w: m.ball.pos.w },
      players: m.players.map(p => [p.id, p.pos.x, p.pos.z, p.pos.w]),
      score: m.score,
    };
  };
  assert.deepEqual(snapshot(), snapshot());
});
