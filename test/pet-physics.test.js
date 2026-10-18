import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PET_H,
  PET_W,
  actionWeights,
  dragTo,
  fromSaved,
  parseSaved,
  PET_LINES,
  petMood,
  pickAction,
  release,
  settle,
  startAction,
  step,
  toSaved,
} from '../src/lib/pet-physics.ts';

const card = { id: 1, left: 16, right: 359, top: 400 };
const world = (platforms = [card]) => ({ left: 4, right: 371, top: 60, floor: 720, platforms });
const pet = (x, y, extra = {}) => ({ x, y, vx: 0, vy: 0, facing: 1, action: 'fall', on: null, ...extra });

/** Steps until it stands still (or gives up). */
function run(s, w, ms = 5000) {
  for (let t = 0; t < ms && !(s.on != null && s.vy === 0); t += 16) step(s, 16, w, 40);
  return s;
}

test('falls and lands on a card, after a bounce or two', () => {
  const s = run(pet(100, 120), world());
  assert.equal(s.on, 1);
  assert.equal(s.y, card.top);
  assert.equal(s.action, 'wait');
});

test('lands on the floor when no card is under it', () => {
  const s = run(pet(100, 120), world([]));
  assert.equal(s.on, 'floor');
  assert.equal(s.y, 720);
});

test('one-way: jumps up through a card from below', () => {
  const s = pet(100, 500, { vy: -1400 });
  let crossed = false;
  for (let t = 0; t < 2000; t += 16) {
    step(s, 16, world(), 40);
    if (s.y < card.top) crossed = true;
    if (s.on != null) break;
  }
  assert.ok(crossed, 'went above the card');
  assert.equal(s.on, 1, 'then came down on it');
});

test('a hard landing bounces, a soft one stops', () => {
  const hard = pet(100, 399, { vy: 1500 });
  assert.ok(step(hard, 16, world(), 40) > 0);
  assert.equal(hard.on, null);
  assert.ok(hard.vy < 0);
  const soft = pet(100, 399, { vy: 100 });
  step(soft, 16, world(), 40);
  assert.equal(soft.on, 1);
});

test('walks off the end of a card and falls', () => {
  const narrow = { ...card, right: 200 };
  const s = pet(narrow.right - PET_W / 2 - 2, card.top, { on: 1, action: 'walk', facing: 1 });
  for (let t = 0; t < 400 && s.on === 1; t += 16) step(s, 16, world([narrow]), 40);
  assert.equal(s.on, null);
  assert.equal(s.action, 'fall');
});

test('turns round at a wall instead of leaving the box', () => {
  const w = world([]);
  const s = pet(w.right - PET_W - 1, w.floor, { on: 'floor', action: 'walk', facing: 1 });
  for (let t = 0; t < 1000; t += 16) step(s, 16, w, 60);
  assert.ok(s.x + PET_W <= w.right);
  assert.equal(s.facing, -1);
});

test('rides along with its card and falls once it scrolls out of the box', () => {
  const s = pet(100, card.top, { on: 1, action: 'wait' });
  step(s, 16, world([{ ...card, top: 300 }]), 40);
  assert.equal(s.y, 300);
  step(s, 16, world([{ ...card, top: 80 }]), 40); // no room above it under the top inset
  assert.equal(s.on, null);
});

test('never leaves the box, even when thrown hard in a tiny viewport', () => {
  const w = { left: 0, right: 60, top: 0, floor: 70, platforms: [] };
  const s = pet(10, 60);
  for (const [vx, vy] of [[5000, -5000], [-5000, 5000], [0, -9000]]) {
    Object.assign(s, { vx, vy, on: null, action: 'fall' });
    for (let t = 0; t < 600; t += 16) {
      step(s, 16, w, 40);
      assert.ok(s.x >= w.left && s.x + PET_W <= w.right + 1e-9 + Math.max(0, PET_W - (w.right - w.left)));
      assert.ok(s.y - PET_H >= w.top - 1e-9 && s.y <= Math.max(w.floor, w.top + PET_H));
    }
  }
});

