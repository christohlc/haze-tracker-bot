import { CHANGELOG, LATEST_ID } from './changelog';
import { getStored, setStored } from './telegram';

const SEEN_KEY = 'whats_new_seen';

/** The latest changelog id this user has seen, or null if none. */
export const getSeen = () => getStored(SEEN_KEY);

export const markSeen = () => setStored(SEEN_KEY, LATEST_ID);

/** How many entries are newer than `seen`. None for someone who has never looked. */
export function newCount(seen: string | null): number {
  if (!seen) return 0;
  return Math.max(0, CHANGELOG.findIndex((e) => e.id === seen));
}
