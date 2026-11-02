import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PURE } from './pure-bowling.mjs';

const { planThrow, arrivalBoard, spareTarget, LANE, PIN, boardX, xBoard, pinSpot, rackPins, createLane, runRoll, startRoll, stepRoll, rollResult, wearLane, oilAt, frameState, frameMarks, createGame, recordRoll, makeRng } = PURE;
const HOOK = { cover: 'reactive', board: 25, speed: 8, revs: 350, axis: 45, hand: 'R', lb: 15 };

// ---------- the lane and pins ----------
test('boards run from the right gutter (board 1) to the left (board 39); board 20 is the middle', () => {
  assert.ok(Math.abs(boardX(20)) < 1e-9);
  assert.ok(boardX(1) < 0 && boardX(39) > 0);
  assert.ok(Math.abs(xBoard(boardX(17.5)) - 17.5) < 1e-9);
});

test('the rack is a regulation triangle with the head pin 60 feet from the foul line', () => {
  assert.ok(Math.abs(pinSpot(1).z - 18.288) < 1e-9);
  const d = (a, b) => Math.hypot(pinSpot(a).x - pinSpot(b).x, pinSpot(a).z - pinSpot(b).z);
  for (const [a, b] of [[1, 2], [1, 3], [2, 3], [4, 5], [7, 8], [2, 4], [6, 10]]) assert.ok(Math.abs(d(a, b) - 0.3048) < 1e-6, `${a}-${b}`);
  assert.ok(pinSpot(7).x > 0 && pinSpot(10).x < 0, '7 pin on the left, 10 pin on the right');
});

test('the pin has its real weight and a low centre of mass', () => {
  assert.equal(PIN.mass, 1.53);
  assert.ok(PIN.com > 0.13 && PIN.com < 0.16, `com ${PIN.com}`);
});

test('a rack left alone stays standing', () => {
  const lane = createLane();
  const pins = rackPins(); pins.forEach(p => { p.asleep = false; });
  const sim = { bodies: [{ kind: 'ball', removed: true, p: { x: 0, y: -1, z: 0 }, v: { x: 0, y: 0, z: 0 }, w: { x: 0, y: 0, z: 0 } }, ...pins], t: 0, events: [], path: [], pathT: 0, firstHitT: null, hit: null, done: false };
  sim.bodies[0] = { ...sim.bodies[0], invM: 0, invI: { x: 0, y: 0, z: 0 }, q: { w: 1, x: 0, y: 0, z: 0 }, asleep: true };
  while (!sim.done && sim.t < 3) stepRoll(sim, lane, 0.1);
  const r = rollResult(sim);
  assert.equal(r.down.length, 0, `fell: ${r.down}`);
});

// ---------- the ball ----------
const pathOf = th => { const lane = createLane(); const sim = startRoll(lane, [], th); const pts = []; while (!sim.done && sim.t < 4) { stepRoll(sim, lane, 0.02); const b = sim.bodies[0]; if (b.removed) break; pts.push({ z: b.p.z, b: xBoard(b.p.x) }); } return pts; };
const boardAt = (pts, z) => (pts.find(p => p.z >= z) || pts[pts.length - 1]).b;

test('a ball with no spin rolls dead straight', () => {
  const pts = pathOf({ cover: 'reactive', board: 15, target: 15, speed: 8, revs: 0, axis: 0, hand: 'R', lb: 15 });
  assert.ok(Math.abs(boardAt(pts, 18) - 15) < 0.05);
});

test('side spin hooks a right-hander left and a left-hander right, mostly after the oil ends', () => {
  const R = pathOf({ ...HOOK, board: 15, target: 15 }), L = pathOf({ ...HOOK, board: 25, target: 25, hand: 'L' });
  const rEarly = boardAt(R, LANE.oilLen) - 15, rLate = boardAt(R, 18) - boardAt(R, LANE.oilLen);
  assert.ok(rLate > 4 && rLate > rEarly * 1.5, `right-hander early ${rEarly.toFixed(1)} late ${rLate.toFixed(1)}`);
  assert.ok(boardAt(L, 18) < 25 - 4, 'left-hander hooks the other way');
});

test('a reactive ball hooks more than urethane, and urethane more than plastic', () => {
  const hook = cover => boardAt(pathOf({ ...HOOK, cover, board: 12, target: 12 }), 18) - 12;
  const [p, u, r] = ['plastic', 'urethane', 'reactive'].map(hook);
  assert.ok(r > u && u > p && p >= 0, `plastic ${p.toFixed(1)} urethane ${u.toFixed(1)} reactive ${r.toFixed(1)}`);
});

