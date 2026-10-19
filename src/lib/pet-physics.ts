// The purifier pet's world: gravity, the dashboard's cards as one-way platforms, drag and throw,
// and a little wander AI. Ideas from PostHog's hedgehog-mode (MIT), written small instead of
// Matter.js + PixiJS. Pure (no DOM), so `node --test` covers it; PurifierPet.svelte measures the
// page and draws. Units: px and px/s, y down; the pet's (x, y) is its left edge and its feet.

export const PET_W = 48;
export const PET_H = 56;

export type PetAction = 'wait' | 'walk' | 'hop' | 'wave' | 'drag' | 'fall';

export interface PetState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  action: PetAction;
  /** What it's standing on: a platform id, 'floor', or null while in the air. */
  on: number | 'floor' | null;
}

/** A card's top edge. */
export interface Platform {
  id: number;
  left: number;
  right: number;
  top: number;
}

/** The safe box (inside Telegram's buttons and the notch) and the floor (the tab bar's top). */
export interface World {
  left: number;
  right: number;
  top: number;
  floor: number;
  platforms: Platform[];
}

const GRAVITY = 2400;
const AIR_DRAG = 0.6; // share of horizontal speed kept per second in the air
const RESTITUTION = 0.4; // hedgehog-mode uses 0.5; a purifier is heavier
const BOUNCE_MIN = 260; // below this landing speed it stops instead of bouncing
const MAX_THROW = 2200;
const HOP_SPEED = 520;
const MAX_DT = 50; // ms; a long frame (tab switch) mustn't tunnel through a card

export type Mood = 'dozing' | 'happy' | 'busy' | 'struggling' | 'heroic';

export interface MoodInfo {
  mood: Mood;
  /** 1 low, 2 high, 3 flat out. */
  fan: 1 | 2 | 3;
  sweat: boolean;
  /** Walking speed in px/s. */
  speed: number;
}

const MOODS: Record<string, MoodInfo> = {
  good: { mood: 'dozing', fan: 1, sweat: false, speed: 24 },
  moderate: { mood: 'happy', fan: 1, sweat: false, speed: 36 },
  unhealthy: { mood: 'busy', fan: 2, sweat: false, speed: 52 },
  very_unhealthy: { mood: 'struggling', fan: 3, sweat: true, speed: 60 },
  hazardous: { mood: 'heroic', fan: 3, sweat: true, speed: 68 },
};

/** How the pet feels about a PSI band (ids from tgcloud/lib/psi.js); no reading: happy. */
export const petMood = (band: string | null | undefined): MoodInfo => MOODS[band ?? ''] ?? MOODS.moderate;

// About the purifier itself, never advice: the dashboard says what to do.
export const PET_LINES: Record<Mood, string[]> = {
  dozing: ['Air’s clean. Mind if I nap?', 'Low fan, big dreams.', 'Nothing to filter. Bliss.'],
  happy: ['Humming along.', 'Filter’s fresh, fan’s on.', 'Just doing my rounds.'],
  busy: ['Filtering as fast as I can.', 'Fan’s on high today.', 'Bit of haze. On it.'],
  struggling: ['Working overtime here.', 'Phew. So much haze.', 'Remind me to change my filter.'],
  heroic: ['Every blade, full speed.', 'I was built for this.', 'Not stopping till it clears.'],
};

// Wander weights, like hedgehog-mode's AI (walk 10, wait 3, jump 1, wave 1), shifted by mood.
const WEIGHTS: Record<Mood, [PetAction, number][]> = {
  dozing: [['wait', 10], ['walk', 4], ['wave', 1]],
  happy: [['walk', 10], ['wait', 3], ['hop', 1], ['wave', 1]],
  busy: [['walk', 10], ['wait', 2], ['hop', 2], ['wave', 1]],
  struggling: [['walk', 10], ['wait', 3], ['hop', 1], ['wave', 1]],
  heroic: [['walk', 10], ['wait', 1], ['hop', 3], ['wave', 1]],
};

export const actionWeights = (mood: Mood) => WEIGHTS[mood];

/** A weighted pick; `rand` in [0, 1). */
export function pickAction(mood: Mood, rand: number): PetAction {
  const w = WEIGHTS[mood];
  let r = rand * w.reduce((n, [, k]) => n + k, 0);
  for (const [a, k] of w) if ((r -= k) < 0) return a;
  return w[0][0];
}

