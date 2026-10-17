import type { Dashboard } from './api';

// The last dashboard that loaded, so a dropped connection still shows readings. localStorage
// only: CloudStorage needs the network and caps values at 4 KB. News is left out (it's fetched
// fresh, and its links go stale); everything else is small.
const KEY = 'last_dashboard';

export interface Cached {
  savedAt: number;
  data: Dashboard;
}

export function saveDashboard(data: Dashboard) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), data: { ...data, news: null } }));
  } catch {
    // Full, or storage is off: the next load just won't have a fallback.
  }
}

export function cachedDashboard(): Cached | null {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return c?.data?.snapshot ? c : null;
  } catch {
    return null;
  }
}
