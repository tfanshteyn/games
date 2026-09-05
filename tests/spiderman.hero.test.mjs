import test from 'node:test';
import assert from 'node:assert/strict';
import { PURE } from './pure.mjs';
const { CONFIG, SpatialGrid, createHero, makeInput, stepHero } = PURE;

function world(...boxes) { const g = new SpatialGrid(50, 300); boxes.forEach((b, i) => g.insert({ id: i, kind: 'building', ...b })); return { grid: g }; }
const DT = 1 / 60;
function run(hero, input, w, steps) { const ev = []; for (let i = 0; i < steps; i++) { ev.push(...stepHero(hero, input, DT, w)); input.jump = false; input.zip = false; } return ev; }

test('createHero starts grounded at spawn', () => {
  const h = createHero({ x: 1, y: 30, z: 2 });
  assert.deepEqual(h.pos, { x: 1, y: 30, z: 2 }); assert.deepEqual(h.vel, { x: 0, y: 0, z: 0 }); assert.equal(h.state, 'ground');
});

test('ground: W accelerates toward run speed in camera-forward direction; sprint is faster', () => {
  const w = world();
  const h = createHero({ x: 0, y: 0, z: 0 });
  const inp = makeInput(); inp.forward = 1; inp.camYaw = 0;
  run(h, inp, w, 120);
  assert.ok(h.vel.z < -CONFIG.runSpeed * 0.95 && h.vel.z > -CONFIG.runSpeed * 1.05, `vel.z ${h.vel.z}`);
  assert.ok(Math.abs(h.vel.x) < 1e-6);
  inp.sprint = true; run(h, inp, w, 120);
  assert.ok(Math.abs(-h.vel.z - CONFIG.sprintSpeed) < 0.5);
  assert.equal(h.state, 'ground');
});

test('ground: releasing keys slows to a stop', () => {
  const w = world(); const h = createHero({ x: 0, y: 0, z: 0 });
  const inp = makeInput(); inp.forward = 1; run(h, inp, w, 60); inp.forward = 0; run(h, inp, w, 120);
  assert.ok(Math.abs(h.vel.z) < 0.1);
});

test('jump enters air and lands again; jumping right on landing gives a high jump', () => {
  const w = world(); const h = createHero({ x: 0, y: 0, z: 0 });
  const inp = makeInput(); inp.jump = true;
  const ev = run(h, inp, w, 1);
  assert.equal(h.state, 'air'); assert.equal(ev[0].type, 'jump'); assert.equal(ev[0].high, false);
  assert.ok(Math.abs(h.vel.y - CONFIG.jumpSpeed) < 1e-6);
  let landed = false;
  for (let i = 0; i < 300 && !landed; i++) landed = stepHero(h, inp, DT, w).some(e => e.type === 'land');
  assert.ok(landed, 'landed'); assert.equal(h.state, 'ground');
  inp.jump = true; const ev2 = run(h, inp, w, 1);                 // very next step after landing
  assert.equal(ev2[0].type, 'jump'); assert.equal(ev2[0].high, true);
  assert.ok(Math.abs(h.vel.y - CONFIG.highJumpSpeed) < 1e-6, `high jump ${h.vel.y}`);
});

test('air: gravity applies and falling is capped; walking off a roof → air', () => {
  const roof = { min: { x: -5, y: 0, z: -5 }, max: { x: 5, y: 30, z: 5 } };
  const w = world(roof); const h = createHero({ x: 0, y: 30, z: 0 });
  const inp = makeInput(); inp.forward = 1;
  run(h, inp, w, 90);                       // runs off the -Z edge
  assert.equal(h.state, 'air'); assert.ok(h.vel.y < 0);
  run(h, inp, w, 600);
  assert.ok(h.vel.y === 0 && h.state === 'ground' && h.pos.y === 0);
});

test('ground: running into a wall starts crawl', () => {
  const wallB = { min: { x: -50, y: 0, z: -40 }, max: { x: 50, y: 60, z: -20 } };
  const w = world(wallB); const h = createHero({ x: 0, y: 0, z: 0 });
  const inp = makeInput(); inp.forward = 1; inp.sprint = true; inp.jump = true;
  const ev = run(h, inp, w, 240);
  assert.ok(ev.some(e => e.type === 'crawlStart'));
  assert.equal(h.state, 'crawl'); assert.deepEqual(h.wall.normal, { x: 0, y: 0, z: 1 });
});

test('air: contact with a wall mid-air starts crawl; jump on contact wall-jumps away', () => {
  const wallB = { min: { x: -50, y: 0, z: -40 }, max: { x: 50, y: 60, z: -20 } };
  const w = world(wallB);
  // mid-air, drifting into the wall with W held
  const h = createHero({ x: 0, y: 15, z: -19 }); h.state = 'air'; h.vel = { x: 0, y: 0, z: -5 };
  const inp = makeInput(); inp.forward = 1;
  const ev = run(h, inp, w, 15);
  assert.ok(ev.some(e => e.type === 'crawlStart'), 'crawlStart emitted');
  assert.equal(h.state, 'crawl'); assert.deepEqual(h.wall.normal, { x: 0, y: 0, z: 1 }); assert.ok(h.pos.y > 1);
  // same approach with jump pressed on the contact step → wall jump, still airborne
  const h2 = createHero({ x: 0, y: 15, z: -19.45 }); h2.state = 'air'; h2.vel = { x: 0, y: 0, z: -5 };
  const inp2 = makeInput(); inp2.forward = 1; inp2.jump = true;
  const ev2 = run(h2, inp2, w, 1);
  assert.equal(ev2[0].type, 'wallJump'); assert.equal(h2.state, 'air');
  assert.ok(Math.abs(h2.vel.z - CONFIG.wallJumpOut) < 1e-6 && Math.abs(h2.vel.y - CONFIG.wallJumpUp) < 1e-6, `wall-jump vel ${JSON.stringify(h2.vel)}`);
});