test('more axis rotation means more hook', () => {
  const hook = axis => boardAt(pathOf({ ...HOOK, axis, board: 12, target: 12 }), 18) - 12;
  assert.ok(hook(60) > hook(30) && hook(30) > hook(5));
});

test('a ball off the edge drops into the gutter, misses every pin and scores zero', () => {
  const r = runRoll(createLane(), rackPins(), { cover: 'plastic', board: 3, target: -2, speed: 7, revs: 0, axis: 0, hand: 'R', lb: 12 });
  assert.equal(r.gutter, true);
  assert.equal(r.down.length, 0);
});

// ---------- pin action ----------
test('straight balls on the nose rarely strike; in the pocket they do', () => {
  let noseStrikes = 0;
  for (let b = 19.2; b <= 20.81; b += 0.2) if (runRoll(createLane(), rackPins(), { cover: 'plastic', board: b, target: b, speed: 8, revs: 0, axis: 0, hand: 'R', lb: 15 }).down.length === 10) noseStrikes++;
  assert.ok(noseStrikes <= 3, `nose hits struck ${noseStrikes}/9`);
  const pocket = runRoll(createLane(), rackPins(), { cover: 'plastic', board: 17.5, target: 17.5, speed: 8, revs: 0, axis: 0, hand: 'R', lb: 15 });
  assert.equal(pocket.down.length, 10);
});

test('a light hit leaves pins standing on the far side', () => {
  const r = runRoll(createLane(), rackPins(), { cover: 'plastic', board: 15, target: 15, speed: 8, revs: 0, axis: 0, hand: 'R', lb: 15 });
  assert.ok(r.down.length < 10 && r.down.includes(1) && r.down.includes(3));
});

test('a good hook line strikes about as often as a strong real bowler, with human error', () => {
  // find the target that brings the ball into the pocket, then throw it with small, human-sized errors
  let lo = 0, hi = 25;
  for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; const r = runRoll(createLane(), [], { ...HOOK, target: mid }); const last = r.path[r.path.length - 1]; if (xBoard(last.x) < 17.5) lo = mid; else hi = mid; }
  const target = (lo + hi) / 2, rng = makeRng(11);
  let strikes = 0;
  for (let i = 0; i < 20; i++) if (runRoll(createLane(), rackPins(), { ...HOOK, target: target + (rng() - 0.5) * 1.2, speed: HOOK.speed + (rng() - 0.5) * 0.3 }).down.length === 10) strikes++;
  assert.ok(strikes >= 6 && strikes <= 19, `strikes ${strikes}/20`);
});

test('standing pins stay where they ended up for the second ball', () => {
  const r = runRoll(createLane(), rackPins(), { cover: 'plastic', board: 15, target: 15, speed: 8, revs: 0, axis: 0, hand: 'R', lb: 15 });
  const again = rackPins(r.standing);
  assert.deepEqual(again.map(p => p.n), r.standing.map(s => s.n));
  assert.ok(Math.abs(again[0].p.x - r.standing[0].x) < 1e-9);
});

// ---------- the oil wears ----------
test('balls rolling through the oil wear it down along their track and carry some past the pattern', () => {
  const lane = createLane();
  const before = oilAt(lane, boardX(12), 8), behind = oilAt(lane, boardX(12), LANE.oilLen + 0.2);
  for (let i = 0; i < 25; i++) wearLane(lane, Array.from({ length: 60 }, (_, k) => ({ x: boardX(12), z: k * 0.25 })));
  assert.ok(oilAt(lane, boardX(12), 8) < before * 0.8, 'the track dries');
  assert.ok(oilAt(lane, boardX(30), 8) === createLane().oil[32][29], 'untouched boards keep their oil');
  assert.ok(oilAt(lane, boardX(12), LANE.oilLen + 0.2) > behind, 'oil is carried down');
});

// ---------- scoring ----------
const total = rolls => frameState(rolls).total;
test('a perfect game is 300, all nines is 90, all spares of 5 is 150, all gutters is 0', () => {
  assert.equal(total(Array(12).fill(10)), 300);
  assert.equal(total(Array(10).fill([9, 0]).flat()), 90);
  assert.equal(total(Array(21).fill(5)), 150);
  assert.equal(total(Array(20).fill(0)), 0);
});

