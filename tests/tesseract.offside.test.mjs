import test from 'node:test';
import assert from 'node:assert/strict';
import { PURE } from './pure-tesseract.mjs';
const { offsideLineX, isOffside, createPlayer, V4 } = PURE;

const def = (x, w = 0, role = 'CB') =>
  createPlayer({ pos: V4.make(x, 0, 0, w), team: 'away', role, id: 'd' + x });

test('the line is the second-last defender when they are deepest', () => {
  const defs = [def(48, 0, 'GK'), def(40), def(36), def(20)];
  assert.equal(offsideLineX(defs, 0, 1), 40);
});

test('the ball holds the line when it is ahead of the defence', () => {
  const defs = [def(48, 0, 'GK'), def(40), def(36)];
  assert.equal(offsideLineX(defs, 44, 1), 44);
});

test('the halfway line holds it in your own half', () => {
  const defs = [def(-10, 0, 'GK'), def(-20), def(-30)];
  assert.equal(offsideLineX(defs, -40, 1), 0);
});

test('an attacker beyond the line is offside, level is onside', () => {
  assert.ok(isOffside(V4.make(42, 0, 0, 0), 40, 1));
  assert.ok(!isOffside(V4.make(40, 0, 0, 0), 40, 1));
  assert.ok(!isOffside(V4.make(38, 0, 0, 0), 40, 1));
});

test('it works the other way down the pitch', () => {
  const defs = [def(-48, 0, 'GK'), def(-40), def(-36)];
  assert.equal(offsideLineX(defs, 0, -1), -40);
  assert.ok(isOffside(V4.make(-42, 0, 0, 0), -40, -1));
  assert.ok(!isOffside(V4.make(-38, 0, 0, 0), -40, -1));
});

test('W NEVER affects offside — this is deliberate', () => {
  const defs = [def(48, 0, 'GK'), def(40, -3), def(36, 3)];
  const line = offsideLineX(defs, 0, 1);
  for (const w of [-3, -1.5, 0, 1.5, 3]) {
    assert.equal(isOffside(V4.make(42, 0, 0, w), line, 1), true, `w=${w} beyond the line`);
    assert.equal(isOffside(V4.make(38, 0, 0, w), line, 1), false, `w=${w} behind the line`);
  }
});
