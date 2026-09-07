import test from 'node:test';
import assert from 'node:assert/strict';
import { PURE } from './pure-tesseract.mjs';
const { FORMATION_433, buildTeam, homePosition, decideAI, CONFIG, V4 } = PURE;

test('a 4-3-3 is eleven players with exactly one keeper', () => {
  assert.equal(FORMATION_433.length, 11);
  assert.equal(FORMATION_433.filter(s => s.role === 'GK').length, 1);
  const team = buildTeam('home', 1);
  assert.equal(team.length, 11);
  assert.equal(team.filter(p => p.isKeeper).length, 1);
});

test('THE 4D PART: the back line is spread through W, not stacked on one slice', () => {
  const back = FORMATION_433.filter(s => s.role === 'CB' || s.role === 'FB');
  assert.ok(back.length >= 4);
  const ws = back.map(s => s.w);
  const spread = Math.max(...ws) - Math.min(...ws);
  assert.ok(spread >= 3, `the defence must cover W, spread was only ${spread}`);
  assert.equal(new Set(ws).size, ws.length, 'no two defenders share a slice');
});

test('the whole team stays inside the pitch volume', () => {
  for (const dir of [1, -1]) {
    for (const p of buildTeam('home', dir)) {
      assert.ok(Math.abs(p.pos.x) <= CONFIG.pitch.halfX);
      assert.ok(Math.abs(p.pos.z) <= CONFIG.pitch.halfZ);
      assert.ok(Math.abs(p.pos.w) <= CONFIG.pitch.halfW);
    }
  }
});

test('attacking pushes the line up the pitch, defending drops it back', () => {
  const slot = FORMATION_433.find(s => s.role === 'CB');
  const ball = { x: 30, y: 0, z: 0, w: 0 };
  const att = homePosition(slot, ball, 'attacking', 1);
  const def = homePosition(slot, { x: -30, y: 0, z: 0, w: 0 }, 'defending', 1);
  assert.ok(att.x > def.x, 'the back line follows the ball up the pitch');
  assert.ok(Math.abs(att.x) <= CONFIG.pitch.halfX);
});

test('the keeper tracks the ball through W but stays on his line', () => {
  const slot = FORMATION_433.find(s => s.role === 'GK');
  const near = homePosition(slot, { x: 40, y: 0, z: 0, w: 2.5 }, 'defending', 1);
  assert.ok(near.w > 0.5, 'must move toward the ball slice');
  assert.ok(Math.abs(near.w) <= CONFIG.pitch.halfW);
  assert.ok(near.x < -CONFIG.pitch.halfX + 8, 'stays near his own goal line');
});

test('an AI player steers toward its home position and stops when it arrives', () => {
  const p = PURE.createPlayer({ pos: V4.make(0, 0, 0, 0), team: 'home', role: 'CM' });
  const far = decideAI(p, { home: { x: 20, y: 0, z: 10, w: 2 }, ball: V4.make(20,0,10,2), phase: 'attacking', attackDir: 1 });
  assert.ok(far.mx > 0 && far.mz > 0 && far.mw > 0);
  assert.ok(Math.abs(far.mx) <= 1 && Math.abs(far.mz) <= 1 && Math.abs(far.mw) <= 1);

  const there = decideAI(p, { home: { x: 0, y: 0, z: 0, w: 0 }, ball: V4.make(40,0,0,0), phase: 'attacking', attackDir: 1 });
  assert.ok(Math.hypot(there.mx, there.mz, there.mw) < 0.2, 'no jitter once in position');
});

test('AI output is always a legal input', () => {
  for (const slot of FORMATION_433) {
    const p = PURE.createPlayer({ pos: V4.make(slot.x, 0, slot.z, slot.w), team: 'home', role: slot.role });
    const cmd = decideAI(p, { home: { x: 50, y: 0, z: -33, w: -3 }, ball: V4.make(0,0,0,0), phase: 'defending', attackDir: 1 });
    for (const k of ['mx', 'mz', 'mw']) {
      assert.equal(typeof cmd[k], 'number');
      assert.ok(cmd[k] >= -1 && cmd[k] <= 1, `${slot.role}.${k} out of range: ${cmd[k]}`);
      assert.ok(Number.isFinite(cmd[k]));
    }
    assert.equal(typeof cmd.sprint, 'boolean');
  }
});

test('rotation preserves W: away team x,z negate but w stays equal to home team', () => {
  const home = buildTeam('home', 1);
  const away = buildTeam('away', -1);
  // The striker (slot 9) has asymmetric W (0.4 not 0), making it the canary for
  // a wrong "fix" that would negate w — if it gets negated, this test catches it.
  for (let i = 0; i < FORMATION_433.length; i++) {
    const h = home[i].pos;
    const a = away[i].pos;
    assert.equal(a.x, -h.x, `slot ${i} (${FORMATION_433[i].role}): away.x should be -home.x`);
    assert.equal(a.z, -h.z, `slot ${i} (${FORMATION_433[i].role}): away.z should be -home.z`);
    assert.equal(a.w, h.w, `slot ${i} (${FORMATION_433[i].role}): away.w should equal home.w (not negated)`);
    // Explicitly verify the striker whose w is asymmetric.
    if (i === 9) {
      assert.equal(a.w, 0.4, 'striker away.w must be 0.4 (would be -0.4 if mistakenly negated)');
    }
  }
});

test('keeper guards their own goal for both attack directions', () => {
  const slot = FORMATION_433.find(s => s.role === 'GK');
  // For attackDir: 1, home team's goal is at x = -52.5 (negative side).
  const homeGoal = homePosition(slot, { x: 0, y: 0, z: 0, w: 0 }, 'defending', 1);
  assert.ok(homeGoal.x < 0, 'home keeper (attackDir 1) must guard negative goal');
  assert.ok(homeGoal.x < -CONFIG.pitch.halfX + 2, 'home keeper must be near own goal line');

  // For attackDir: -1, home team's goal is at x = +52.5 (positive side).
  const awayGoal = homePosition(slot, { x: 0, y: 0, z: 0, w: 0 }, 'defending', -1);
  assert.ok(awayGoal.x > 0, 'away keeper (attackDir -1) must guard positive goal');
  assert.ok(awayGoal.x > CONFIG.pitch.halfX - 2, 'away keeper must be near own goal line');
});

test('homePosition clamps coordinates to pitch even at extreme ball positions', () => {
  const P = CONFIG.pitch;
  const extremeCorners = [
    { x: P.halfX, y: 0, z: P.halfZ, w: P.halfW },   // far corner
    { x: -P.halfX, y: 0, z: -P.halfZ, w: -P.halfW }, // opposite corner
    { x: P.halfX, y: 0, z: -P.halfZ, w: P.halfW },  // other far corners
    { x: -P.halfX, y: 0, z: P.halfZ, w: -P.halfW },
  ];
  for (const ball of extremeCorners) {
    for (const dir of [1, -1]) {
      for (const slot of FORMATION_433) {
        const pos = homePosition(slot, ball, 'attacking', dir);
        assert.ok(Math.abs(pos.x) <= P.halfX, `${slot.role} x out of bounds for extreme ball`);
        assert.ok(Math.abs(pos.z) <= P.halfZ, `${slot.role} z out of bounds for extreme ball`);
        assert.ok(Math.abs(pos.w) <= P.halfW, `${slot.role} w out of bounds for extreme ball`);
      }
    }
  }
});
