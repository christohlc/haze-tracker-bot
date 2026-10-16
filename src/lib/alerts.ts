import { isActive } from '../../tgcloud/lib/alert-settings.js';
import { callEndpoint, inTelegram, withWriteAccess } from './telegram';

export interface AlertSettings {
  bandAlerts: boolean;
  dailyHour: number | null;
  breakingAlerts: boolean;
}

// Outside Telegram (dev preview) there's no endpoint: keep settings in memory.
let devSettings: AlertSettings | null = null;

export async function getAlerts(): Promise<AlertSettings | null> {
  if (inTelegram) return callEndpoint<AlertSettings | null>('alerts', { action: 'get' });
  if (import.meta.env.DEV) return devSettings;
  throw new Error('Open this from Telegram to manage alerts.');
}

/** Save settings; all off unsubscribes. Asks for permission to message the user if needed. */
export async function saveAlerts(next: AlertSettings): Promise<AlertSettings | null> {
  if (!inTelegram) {
    if (!import.meta.env.DEV) throw new Error('Open this from Telegram to manage alerts.');
    await new Promise((r) => setTimeout(r, 400));
    devSettings = isActive(next) ? next : null;
    return devSettings;
  }
  return withWriteAccess(
    () => callEndpoint<AlertSettings | null>('alerts', { action: 'save', ...next }),
    'Alerts need permission for the bot to message you.',
  );
}
