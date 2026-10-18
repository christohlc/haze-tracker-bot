import { tg } from './telegram';

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Elements with looping animations, each with whether it's on screen. One observer and one set of
// page/app listeners serve them all.
const looping = new Map<Element, boolean>();
let appActive = true; // Telegram's own state (Bot API 8.0+): false while minimised or behind a chat

function sync(node: Element) {
  node.toggleAttribute('data-paused', !looping.get(node) || document.hidden || !appActive);
}
const syncAll = () => looping.forEach((_, node) => sync(node));

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
 * Runs `update` (a DOM change) as a View Transition where the browser has them, so elements
 * sharing a `view-transition-name` morph between the two states; otherwise, or under reduced
 * motion, it just runs. Resolves once the transition (if any) has finished.
 */
export async function viewTransition(update: () => Promise<void>) {
  if (!document.startViewTransition || reducedMotion()) return update();
  const t = document.startViewTransition(update);
  // The update waits for a frame to snapshot the old state. If none comes (a page that isn't
  // painting), skip the animation rather than hold the tap; a skipped transition still updates.
  const stuck = setTimeout(() => t.skipTransition(), 300);
  await t.updateCallbackDone.finally(() => clearTimeout(stuck)); // rejects if `update` threw
  // The crossfade is the entrance: skip to the end of any the update started (a panel's fade, its
  // cards' rise), which would otherwise play under it and trail the tap. Loops are left running.
  for (const a of document.getAnimations()) {
    if (a.effect?.getTiming().iterations !== Infinity) a.finish();
  }
  await t.finished.catch(() => {}); // only the animation, which may have been skipped
}

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
