import type { Dashboard } from './api';
import { isCurrent } from '../../tgcloud/lib/outlook-parse.js';
import { STALE_H } from '../../tgcloud/lib/range.js';
import { isStale } from '../../tgcloud/lib/snapshot.js';
import { unixHour } from '../../tgcloud/lib/time.js';

// The last dashboard that loaded, painted at once when the app opens (and kept up when a load
// fails) while the fresh one is fetched. localStorage only: CloudStorage needs the network and
// caps values at 4 KB. News is left out (it's fetched fresh, and its links go stale); everything
// else is small.
const KEY = 'last_dashboard';

export function saveDashboard(data: Dashboard) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...data, news: null }));
  } catch {
    // Full, or storage is off: the next load just won't have a fallback.
  }
}

/** The saved dashboard, aged as the server would now: stale flag, range and forecast rechecked. */
export function cachedDashboard(now = Date.now()): Dashboard | null {
  try {
    const d: Dashboard | null = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!d?.snapshot) return null;
    const { asOf } = d.snapshot;
    const ahead = d.ahead && {
      outlook: d.ahead.outlook && isCurrent(d.ahead.outlook, now) ? d.ahead.outlook : null,
      range: now / 3_600_000 - unixHour(asOf) <= STALE_H ? d.ahead.range : null,
    };
    return { ...d, snapshot: { ...d.snapshot, stale: isStale(asOf, now) }, ahead };
  } catch {
    return null;
  }
}
