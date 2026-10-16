import { isActive } from '../../tgcloud/lib/alert-settings.js';
import { callEndpoint, EndpointCallError, inTelegram, requestWriteAccess } from './telegram';

export interface AlertSettings {
  bandAlerts: boolean;
  dailyHour: number | null;
}

// Outside Telegram (dev preview) there's no endpoint: keep settings in memory.
let devSettings: AlertSettings | null = null;

export async function getAlerts(): Promise<AlertSettings | null> {
  if (inTelegram) return callEndpoint<AlertSettings | null>('alerts', { action: 'get' });
  if (import.meta.env.DEV) return devSettings;
  throw new Error('Open this from Telegram to manage alerts.');
}

/** Save settings; both off unsubscribes. Asks for permission to message the user if needed. */
export async function saveAlerts(next: AlertSettings): Promise<AlertSettings | null> {
  if (!inTelegram) {
    if (!import.meta.env.DEV) throw new Error('Open this from Telegram to manage alerts.');
    await new Promise((r) => setTimeout(r, 400));
    devSettings = isActive(next) ? next : null;
    return devSettings;
  }
  const call = () => callEndpoint<AlertSettings | null>('alerts', { action: 'save', ...next });
  try {
    return await call();
  } catch (e) {
    if (!(e instanceof EndpointCallError && e.code === 'NO_WRITE_ACCESS')) throw e;
    if (!(await requestWriteAccess())) throw new Error('Alerts need permission for the bot to message you.');
    return call();
  }
}
