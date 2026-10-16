import type { Snapshot } from './api';
import { callEndpoint, EndpointCallError, inTelegram, requestWriteAccess, tg } from './telegram';

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

/**
 * Share the card into a chat of the user's choosing (Bot API 8.0+), or on older clients send it
 * to their chat with the bot so they can forward it. Outside Telegram (dev) it downloads `url`.
 */
export async function shareCard(url: string): Promise<ShareResult> {
  if (!inTelegram) {
    const a = document.createElement('a');
    a.href = url;
    a.download = 'haze.png';
    a.click();
    return 'downloaded';
  }
  const canShare = typeof tg.shareMessage === 'function' && tg.isVersionAtLeast?.('8.0');
  const call = () =>
    callEndpoint<{ preparedId?: string; sentToChat: boolean }>('shareCard', { action: canShare ? 'share' : 'send' });
  let res;
  try {
    res = await call();
  } catch (e) {
    if (!(e instanceof EndpointCallError && e.code === 'BOT_BLOCKED')) throw e;
    if (!(await requestWriteAccess())) throw new Error('Sharing needs permission for the bot to message you.');
    res = await call();
  }
  if (!canShare || !res.preparedId) return 'sent';
  const id = res.preparedId;
  return new Promise((resolve) => tg.shareMessage(id, (sent: boolean) => resolve(sent ? 'shared' : 'cancelled')));
}
