import test from 'node:test';
import assert from 'node:assert/strict';
import { PURE } from './pure-minigolf.mjs';
const { SUNNY_PARK, THEMES, parseHole, botPlay, CONFIG } = PURE;

test('Sunny Park has 15 holes and a 10-hole short round', () => {
  assert.equal(SUNNY_PARK.holes.length, 15);
  assert.equal(SUNNY_PARK.shortRound.length, 10);
  assert.equal(new Set(SUNNY_PARK.shortRound).size, 10);
  for (const i of SUNNY_PARK.shortRound) assert.ok(i >= 0 && i < 15);
  assert.ok(SUNNY_PARK.shortRound.includes(14), 'short round keeps the finale');
});

test('there are six themes and Sunny Park is playable', () => {
  assert.equal(THEMES.length, 6);
  assert.equal(THEMES.find(t => t.id === 'sunny').course, SUNNY_PARK);
});

test('every hole parses with par 2–4 and level grids match the map', () => {
  for (const def of SUNNY_PARK.holes) {
    const hole = parseHole(def);
    assert.ok(hole.par >= 2 && hole.par <= 4, def.name);
    if (def.levels) assert.equal(def.levels.length, def.map.length, `${def.name} levels rows`);
  }
});

test('the five classic mechanisms all appear in Sunny Park', () => {
  const holes = SUNNY_PARK.holes;
  const has = pred => holes.some(pred);
  assert.ok(has(h => h.extras?.some(e => e.type === 'windmill')), 'windmill');
  assert.ok(has(h => h.map.some(r => /[\^v<>]/.test(r)) || h.levels), 'ramps & split levels');
  assert.ok(has(h => h.map.some(r => r.includes('w'))), 'water');
  assert.ok(has(h => h.extras?.some(e => e.type === 'tunnel')), 'tunnel');
  assert.ok(has(h => h.extras?.some(e => e.type === 'hill')), 'slopes');
  assert.ok(has(h => h.extras?.some(e => e.type === 'bumper')), 'banked walls');
});

test('Sunny Park also has the theme-park machines', () => {
  const types = new Set(SUNNY_PARK.holes.flatMap(h => (h.extras || []).map(e => e.type)));
  for (const t of ['lift', 'loop', 'slider', 'pendulum', 'post']) assert.ok(types.has(t), t);
});

// The bot proves each hole can be finished within the stroke cap.
for (const [i, def] of SUNNY_PARK.holes.entries()) {
  test(`hole ${i + 1} "${def.name}" can be finished within ${CONFIG.maxStrokes} strokes`, () => {
    const res = botPlay(parseHole(def));
    assert.ok(res.strokes !== null, 'bot could not hole out');
    assert.ok(res.strokes <= def.par + 2, `took ${res.strokes} on a par ${def.par}`);
  });
}

const { PIRATE_COVE } = PURE;

test('Pirate Cove has 15 holes, a 10-hole round, and its own mechanisms', () => {
  assert.equal(PIRATE_COVE.holes.length, 15);
  assert.equal(new Set(PIRATE_COVE.shortRound).size, 10);
  assert.equal(THEMES.find(t => t.id === 'pirate').course, PIRATE_COVE);
  const chars = PIRATE_COVE.holes.flatMap(h => h.map).join('');
  for (const ch of ['s', 'p', 'd', 'w']) assert.ok(chars.includes(ch), `uses ${ch}`);
  const types = new Set(PIRATE_COVE.holes.flatMap(h => (h.extras || []).map(e => e.type)));
  for (const t of ['cannon', 'ship', 'tunnel']) assert.ok(types.has(t), t);
});

for (const [i, def] of PIRATE_COVE.holes.entries()) {
  test(`Pirate Cove hole ${i + 1} "${def.name}" can be finished`, () => {
    const hole = parseHole(def);
    if (def.levels) assert.equal(def.levels.length, def.map.length, 'levels rows');
    const res = botPlay(hole);
    assert.ok(res.strokes !== null && res.strokes <= def.par + 2, `took ${res.strokes} on a par ${def.par}`);
  });
}

const { VOLCANO_ISLAND } = PURE;

test('Volcano Island has 15 holes, a 10-hole round, lava, trampolines and the volcano', () => {
  assert.equal(VOLCANO_ISLAND.holes.length, 15);
  assert.equal(new Set(VOLCANO_ISLAND.shortRound).size, 10);
  assert.equal(THEMES.find(t => t.id === 'volcano').course, VOLCANO_ISLAND);
  const chars = VOLCANO_ISLAND.holes.flatMap(h => h.map).join('');
  for (const ch of ['L', 'j', '=']) assert.ok(chars.includes(ch), `uses ${ch}`);
  const types = new Set(VOLCANO_ISLAND.holes.flatMap(h => (h.extras || []).map(e => e.type)));
  for (const t of ['volcano', 'tunnel', 'post', 'pendulum', 'slider']) assert.ok(types.has(t), t);
});

for (const [i, def] of VOLCANO_ISLAND.holes.entries()) {
  test(`Volcano Island hole ${i + 1} "${def.name}" can be finished`, () => {
    if (def.levels) assert.equal(def.levels.length, def.map.length, 'levels rows');
    const res = botPlay(parseHole(def));
    assert.ok(res.strokes !== null && res.strokes <= def.par + 2, `took ${res.strokes} on a par ${def.par}`);
  });
}

const { CASTLE_KINGDOM } = PURE;

test('Castle Kingdom has 15 holes, a 10-hole round, a drawbridge, portcullis and catapult', () => {
  assert.equal(CASTLE_KINGDOM.holes.length, 15);
  assert.equal(new Set(CASTLE_KINGDOM.shortRound).size, 10);
  assert.equal(THEMES.find(t => t.id === 'castle').course, CASTLE_KINGDOM);
  assert.ok(CASTLE_KINGDOM.holes.flatMap(h => h.map).join('').includes('D'));
  const types = new Set(CASTLE_KINGDOM.holes.flatMap(h => (h.extras || []).map(e => e.type)));
  for (const t of ['drawbridge', 'portcullis', 'cannon', 'lift', 'pendulum', 'slider', 'post', 'castlewall']) assert.ok(types.has(t), t);
});

for (const [i, def] of CASTLE_KINGDOM.holes.entries()) {
  test(`Castle Kingdom hole ${i + 1} "${def.name}" can be finished`, () => {
    if (def.levels) assert.equal(def.levels.length, def.map.length, 'levels rows');
    const res = botPlay(parseHole(def));
    assert.ok(res.strokes !== null && res.strokes <= def.par + 2, `took ${res.strokes} on a par ${def.par}`);
  });
}
