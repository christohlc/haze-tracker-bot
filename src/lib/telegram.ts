// Thin typed wrapper over the official telegram-web-app.js (loaded in index.html).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const tg: any = (window as any).Telegram?.WebApp;

/** True only when opened inside Telegram (init data present). */
export const inTelegram = Boolean(tg?.initData);

export function initTelegram() {
  applyScheme();
  // Outside Telegram the SDK still reports colorScheme 'light', so follow the OS there.
  if (!inTelegram) darkQuery.addEventListener('change', applyScheme);
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

function applyScheme() {
  const scheme = inTelegram ? tg.colorScheme : darkQuery.matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = scheme;
}

/** Light tick on a selection change (segmented controls). No-op outside Telegram. */
export function selectionHaptic() {
  tg?.HapticFeedback?.selectionChanged?.();
}

/** Open an outside link in Telegram's in-app browser. Returns false outside Telegram. */
export function openLink(url: string): boolean {
  if (!inTelegram || !tg.openLink) return false;
  tg.openLink(url);
  return true;
}

/** Success / error buzz after an action completes. No-op outside Telegram. */
export function notifyHaptic(type: 'success' | 'error' | 'warning') {
  tg?.HapticFeedback?.notificationOccurred?.(type);
}

/** Show Telegram's bottom MainButton. Returns a cleanup that hides it and drops the handler. */
export function showMainButton(text: string, onClick: () => void): () => void {
  const mb = tg?.MainButton;
  if (!inTelegram || !mb) return () => {};
  mb.setParams({ text, is_visible: true, is_active: true });
  mb.onClick(onClick);
  return () => {
    mb.offClick(onClick);
    mb.hideProgress();
    mb.hide();
  };
}

export function setMainButtonBusy(busy: boolean) {
  const mb = tg?.MainButton;
  if (!inTelegram || !mb) return;
  if (busy) mb.showProgress(false);
  else mb.hideProgress();
}

/** Show Telegram's header BackButton. Returns a cleanup that hides it and drops the handler. */
export function showBackButton(onClick: () => void): () => void {
  const bb = tg?.BackButton;
  if (!inTelegram || !bb) return () => {};
  bb.onClick(onClick);
  bb.show();
  return () => {
    bb.offClick(onClick);
    bb.hide();
  };
}

// CloudStorage needs Bot API 6.9+; older clients throw, so they use localStorage too.
const cloudStorage = inTelegram && tg.isVersionAtLeast?.('6.9') ? tg.CloudStorage : null;

/** Read a small per-user value: Telegram CloudStorage in Telegram, localStorage otherwise. */
export async function getStored(key: string): Promise<string | null> {
  if (cloudStorage) {
    return new Promise((resolve) =>
      cloudStorage.getItem(key, (err: unknown, value?: string) => resolve(err ? null : value || null)),
    );
  }
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // storage blocked (private mode)
  }
}

/** Write a small per-user value. Best effort: failures are ignored. */
export function setStored(key: string, value: string) {
  try {
    if (cloudStorage) cloudStorage.setItem(key, value);
    else localStorage.setItem(key, value);
  } catch {
    // storage blocked (private mode)
  }
}

/** Ask the user to let the bot message them. Resolves true if allowed. */
export function requestWriteAccess(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!tg?.requestWriteAccess) return resolve(false);
    tg.requestWriteAccess((allowed: boolean) => resolve(allowed));
  });
}

/** An endpoint refusal: `code` is the EndpointError code, when there is one. */
export class EndpointCallError extends Error {
  readonly code: string | null;
  constructor(message: string, code: string | null) {
    super(message);
    this.code = code;
  }
}

/** Call a tgcloud endpoint; init data is attached by Telegram's SDK. */
export function callEndpoint<T>(name: string, input: Record<string, unknown> = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    tg.Serverless.call(
      name,
      input,
      (err: { message?: string; parameters?: { code?: string } } | null, result: T) =>
        err
          ? reject(new EndpointCallError(err.message ?? 'Request failed', err.parameters?.code ?? null))
          : resolve(result),
    );
  });
}
