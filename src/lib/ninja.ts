// Hazelnut Ninja, the game hidden behind the header (tap the logo or the name).
// Slice hazelnuts, dodge the haze, 60 seconds. Plain canvas, no assets.
//
// Ported from Fruit Ninja in GameKit UI (https://github.com/slarity/gamekit-ui):
//   MIT License. Copyright (c) 2026 gamekitui contributors.
//   Permission is hereby granted, free of charge, to any person obtaining a copy of this
//   software and associated documentation files (the "Software"), to deal in the Software
//   without restriction, including without limitation the rights to use, copy, modify, merge,
//   publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons
//   to whom the Software is furnished to do so, subject to the following conditions: The above
//   copyright notice and this permission notice shall be included in all copies or substantial
//   portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
//   EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
//   FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
//   HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
//   CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
//   USE OR OTHER DEALINGS IN THE SOFTWARE.

// Everything is drawn and simulated in this logical space; the canvas is scaled to fit.
const LOGW = 360;
const LOGH = 480;
export const ARCADE_TIME = 60; // seconds; the clock is the only way a run ends

const GRAVITY = 900; // px/s²
const HAZE_PENALTY = 10; // points lost for slicing a haze cloud
const COMBO_WINDOW = 0.45; // s; slices this close together stack a combo
const TRAIL_LIFE = 0.14; // s a blade point lingers
const MIN_SLICE_LEN = 5; // logical px; shorter moves (taps) don't slice
const FOG_TIME = 0.6; // s the field stays hazy after slicing a cloud

// The nut art is fixed (like the hero sky), taken from public/logo.svg. Only the field, the
// blade and the text follow the theme.
const SHELL = ['#c88b4f', '#9a6332', '#6a4120'];
const GOLD = ['#ffe9a3', '#e2b84a', '#a8781c'];
const SCAR = '#dcbc84';
const GOLD_SCAR = '#fff1c4';
const SPECKLE = '#b48b52';
const GRAIN = 'rgba(92, 57, 27, 0.3)';
const KERNEL = '#f3e3c3';
const KERNEL_CORE = '#e4c898';
const HUSK = ['#7cb35a', '#5a8f3c'];
const CLOUD = ['#8f8a80', '#aaa498', '#c4bdb0'];
const CLOUD_FACE = '#45413a';

export interface Theme {
  font: string;
  card: string;
  accent: string;
  haze: string;
  critical: string;
}

/** Reads the colours the game uses from the app's CSS tokens. */
export function readTheme(el: Element = document.documentElement): Theme {
  const cs = getComputedStyle(el);
  const v = (name: string) => cs.getPropertyValue(name).trim();
  return {
    font: v('--font-display'),
    card: v('--card'),
    accent: v('--accent'),
    haze: v('--brand-haze'),
    critical: v('--status-critical'),
  };
}

type Kind = 'nut' | 'gold' | 'haze';

// What differs between the kinds, apart from how they're drawn. Haze has no points: slicing it
// costs HAZE_PENALTY instead.
const KINDS: Record<Kind, { r: [number, number]; points: number; chips: string[] }> = {
  nut: { r: [23, 29], points: 1, chips: [SHELL[1]!, KERNEL, SHELL[2]!] },
  gold: { r: [18, 22], points: 3, chips: [GOLD[1]!, KERNEL] },
  haze: { r: [26, 31], points: 0, chips: CLOUD },
};

interface Item {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  rot: number;
  vrot: number;
  kind: Kind;
  husk: boolean;
  sliced: boolean;
}

interface Half {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  kind: Kind;
  rot: number;
  vrot: number;
  cut: number; // slice angle in the nut's own frame; orients the flat edge
  side: 1 | -1;
  life: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
  life: number;
  maxLife: number;
  puff: boolean; // haze puffs swell as they fade; shell chips shrink
}

interface FloatText {
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
  text: string;
  color: string;
  size: number;
}

interface TrailPoint {
  x: number;
  y: number;
  age: number;
}

interface State {
  items: Item[];
  halves: Half[];
  particles: Particle[];
  texts: FloatText[];
  trail: TrailPoint[];
  score: number;
  timeLeft: number;
  combo: number;
  comboTimer: number;
  spawnTimer: number;
  elapsed: number;
  fog: number;
}

function initState(): State {
  return {
    items: [],
    halves: [],
    particles: [],
    texts: [],
    trail: [],
    score: 0,
    timeLeft: ARCADE_TIME,
    combo: 0,
    comboTimer: 0,
    spawnTimer: 0.8,
    elapsed: 0,
    fog: 0,
  };
}