test('a throw keeps its speed, capped', () => {
  const s = pet(100, 300);
  const w = world();
  dragTo(s, 100, 300, 16, w);
  dragTo(s, 300, 200, 16, w);
  assert.equal(s.action, 'drag');
  assert.ok(s.vx > 0 && s.vy < 0);
  s.vx = 9000;
  s.vy = 0;
  release(s);
  assert.equal(Math.round(Math.hypot(s.vx, s.vy)), 2200);
  assert.equal(s.action, 'fall');
  assert.equal(step(Object.assign(pet(0, 0), { action: 'drag' }), 16, w, 40), 0, 'no physics while held');
});

test('settle puts it straight down on what is under it', () => {
  const s = pet(100, 200);
  settle(s, world());
  assert.deepEqual([s.y, s.on, s.action], [card.top, 1, 'wait']);
  const below = pet(100, 500);
  settle(below, world());
  assert.equal(below.on, 'floor');
});

test('every band has a mood and lines that give no advice', () => {
  const moods = ['good', 'moderate', 'unhealthy', 'very_unhealthy', 'hazardous'].map((b) => petMood(b));
  assert.deepEqual(moods.map((m) => m.mood), ['dozing', 'happy', 'busy', 'struggling', 'heroic']);
  assert.ok(moods.every((m, i) => i === 0 || m.fan >= moods[i - 1].fan), 'the fan never slows as it gets worse');
  assert.equal(petMood(null).mood, 'happy');
  for (const m of moods) {
    for (const line of PET_LINES[m.mood]) {
      assert.ok(line.length <= 40, line);
      assert.doesNotMatch(line, /mask|indoors|stay in|go out|exercise|safe/i, line);
    }
  }
});

test('the wander AI picks by weight, like hedgehog-mode', () => {
  assert.deepEqual(actionWeights('happy'), [['walk', 10], ['wait', 3], ['hop', 1], ['wave', 1]]);
  assert.equal(pickAction('happy', 0), 'walk');
  assert.equal(pickAction('happy', 0.7), 'wait');
  assert.equal(pickAction('happy', 0.9), 'hop');
  assert.equal(pickAction('happy', 0.999), 'wave');
  assert.ok(!actionWeights('dozing').some(([a]) => a === 'hop'), 'a dozing purifier doesn’t hop');
  const s = pet(100, card.top, { on: 1, action: 'wait' });
  startAction(s, 'hop', 0.9);
  assert.equal(s.on, null);
  assert.ok(s.vy < 0);
});

test('a saved spot round-trips and survives junk', () => {
  const w = world([]);
  const s = pet(200, 500);
  const back = fromSaved(toSaved(s, w), w);
  assert.ok(Math.abs(back.x - 200) < 1e-9 && Math.abs(back.y - 500) < 1e-9);
  assert.equal(back.on, null, 'drops from there');
  assert.deepEqual(parseSaved('{"x":0.5,"y":1}'), { x: 0.5, y: 1 });
  for (const junk of [null, '', 'nope', '{"x":"a"}', '[]']) assert.equal(parseSaved(junk), null);
  const far = fromSaved({ x: 7, y: -3 }, w);
  assert.ok(far.x + PET_W <= w.right && far.y - PET_H >= w.top);
});

test('reduced motion: off its footing, it goes straight down without falling or bouncing', () => {
  const s = pet(100, card.top, { on: 1, action: 'wait' });
  step(s, 16, world([{ ...card, top: 80 }]), 40, true); // its card scrolled up out of the box
  assert.deepEqual([s.on, s.y, s.vy], ['floor', 720, 0]);
  const thrown = pet(100, 200, { vx: 900, vy: -900 });
  release(thrown);
  step(thrown, 16, world(), 40, true);
  assert.deepEqual([thrown.on, thrown.y, thrown.vx], [1, card.top, 0]);
});
