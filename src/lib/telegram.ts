// Thin typed wrapper over the official telegram-web-app.js (loaded in index.html).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const tg: any = (window as any).Telegram?.WebApp;

/** True only when opened inside Telegram (init data present). */
export const inTelegram = Boolean(tg?.initData);

export function initTelegram() {
  applyScheme();
  if (!tg) return;
  tg.ready();
  tg.expand();
  tg.onEvent?.('themeChanged', applyScheme);
  try {
    tg.setHeaderColor?.('secondary_bg_color');
    tg.setBackgroundColor?.('secondary_bg_color');
  } catch {
    // older clients
  }
}

const darkQuery = matchMedia('(prefers-color-scheme: dark)');
// Outside Telegram the SDK still reports colorScheme 'light', so only trust it in Telegram.
if (!inTelegram) darkQuery.addEventListener('change', applyScheme);

function applyScheme() {
  const scheme = inTelegram ? tg.colorScheme : darkQuery.matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = scheme;
}

/** Light tick on a selection change (segmented controls). No-op outside Telegram. */
export function selectionHaptic() {
  tg?.HapticFeedback?.selectionChanged?.();
}

/** Call a tgcloud endpoint; init data is attached by Telegram's SDK. */
export function callEndpoint<T>(name: string, input: Record<string, unknown> = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    tg.Serverless.call(name, input, (err: { message?: string } | null, result: T) =>
      err ? reject(new Error(err.message ?? 'Request failed')) : resolve(result),
    );
  });
}