test('a real scorecard adds up', () => {
  // X 7/ 9- X -8 8/ -6 X X X81
  const rolls = [10, 7, 3, 9, 0, 10, 0, 8, 8, 2, 0, 6, 10, 10, 10, 8, 1];
  const st = frameState(rolls);
  assert.deepEqual(st.frames.map(f => f.total), [20, 39, 48, 66, 74, 84, 90, 120, 148, 167]);
  assert.equal(st.done, true);
  assert.deepEqual(frameMarks(st.frames[9], 9), ['X', '8', '1']);
  assert.deepEqual(frameMarks(st.frames[1], 1), ['7', '/']);
  assert.deepEqual(frameMarks(st.frames[2], 2), ['9', '-']);
});

test('frame state knows when the rack is fresh and when the game is over', () => {
  assert.deepEqual([frameState([]).frame, frameState([]).ball, frameState([]).fullRack], [0, 0, true]);
  assert.deepEqual([frameState([7]).ball, frameState([7]).fullRack], [1, false]);
  const tenth = Array(18).fill(0);
  assert.equal(frameState([...tenth, 10]).fullRack, true, 'strike in the 10th: fresh rack');
  assert.equal(frameState([...tenth, 6, 4]).fullRack, true, 'spare in the 10th: fresh rack for the fill ball');
  assert.equal(frameState([...tenth, 6, 3]).done, true, 'open 10th: game over');
  assert.equal(frameState([...tenth, 10, 10, 10]).done, true);
});

test('players take whole frames in turn and the game ends when everyone has bowled ten', () => {
  const g = createGame(['Edna', 'Mabel']);
  recordRoll(g, 10); assert.equal(g.cur, 1, 'a strike ends the frame');
  recordRoll(g, 4); assert.equal(g.cur, 1, 'second ball still to come');
  recordRoll(g, 3); assert.equal(g.cur, 0);
  let out;
  for (let i = 0; i < 40 && !(out && out.gameOver); i++) out = recordRoll(g, 0);
  assert.equal(out.gameOver, true);
});

// ---------- CPU grannies ----------
const PRO = { hand: 'R', cover: 'reactive', lb: 15, speed: 8, revs: 350, axis: 45, skill: 0 };
test('a CPU granny reads the lane: with no error her ball arrives in the pocket', () => {
  const lane = createLane();
  const th = planThrow(lane, PRO, null, makeRng(1));
  assert.ok(Math.abs(arrivalBoard(lane, th, LANE.headZ) - 17.5) < 0.6);
  const lefty = planThrow(lane, { ...PRO, hand: 'L' }, null, makeRng(1));
  assert.ok(Math.abs(arrivalBoard(lane, lefty, LANE.headZ) - 22.5) < 0.6);
});

test('a skilled CPU granny strikes often and converts single-pin spares', () => {
  const rng = makeRng(3), skill = { ...PRO, skill: 0.5 };
  let strikes = 0;
  for (let i = 0; i < 12; i++) { const lane = createLane(); if (runRoll(lane, rackPins(), planThrow(lane, skill, null, rng)).down.length === 10) strikes++; }
  assert.ok(strikes >= 4, `strikes ${strikes}/12`);
  for (const n of [10, 7, 6]) {
    let made = 0;
    for (let i = 0; i < 6; i++) {
      const lane = createLane(), left = [{ n, ...pinSpot(n) }];
      if (runRoll(lane, rackPins(left), planThrow(lane, skill, left, rng)).standing.length === 0) made++;
    }
    assert.ok(made >= 4, `${n} pin: ${made}/6`);
  }
});

test('a CPU granny adjusts as the oil wears', () => {
  const lane = createLane();
  const fresh = planThrow(lane, PRO, null, makeRng(1)).target;
  for (let i = 0; i < 25; i++) { const th = planThrow(lane, PRO, null, makeRng(i)); wearLane(lane, runRoll(lane, [], th).path); }
  const worn = planThrow(lane, PRO, null, makeRng(1)).target;
  assert.notEqual(worn.toFixed(2), fresh.toFixed(2));
  assert.ok(Math.abs(arrivalBoard(lane, planThrow(lane, PRO, null, makeRng(1)), LANE.headZ) - 17.5) < 0.8, 'still finds the pocket');
});
