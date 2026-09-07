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
  assert.equal(m.score.away, 1);
  assert.equal(m.score.home, 0);
  assert.ok(events.includes('goal:away'));
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
