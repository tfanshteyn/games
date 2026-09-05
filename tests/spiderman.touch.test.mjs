import test from 'node:test';
import assert from 'node:assert/strict';
import { PURE } from './pure.mjs';
const { moveDir, makeInput, V } = PURE;

// Analog sticks push partial deflections; the move direction must keep that magnitude
// (a half-pushed stick walks at half speed) while keyboard diagonals still clamp to 1.
test('moveDir keeps a partial analog deflection as a shorter vector', () => {
  const input = makeInput(); input.forward = 0.5; input.camYaw = 0;
  const d = moveDir(input);
  assert.ok(Math.abs(V.len(d) - 0.5) < 1e-9, `length ${V.len(d)}`);
  assert.ok(d.z < 0 && Math.abs(d.x) < 1e-9, 'half-forward at yaw 0 points down -Z');
});

test('moveDir clamps a full diagonal to unit length', () => {
  const input = makeInput(); input.forward = 1; input.strafe = 1; input.camYaw = 0;
  assert.ok(Math.abs(V.len(moveDir(input)) - 1) < 1e-9);
});

test('moveDir returns zero for no input', () => {
  assert.deepEqual(moveDir(makeInput()), { x: 0, y: 0, z: 0 });
});
