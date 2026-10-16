import type { Snapshot } from './api';
import { callEndpoint, inTelegram, tg, withWriteAccess } from './telegram';

/**
 * The summary card as a PNG object URL, drawn in the browser by the same pure module the bot
 * uses, so the preview matches what gets shared. The module (with its glyphs and map) loads
 * on first use. Revoke the URL when done.
 */
export async function renderCardUrl(snapshot: Snapshot): Promise<string> {
  const { summaryCardPng } = await import('../../tgcloud/lib/card/summary.js');
  const png = summaryCardPng(snapshot);
  return URL.createObjectURL(new Blob([png as BlobPart], { type: 'image/png' }));
}

export type ShareResult = 'shared' | 'cancelled' | 'sent' | 'downloaded';

/** `alsoSentToChat`: this hour's picture had to be uploaded first, via the user's chat with the bot. */
export interface ShareOutcome {
  result: ShareResult;
  alsoSentToChat: boolean;
}

/**
 * Share the card into a chat of the user's choosing (Bot API 8.0+), or on older clients send it
 * to their chat with the bot so they can forward it. Outside Telegram (dev) it downloads `url`.
 */
export async function shareCard(url: string): Promise<ShareOutcome> {
  if (!inTelegram) {
    const a = document.createElement('a');
    a.href = url;
    a.download = 'haze.png';
    a.click();
    return { result: 'downloaded', alsoSentToChat: false };
  }
  const canShare = typeof tg.shareMessage === 'function' && tg.isVersionAtLeast?.('8.0');
  const res = await withWriteAccess(
    () => callEndpoint<{ preparedId?: string; sentToChat: boolean }>('shareCard', { action: canShare ? 'share' : 'send' }),
    'Sharing needs permission for the bot to message you.',
  );
  if (!res.preparedId) return { result: 'sent', alsoSentToChat: false };
  return new Promise((resolve) =>
    tg.shareMessage(res.preparedId, (sent: boolean) =>
      resolve({ result: sent ? 'shared' : 'cancelled', alsoSentToChat: res.sentToChat }),
    ),
  );
}