/** Shortest distance from point (px,py) to segment (ax,ay)-(bx,by). */
function segPointDist(ax: number, ay: number, bx: number, by: number, px: number, py: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export interface GameEvents {
  onScore(score: number): void;
  /** Whole seconds left, called when the number shown should change. */
  onTime(seconds: number): void;
  onOver(score: number): void;
  onSlice(kind: Kind): void;
}

export interface Game {
  start(): void;
  setPaused(paused: boolean): void;
  setTheme(theme: Theme): void;
  setReducedMotion(reduce: boolean): void;
  /** Size the canvas to its CSS box (width × height in CSS px). */
  resize(width: number, height: number): void;
  destroy(): void;
}

export function createGame(canvas: HTMLCanvasElement, events: GameEvents, theme: Theme, reduce: boolean): Game {
  const ctx = canvas.getContext('2d')!;
  let gs = initState();
  let playing = false;
  let paused = false;
  let down = false; // blade touching the field
  let shownSec = ARCADE_TIME;

  // ---------------------------------------------------------------- spawning

  const spawn = (kind: Kind) => {
    const r = rand(...KINDS[kind].r);
    const x = rand(60, LOGW - 60);
    const apex = LOGH * rand(0.62, 0.92) * (reduce ? 0.82 : 1);
    gs.items.push({
      x,
      y: LOGH + r,
      vx: ((LOGW / 2 - x) / LOGH) * 240 + rand(-120, 120),
      vy: -Math.sqrt(2 * GRAVITY * apex),
      r,
      rot: kind === 'haze' ? rand(-0.25, 0.25) : rand(0, Math.PI * 2),
      vrot: kind === 'haze' ? rand(-0.4, 0.4) : rand(-3, 3),
      kind,
      husk: kind === 'nut' && Math.random() < 0.35,
      sliced: false,
    });
  };

  const maybeSpawnWave = (dt: number) => {
    gs.spawnTimer -= dt;
    if (gs.spawnTimer > 0) return;
    // Before a run (and after it) a few nuts drift past behind the start card; no haze.
    const demo = !playing;
    const diff = demo ? 0 : Math.min(gs.elapsed / 45, 1); // ramps up over ~45 s
    gs.spawnTimer = (1.05 - 0.55 * diff) * (reduce ? 1.35 : 1) * (demo ? 1.6 : 1) + rand(0, 0.3);
    let wave = 1;
    if (Math.random() < 0.3 + 0.4 * diff) wave++;
    if (Math.random() < 0.12 + 0.3 * diff) wave++;
    for (let i = 0; i < wave; i++) {
      // Haze only after a short grace period, then more often.
      const hazeChance = !demo && gs.elapsed > 6 ? Math.min(0.08 + 0.14 * diff, 0.24) : 0;
      const roll = Math.random();
      spawn(roll < hazeChance ? 'haze' : roll < hazeChance + 0.07 ? 'gold' : 'nut');
    }
  };

  // ---------------------------------------------------------------- slicing

  const burst = (f: Item, count: number) => {
    const puff = f.kind === 'haze';
    const colors = KINDS[f.kind].chips;
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = puff ? rand(20, 110) : rand(40, 240);
      gs.particles.push({
        x: f.x,
        y: f.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 60,
        r: puff ? rand(6, 12) : rand(2, 4.5),
        color: colors[i % colors.length]!,
        life: 0,
        maxLife: puff ? rand(0.6, 1.1) : rand(0.4, 0.85),
        puff,
      });
    }
  };

  const float = (x: number, y: number, text: string, color: string, size: number) => {
    gs.texts.push({ x, y, vy: -55, life: 0, maxLife: 0.9, text, color, size });
  };

  const sliceItem = (f: Item, ax: number, ay: number, bx: number, by: number) => {
    f.sliced = true;
    events.onSlice(f.kind);

    if (f.kind === 'haze') {
      // Costs points and breaks the combo, never ends the run.
      gs.score = Math.max(0, gs.score - HAZE_PENALTY);
      gs.combo = 0;
      gs.comboTimer = 0;
      gs.fog = FOG_TIME;
      events.onScore(gs.score);
      burst(f, reduce ? 6 : 16);
      float(f.x, f.y - f.r, `−${HAZE_PENALTY}`, theme.critical, 22);
      return;
    }

    gs.combo = gs.comboTimer > 0 ? gs.combo + 1 : 1;
    gs.comboTimer = COMBO_WINDOW;
    const points = KINDS[f.kind].points;
    gs.score += points + (gs.combo >= 2 ? 1 : 0);
    events.onScore(gs.score);

    if (gs.combo >= 2) {
      float(f.x, f.y - f.r, `Combo ×${gs.combo}`, theme.accent, Math.min(16 + gs.combo * 2, 30));
    } else if (points > 1) {
      float(f.x, f.y - f.r, `+${points}`, theme.haze, 22);
    }

    // The halves fly apart across the blade.
    const cut = Math.atan2(by - ay, bx - ax);
    const px = Math.cos(cut + Math.PI / 2);
    const py = Math.sin(cut + Math.PI / 2);
    const kick = rand(60, 130);
    for (const side of [1, -1] as const) {
      gs.halves.push({
        x: f.x,
        y: f.y,
        vx: f.vx * 0.4 + px * kick * side,
        vy: f.vy * 0.4 + py * kick * side - 40,
        r: f.r,
        kind: f.kind,
        rot: f.rot,
        vrot: f.vrot + side * rand(1, 4),
        cut: cut - f.rot,
        side,
        life: 0,
      });
    }
    burst(f, reduce ? 5 : 12);
  };

  const sliceAlong = (ax: number, ay: number, bx: number, by: number) => {
    if (!playing || Math.hypot(bx - ax, by - ay) < MIN_SLICE_LEN) return;
    for (const f of gs.items) {
      if (!f.sliced && segPointDist(ax, ay, bx, by, f.x, f.y) <= f.r) sliceItem(f, ax, ay, bx, by);
    }
  };

  // ---------------------------------------------------------------- physics

  const step = (dt: number) => {
    if (playing) {
      gs.elapsed += dt;
      gs.timeLeft = Math.max(0, gs.timeLeft - dt);
      const sec = Math.ceil(gs.timeLeft);
      if (sec !== shownSec) {
        shownSec = sec;
        events.onTime(sec);
      }
      if (gs.timeLeft <= 0) {
        playing = false;
        down = false; // a finger held through Time's up needs a fresh touch for the next run
        gs.trail = [];
        events.onOver(gs.score);
      }
    }
    if (gs.comboTimer > 0) gs.comboTimer = Math.max(0, gs.comboTimer - dt);
    if (gs.fog > 0) gs.fog = Math.max(0, gs.fog - dt);

    maybeSpawnWave(dt);

    for (const p of gs.trail) p.age += dt;
    gs.trail = gs.trail.filter((p) => p.age < TRAIL_LIFE);

    // Missed nuts just fall away; there's no penalty.
    for (const f of gs.items) {
      f.vy += GRAVITY * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.rot += f.vrot * dt;
    }
    gs.items = gs.items.filter((f) => !f.sliced && !(f.y - f.r > LOGH && f.vy > 0));

    for (const h of gs.halves) {
      h.vy += GRAVITY * dt;
      h.x += h.vx * dt;
      h.y += h.vy * dt;
      h.rot += h.vrot * dt;
      h.life += dt;
    }
    gs.halves = gs.halves.filter((h) => h.y - h.r <= LOGH + 40);

    for (const p of gs.particles) {
      p.vy += GRAVITY * (p.puff ? 0.05 : 0.6) * dt;
      p.vx *= p.puff ? 0.96 : 1;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life += dt;
    }
    gs.particles = gs.particles.filter((p) => p.life < p.maxLife);

    for (const t of gs.texts) {
      t.y += t.vy * dt;
      t.life += dt;
    }
    gs.texts = gs.texts.filter((t) => t.life < t.maxLife);
  };

  // ---------------------------------------------------------------- drawing

  // The logo's teardrop nut, in units of r, centred on the origin.
  const nutPath = (r: number) => {
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.bezierCurveTo(0.52 * r, -0.97 * r, r, -0.46 * r, r, 0.15 * r);
    ctx.bezierCurveTo(r, 0.66 * r, 0.59 * r, r, 0, r);
    ctx.bezierCurveTo(-0.59 * r, r, -r, 0.66 * r, -r, 0.15 * r);
    ctx.bezierCurveTo(-r, -0.46 * r, -0.52 * r, -0.97 * r, 0, -r);
    ctx.closePath();
  };

  // Shell shading at unit radius, built once and scaled per nut rather than every frame.
  const shading = (c: string[]) => {
    const g = ctx.createRadialGradient(-0.3, -0.4, 0, -0.3, -0.4, 1.5);
    g.addColorStop(0, c[0]!);
    g.addColorStop(0.6, c[1]!);
    g.addColorStop(1, c[2]!);
    return g;
  };
  const SHADING = { nut: shading(SHELL), gold: shading(GOLD) };

  const drawShell = (r: number, gold: boolean) => {
    ctx.save();
    ctx.scale(r, r);
    nutPath(1);
    ctx.fillStyle = gold ? SHADING.gold : SHADING.nut;
    ctx.fill();
    ctx.restore();

    ctx.save();
    nutPath(r);
    ctx.clip();
    // Grain running down from the tip.
    ctx.strokeStyle = GRAIN;
    ctx.lineWidth = r * 0.07;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -0.95 * r);
    ctx.quadraticCurveTo(-0.3 * r, -0.2 * r, -0.24 * r, 0.5 * r);
    ctx.moveTo(0, -0.95 * r);
    ctx.quadraticCurveTo(0.42 * r, -0.2 * r, 0.36 * r, 0.5 * r);
    ctx.stroke();
    // Pale husk scar at the base, speckled.
    ctx.fillStyle = gold ? GOLD_SCAR : SCAR;
    ctx.beginPath();
    ctx.moveTo(-1.1 * r, 0.5 * r);
    ctx.quadraticCurveTo(0, 0.3 * r, 1.1 * r, 0.5 * r);
    ctx.lineTo(1.1 * r, 1.1 * r);
    ctx.lineTo(-1.1 * r, 1.1 * r);
    ctx.fill();
    ctx.fillStyle = SPECKLE;
    for (const [sx, sy] of [[-0.5, 0.58], [-0.17, 0.5], [0.17, 0.5], [0.5, 0.58], [-0.33, 0.75], [0, 0.7], [0.33, 0.75]]) {
      ctx.beginPath();
      ctx.arc(sx! * r, sy! * r, r * 0.045, 0, Math.PI * 2);
      ctx.fill();
    }
    // Shine.
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(-0.38 * r, -0.3 * r, 0.16 * r, 0.26 * r, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  // The frilly green husk some nuts still wear, round the tip.
  const drawHusk = (r: number) => {
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.42;
      ctx.save();
      ctx.translate(Math.cos(a) * 0.82 * r, Math.sin(a) * 0.82 * r);
      ctx.rotate(a + Math.PI / 2);
      ctx.fillStyle = HUSK[i % 2]!;
      ctx.beginPath();
      ctx.ellipse(0, -0.2 * r, 0.2 * r, 0.42 * r, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  };

  const drawCloud = (r: number) => {
    const puffs: [number, number, number, number][] = [
      // x, y, radius (units of r), colour index
      [-0.55, 0.15, 0.55, 0],
      [0.55, 0.15, 0.55, 0],
      [0, 0.25, 0.62, 0],
      [-0.3, -0.25, 0.58, 1],
      [0.3, -0.3, 0.62, 1],
      [-0.05, -0.05, 0.5, 2],
    ];
    for (const [x, y, pr, c] of puffs) {
      ctx.fillStyle = CLOUD[c]!;
      ctx.beginPath();
      ctx.arc(x * r, y * r, pr * r, 0, Math.PI * 2);
      ctx.fill();
    }
    // A grumpy face, so it reads as something to avoid.
    ctx.fillStyle = CLOUD_FACE;
    for (const ex of [-0.25, 0.25]) {
      ctx.beginPath();
      ctx.arc(ex * r, -0.05 * r, 0.08 * r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = CLOUD_FACE;
    ctx.lineWidth = 0.07 * r;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0.38 * r, 0.2 * r, 1.15 * Math.PI, 1.85 * Math.PI);
    ctx.stroke();
  };

  const drawItem = (f: Item) => {
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.rot);
    if (f.kind === 'haze') {
      drawCloud(f.r);
    } else {
      if (f.husk) drawHusk(f.r);
      drawShell(f.r, f.kind === 'gold');
    }
    ctx.restore();
  };

  // Half a nut: the shell clipped along the cut, with the cream kernel showing inside.
  const drawHalf = (h: Half) => {
    const r = h.r;
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(h.rot);
    ctx.globalAlpha = Math.max(0, 1 - h.life / 1.4);
    ctx.rotate(h.cut);
    ctx.beginPath();
    ctx.rect(-2 * r, h.side === 1 ? 0 : -2 * r, 4 * r, 2 * r);
    ctx.rotate(-h.cut);
    ctx.clip();
    drawShell(r, h.kind === 'gold');
    nutPath(r * 0.78);
    ctx.fillStyle = KERNEL;
    ctx.fill();
    nutPath(r * 0.4);
    ctx.fillStyle = KERNEL_CORE;
    ctx.fill();
    ctx.restore();
  };

  const drawTrail = () => {
    const trail = gs.trail;
    if (trail.length < 2) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 1; i < trail.length; i++) {
      const p0 = trail[i - 1]!;
      const p1 = trail[i]!;
      const a = 1 - p1.age / TRAIL_LIFE;
      if (a <= 0) continue;
      // An accent glow with a thin card-coloured edge down the middle.
      for (const [color, alpha, width, min] of [[theme.accent, 0.55, 14, 2], [theme.card, 0.9, 5, 1]] as const) {
        ctx.strokeStyle = color;
        ctx.globalAlpha = a * alpha;
        ctx.lineWidth = width * a + min;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  };

  // A low band of haze along the bottom of the field; only the theme changes it.
  const hazeBand = () => {
    const g = ctx.createLinearGradient(0, LOGH * 0.55, 0, LOGH);
    g.addColorStop(0, theme.card);
    g.addColorStop(1, theme.haze);
    return g;
  };
  let sky = hazeBand();

  const draw = () => {
    ctx.fillStyle = theme.card;
    ctx.fillRect(0, 0, LOGW, LOGH);
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = sky;
    ctx.fillRect(0, LOGH * 0.55, LOGW, LOGH * 0.45);

    for (const p of gs.particles) {
      const a = Math.max(0, 1 - p.life / p.maxLife);
      ctx.globalAlpha = p.puff ? a * 0.7 : a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.puff ? p.r * (1 + (1 - a) * 1.5) : p.r * a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const h of gs.halves) drawHalf(h);
    for (const f of gs.items) drawItem(f);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of gs.texts) {
      ctx.globalAlpha = Math.max(0, 1 - t.life / t.maxLife);
      ctx.fillStyle = t.color;
      ctx.font = `800 ${t.size}px ${theme.font}`;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;

    drawTrail();

    // Slicing a cloud fills the field with haze for a moment.
    if (gs.fog > 0) {
      ctx.globalAlpha = (gs.fog / FOG_TIME) * 0.55;
      ctx.fillStyle = theme.haze;
      ctx.fillRect(0, 0, LOGW, LOGH);
      ctx.globalAlpha = 1;
    }
  };

  // ---------------------------------------------------------------- loop

  let raf = 0;
  let last = 0;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;
    if (paused) return;
    // With reduced motion, nothing drifts by while waiting to start.
    if (playing || !reduce) step(dt);
    draw();
  };
  raf = requestAnimationFrame(frame);

  // ---------------------------------------------------------------- blade

  const toLogical = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * LOGW,
      y: ((e.clientY - rect.top) / rect.height) * LOGH,
    };
  };
  let lastX = 0;
  let lastY = 0;
  const pushTrail = (x: number, y: number) => {
    gs.trail.push({ x, y, age: 0 });
    if (gs.trail.length > 24) gs.trail.shift();
  };
  const onDown = (e: PointerEvent) => {
    if (!playing) return;
    down = true;
    canvas.setPointerCapture?.(e.pointerId);
    ({ x: lastX, y: lastY } = toLogical(e));
    pushTrail(lastX, lastY);
  };
  const onMove = (e: PointerEvent) => {
    if (!down || !playing) return;
    const p = toLogical(e);
    pushTrail(p.x, p.y);
    sliceAlong(lastX, lastY, p.x, p.y);
    lastX = p.x;
    lastY = p.y;
  };
  const onUp = (e: PointerEvent) => {
    down = false;
    canvas.releasePointerCapture?.(e.pointerId);
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  return {
    start() {
      // Nuts still in the air from the demo stay, and count once the run starts.
      gs = { ...initState(), items: gs.items, halves: gs.halves, particles: gs.particles };
      shownSec = ARCADE_TIME;
      playing = true;
      events.onScore(0);
      events.onTime(ARCADE_TIME);
    },
    setPaused(p) {
      paused = p;
      last = 0;
    },
    setTheme(t) {
      theme = t;
      sky = hazeBand();
    },
    setReducedMotion(r) {
      reduce = r;
    },
    resize(width, height) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      // Separate x and y scales, so rounding never leaves a strip undrawn.
      ctx.setTransform(canvas.width / LOGW, 0, 0, canvas.height / LOGH, 0, 0);
      draw();
    },
    destroy() {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
    },
  };
}
