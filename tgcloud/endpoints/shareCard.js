// @ts-check
// endpoints/shareCard.js — the summary card from the Mini App.
//   { action: 'share' } → { preparedId, sentToChat } for Telegram.WebApp.shareMessage
//   { action: 'send' }  → { sentToChat: true }: the card in the user's chat with the bot
// A prepared message needs the photo's file id, so if nothing has uploaded this hour's card yet,
// it goes to the user's own chat first (`sentToChat` says so).

import { api, BotApiError, EndpointError } from 'sdk';
import { isUnreachable } from '../lib/bot-errors.js';
import { dashboardButton } from '../lib/buttons.js';
import { cachedCardId, photoFileId, sendCard } from '../lib/card/send.js';
import { formatHazeCaption, formatShareCaption } from '../lib/format.js';
import { getSnapshot } from '../lib/refresh.js';

export default async function (input, ctx) {
  const userId = ctx.initData?.user?.id;
  if (!userId) throw new EndpointError('Open this from Telegram', { code: 'NO_USER' });
  if (input.action !== 'share' && input.action !== 'send') throw new EndpointError("action must be 'share' or 'send'");

  const snap = await getSnapshot();
  let fileId = input.action === 'share' ? await cachedCardId(snap) : null;
  let sentToChat = false;
  if (!fileId) {
    try {
      fileId = photoFileId(await sendCard(userId, snap, formatHazeCaption(snap), dashboardButton(userId)));
      sentToChat = true;
    } catch (e) {
      if (isUnreachable(e)) {
        throw new EndpointError('The bot can’t message you. If you blocked it, unblock it and try again.', { code: 'NO_WRITE_ACCESS' });
      }
      throw e;
    }
  }
  if (input.action === 'send') return { sentToChat };
  if (!fileId) throw new EndpointError('Couldn’t prepare the picture. Try again.', { code: 'NO_FILE' });

  try {
    const prepared = await api.savePreparedInlineMessage({
      user_id: userId,
      result: {
        type: 'photo',
        id: `card-${Date.now()}`,
        photo_file_id: fileId,
        caption: formatShareCaption(snap),
        parse_mode: 'HTML',
      },
      allow_user_chats: true,
      allow_bot_chats: true,
      allow_group_chats: true,
      allow_channel_chats: true,
    });
    return { preparedId: prepared.id, sentToChat };
  } catch (e) {
    console.error('savePreparedInlineMessage failed', e instanceof BotApiError ? `${e.code} ${e.description}` : String(e));
    throw new EndpointError('Couldn’t prepare the picture to share. Try again.', { code: 'PREPARE_FAILED' });
  }
}
