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

test('swing: holding swing from a rooftop attaches a rope and keeps hero within rope length', () => {
  const start = { min: { x: -5, y: 0, z: -5 }, max: { x: 5, y: 30, z: 5 } };
  const tall = { min: { x: 5, y: 0, z: -60 }, max: { x: 25, y: 70, z: -40 } };
  const w = world(start, tall); const h = createHero({ x: 0, y: 30, z: 0 });
  const inp = makeInput(); inp.forward = 1; inp.sprint = true; run(h, inp, w, 30);
  inp.swing = true;
  const ev = run(h, inp, w, 1);
  assert.equal(h.state, 'swing'); assert.equal(ev[0].type, 'swingStart'); assert.ok(h.anchor && !h.anchor.sky); assert.ok(h.swingAnchor);
  const L0 = h.ropeLen;
  for (let i = 0; i < 90; i++) {
    stepHero(h, inp, DT, w);
    if (h.state !== 'swing') break;
    const d = Math.hypot(h.pos.x - h.swingAnchor.x, h.pos.y + CONFIG.heroHeight - h.swingAnchor.y, h.pos.z - h.swingAnchor.z);
    assert.ok(d <= h.ropeLen + 0.05, `rope stretched ${d} > ${h.ropeLen}`);
  }
  assert.ok(h.ropeLen < L0, 'rope shortens over the arc');
  assert.ok(Math.abs(h.swingAnchor.x) < 1e-6, 'virtual anchor sits on the forward line');
});

test('swing: release on the upswing gives a velocity bonus and returns to air', () => {
  const start = { min: { x: -5, y: 0, z: -5 }, max: { x: 5, y: 30, z: 5 } };
  const tall = { min: { x: 5, y: 0, z: -60 }, max: { x: 25, y: 70, z: -40 } };
  const w = world(start, tall); const h = createHero({ x: 0, y: 30, z: 0 });
  const inp = makeInput(); inp.forward = 1; inp.sprint = true; run(h, inp, w, 30);
  inp.swing = true; run(h, inp, w, 1);
  // swing until we pass the bottom and start rising
  let guard = 0; while (h.vel.y <= 0 && guard++ < 600) stepHero(h, inp, DT, w);
  assert.equal(h.state, 'swing');
  const speedBefore = Math.hypot(h.vel.x, h.vel.y, h.vel.z);
  inp.swing = false;
  const ev = stepHero(h, inp, DT, w);
  assert.equal(h.state, 'air');
  assert.equal(ev[0].type, 'swingRelease'); assert.equal(ev[0].bonus, true);
  const speedAfter = Math.hypot(h.vel.x, h.vel.y, h.vel.z);
  assert.ok(speedAfter > speedBefore * 1.1, `bonus ${speedBefore} → ${speedAfter}`);
});

test('swing: from ground with nothing ahead uses the sky anchor', () => {
  const w = world(); const h = createHero({ x: 0, y: 0, z: 0 });
  const inp = makeInput(); inp.swing = true; run(h, inp, w, 1);
  assert.equal(h.state, 'swing'); assert.equal(h.anchor.sky, true);
});

test('crawl: W climbs the wall, reaching the roof puts hero on top', () => {
  const wallB = { min: { x: -50, y: 0, z: -40 }, max: { x: 50, y: 12, z: -20 } };
  const w = world(wallB); const h = createHero({ x: 0, y: 0, z: 0 });
  const inp = makeInput(); inp.forward = 1;
  run(h, inp, w, 200);                       // walk into wall → crawl
  assert.equal(h.state, 'crawl');
  const y0 = h.pos.y;
  run(h, inp, w, 60);
  assert.ok(h.pos.y > y0 + 3, `climbed ${h.pos.y - y0}`);
  for (let i = 0; i < 400 && h.state !== 'ground'; i++) stepHero(h, inp, DT, w);
  assert.equal(h.state, 'ground'); assert.equal(h.pos.y, 12); assert.ok(h.pos.z < -20, 'on the roof, not floating at the edge');
});

test('crawl: A/D moves along the wall; Space jumps away from it', () => {
  const wallB = { min: { x: -50, y: 0, z: -40 }, max: { x: 50, y: 60, z: -20 } };
  const w = world(wallB); const h = createHero({ x: 0, y: 0, z: 0 });
  const inp = makeInput(); inp.forward = 1; run(h, inp, w, 200); assert.equal(h.state, 'crawl');
  inp.forward = 0; inp.strafe = 1; const x0 = h.pos.x; run(h, inp, w, 60);
  assert.ok(Math.abs(h.pos.x - x0) > 3, 'moved sideways');
  assert.ok(Math.abs(h.pos.z - (-20 + CONFIG.heroRadius)) < 1e-6, 'still glued');
  inp.strafe = 0; inp.jump = true; const ev = run(h, inp, w, 1);
  assert.equal(h.state, 'air'); assert.equal(ev[0].type, 'wallJump'); assert.ok(h.vel.z > 0 && h.vel.y > 0);
});

test('zip: E while aiming at a roof dashes there and lands', () => {
  const target = { min: { x: -10, y: 0, z: -50 }, max: { x: 10, y: 30, z: -30 } };
  const w = world(target); const h = createHero({ x: 0, y: 0, z: 0 });
  const inp = makeInput(); inp.jump = true; run(h, inp, w, 2);          // must be airborne to zip
  inp.camYaw = 0; inp.camPitch = Math.atan2(30 - 1.8 - 1, 30);         // aim at the wall 1m below the roof
  inp.zip = true; const ev = run(h, inp, w, 1);
  assert.equal(h.state, 'zip', JSON.stringify(ev)); assert.equal(ev[0].type, 'zipStart');
  const ev2 = run(h, inp, w, 120);
  assert.ok(ev2.some(e => e.type === 'zipEnd'));
  assert.ok(h.state === 'ground' || h.state === 'crawl');
  assert.ok(h.pos.y >= 29.9, `arrived high ${h.pos.y}`);
});

test('zip: nothing in range → no state change', () => {
  const w = world(); const h = createHero({ x: 0, y: 0, z: 0 });
  const inp = makeInput(); inp.jump = true; run(h, inp, w, 2); inp.zip = true; run(h, inp, w, 1);
  assert.equal(h.state, 'air');
});