/** How long an action lasts before the next pick (a hop ends when it lands). */
export function actionMs(action: PetAction, rand: number): number {
  if (action === 'walk') return 1200 + rand * 2400;
  if (action === 'wait') return 1500 + rand * 3000;
  if (action === 'wave') return 1400;
  return 0;
}

/** Start an action on the ground: a walk picks a direction, a hop leaves the ground. */
export function startAction(s: PetState, action: PetAction, rand: number) {
  if (s.on == null || s.action === 'drag') return;
  s.action = action;
  if (action === 'walk') s.facing = rand < 0.5 ? -1 : 1;
  if (action === 'hop') {
    s.vy = -HOP_SPEED;
    s.vx = s.facing * 80;
    s.on = null;
  }
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** The floor's top, kept low enough that the pet fits under the ceiling. */
const floorOf = (w: World) => Math.max(w.floor, w.top + PET_H);

/** Platforms the pet fits on: inside the box, with room above for its height. */
const usable = (w: World) =>
  w.platforms.filter((p) => p.top - PET_H >= w.top && p.top <= w.floor && p.right - p.left >= PET_W);

/** The highest platform across `cx` whose top passes `ok` (or the lowest). */
function highestUnder(plats: Platform[], cx: number, ok: (p: Platform) => boolean, lowest = false): Platform | null {
  let best: Platform | null = null;
  for (const p of plats)
    if (cx >= p.left && cx <= p.right && ok(p) && (!best || (lowest ? p.top > best.top : p.top < best.top))) best = p;
  return best;
}

/**
 * One physics step. Mutates `s`; returns the landing speed when it touched down this step, else 0.
 * A pet standing on a card keeps to that card's top, so it rides along when the page scrolls.
 * `instant` (reduced motion): no fall or bounce; off its footing, it goes straight down.
 */
export function step(s: PetState, dtMs: number, w: World, speed: number, instant = false): number {
  if (s.action === 'drag') return 0;
  const dt = Math.min(dtMs, MAX_DT) / 1000;
  const minX = w.left;
  const maxX = w.right - PET_W;
  const plats = usable(w);
  const standingOn = () => plats.find((p) => p.id === s.on && s.x + PET_W / 2 >= p.left && s.x + PET_W / 2 <= p.right);

  if (s.on != null) {
    if (s.on === 'floor') s.y = floorOf(w);
    else {
      // The card may have scrolled away or the tab changed.
      const p = standingOn();
      if (p) s.y = p.top;
      else [s.on, s.action] = [null, 'fall'];
    }
  }
  if (s.on != null) {
    s.vy = 0;
    s.vx = s.action === 'walk' ? s.facing * speed : 0;
    s.x += s.vx * dt;
    if (s.x <= minX || s.x >= maxX) {
      s.x = clamp(s.x, minX, maxX);
      s.facing = s.x <= minX ? 1 : -1; // turn round at a wall
    }
    // Walking off the end of a card: fall.
    if (s.on === 'floor' || standingOn()) return 0;
    [s.on, s.action] = [null, 'fall'];
  }
  if (instant) {
    settleOn(s, w, plats);
    return 0;
  }

  const prevY = s.y;
  s.vy += GRAVITY * dt;
  s.vx *= Math.pow(AIR_DRAG, dt);
  s.x += s.vx * dt;
  s.y += s.vy * dt;

  if (s.x < minX || s.x > maxX) {
    s.x = clamp(s.x, minX, maxX);
    s.vx = -s.vx * RESTITUTION;
  }
  if (s.y - PET_H < w.top) {
    s.y = w.top + PET_H;
    s.vy = Math.max(s.vy, 0);
  }
  if (s.vy <= 0) return 0;

  // One-way: land on a card only when the feet cross its top on the way down.
  const landOn = highestUnder(plats, s.x + PET_W / 2, (p) => prevY <= p.top + 0.5 && s.y >= p.top);
  const floor = floorOf(w);
  const top = landOn ? landOn.top : s.y >= floor ? floor : null;
  if (top == null) return 0;

  const impact = s.vy;
  s.y = top;
  if (impact > BOUNCE_MIN) {
    s.vy = -impact * RESTITUTION;
    s.vx *= 0.7;
    return impact;
  }
  s.vy = 0;
  s.vx = 0;
  s.on = landOn ? landOn.id : 'floor';
  s.action = 'wait';
  return impact;
}

/**
 * Follow the finger while dragged: (`fx`, `fy`) is where the finger wants the pet's left edge and
 * feet. A stiff spring rather than a jump, so the throw speed is smooth (hedgehog-mode uses a
 * Matter constraint of stiffness 0.2).
 */
export function dragTo(s: PetState, fx: number, fy: number, dtMs: number, w: World) {
  s.action = 'drag';
  s.on = null;
  const dt = Math.max(dtMs, 1);
  const k = 1 - Math.pow(0.65, dt / 16.7);
  const nx = clamp(s.x + (fx - s.x) * k, w.left, w.right - PET_W);
  const ny = clamp(s.y + (fy - s.y) * k, w.top + PET_H, floorOf(w));
  // Smoothed, so one jittery frame doesn't decide the throw.
  s.vx = s.vx * 0.5 + ((nx - s.x) / dt) * 1000 * 0.5;
  s.vy = s.vy * 0.5 + ((ny - s.y) / dt) * 1000 * 0.5;
  s.x = nx;
  s.y = ny;
}

/** Let go: it keeps its speed (capped), so a flick throws it. */
export function release(s: PetState) {
  const v = Math.hypot(s.vx, s.vy);
  if (v > MAX_THROW) {
    s.vx *= MAX_THROW / v;
    s.vy *= MAX_THROW / v;
  }
  s.action = 'fall';
  s.on = null;
}

/**
 * On the floor it stands over whatever scrolls behind the tab bar, so it doesn't stay there: the
 * card top it leaps up to, the lowest one above it. None while no card's top is in view.
 */
export function leapTarget(s: PetState, w: World): Platform | null {
  if (s.on !== 'floor') return null;
  const below = floorOf(w) - 8;
  return highestUnder(usable(w), s.x + PET_W / 2, (p) => p.top < below, true);
}

/** A jump just high enough to clear `p`'s top, so it lands there on the way down; `instant`
    (reduced motion): it's simply there. */
export function leap(s: PetState, p: Platform, instant = false) {
  if (instant) {
    [s.y, s.vx, s.vy, s.on, s.action] = [p.top, 0, 0, p.id, 'wait'];
    return;
  }
  s.vy = -Math.sqrt(2 * GRAVITY * (s.y - p.top + 16));
  s.vx = 0;
  s.on = null;
  s.action = 'hop';
}

function settleOn(s: PetState, w: World, plats: Platform[]) {
  s.x = clamp(s.x, w.left, w.right - PET_W);
  const best = highestUnder(plats, s.x + PET_W / 2, (p) => p.top >= s.y - 0.5);
  s.y = best ? best.top : floorOf(w);
  s.on = best ? best.id : 'floor';
  s.vx = s.vy = 0;
  s.action = 'wait';
}

/** Put it straight down on whatever is under it (reduced motion: no fall, no bounce). */
export const settle = (s: PetState, w: World) => settleOn(s, w, usable(w));

/** Where it was left, as fractions of the box, so a resized or rotated screen still fits it. */
export interface SavedPos {
  x: number;
  y: number;
}

export function toSaved(s: PetState, w: World): SavedPos {
  const spanX = w.right - PET_W - w.left;
  const spanY = floorOf(w) - PET_H - w.top;
  return {
    x: spanX > 0 ? clamp((s.x - w.left) / spanX, 0, 1) : 0,
    y: spanY > 0 ? clamp((s.y - PET_H - w.top) / spanY, 0, 1) : 1,
  };
}

/** A pet back where it was left, in the air: it drops onto whatever is under it. */
export function fromSaved(p: SavedPos, w: World): PetState {
  const x = w.left + clamp(p.x, 0, 1) * Math.max(0, w.right - PET_W - w.left);
  const y = w.top + PET_H + clamp(p.y, 0, 1) * (floorOf(w) - PET_H - w.top);
  return { x, y, vx: 0, vy: 0, facing: p.x > 0.5 ? -1 : 1, action: 'fall', on: null };
}

/** Parse a stored position; anything odd is ignored. */
export function parseSaved(raw: string | null): SavedPos | null {
  try {
    const v = raw ? JSON.parse(raw) : null;
    return v && Number.isFinite(v.x) && Number.isFinite(v.y) ? { x: v.x, y: v.y } : null;
  } catch {
    return null;
  }
}
