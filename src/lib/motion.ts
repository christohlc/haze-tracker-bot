import { tg } from './telegram';

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Elements with looping animations, each with whether it's on screen. One observer and one set of
// page/app listeners serve them all.
const looping = new Map<Element, boolean>();
let appActive = true; // Telegram's own state (Bot API 8.0+): false while minimised or behind a chat

// Code that animates in JS (a rAF loop) and wants to stop when nobody can see the app.
const watchers = new Set<(visible: boolean) => void>();

/** Whether the page is shown and Telegram doesn't have the app in the background. */
export const appVisible = () => !document.hidden && appActive;

/** Calls `cb` whenever `appVisible()` may have changed. Returns an unsubscribe. */
export function onAppVisible(cb: (visible: boolean) => void): () => void {
  watchers.add(cb);
  return () => watchers.delete(cb);
}

/** Calls `cb` when the reduced-motion setting changes. Returns an unsubscribe. */
export function onReducedMotion(cb: (reduce: boolean) => void): () => void {
  const q = matchMedia('(prefers-reduced-motion: reduce)');
  const fn = () => cb(q.matches);
  q.addEventListener('change', fn);
  return () => q.removeEventListener('change', fn);
}

function sync(node: Element) {
  node.toggleAttribute('data-paused', !looping.get(node) || document.hidden || !appActive);
}
const syncAll = () => {
  looping.forEach((_, node) => sync(node));
  watchers.forEach((cb) => cb(appVisible()));
};

const observer =
  typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((entries) => {
        for (const { target, isIntersecting } of entries) {
          if (!looping.has(target)) continue;
          looping.set(target, isIntersecting);
          sync(target);
        }
      })
    : null;
document.addEventListener('visibilitychange', syncAll);
tg?.onEvent?.('activated', () => {
  appActive = true;
  syncAll();
});
tg?.onEvent?.('deactivated', () => {
  appActive = false;
  syncAll();
});

/**
 * Sets `data-revealed` the first time the element is mostly in view, so a one-off entrance
 * (CSS keyed on that attribute) plays when someone can see it, not below the fold. At once
 * under reduced motion or without IntersectionObserver.
 */
export function reveal(node: HTMLElement) {
  if (reducedMotion() || typeof IntersectionObserver !== 'function') {
    node.setAttribute('data-revealed', '');
    return;
  }
  const io = new IntersectionObserver(
    ([entry]) => {
      if (!entry.isIntersecting) return;
      node.setAttribute('data-revealed', '');
      io.disconnect();
    },
    { threshold: 0.4 },
  );
  io.observe(node);
  return { destroy: () => io.disconnect() };
}

/**
 * For an element with looping (ambient) animations: sets `data-paused` while it's off screen,
 * the page is hidden or Telegram has the app in the background, and app.css pauses every
 * animation under it. Nothing loops that nobody can see.
 */
export function ambient(node: HTMLElement) {
  // Reduced motion: the loops are off in CSS, so there's nothing to pause.
  if (reducedMotion()) return;
  looping.set(node, true);
  observer?.observe(node);
  sync(node);
  return {
    destroy() {
      observer?.unobserve(node);
      looping.delete(node);
    },
  };
}
