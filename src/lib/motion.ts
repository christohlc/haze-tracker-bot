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
