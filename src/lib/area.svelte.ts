// The user's area: the NEA region the hero, the advice and their band alerts follow. null means
// the highest region, as before anyone picks. Kept per user (CloudStorage in Telegram); while
// alerts are on, the subscription's region is the one that counts.

import { regionOrNull } from '../../tgcloud/lib/alert-settings.js';
import { REGIONS } from '../../tgcloud/lib/config.js';
import type { RegionId } from './api';
import { STORE_KEYS } from './store-keys';
import { getStored, setStored, tg } from './telegram';

const KEY = STORE_KEYS.area;
const asRegion = (v: unknown) => regionOrNull(v) as RegionId | null;

export const area = $state<{ id: RegionId | null }>({ id: null });

// Where the current area came from. A later, weaker source never overrides a stronger one:
// the user's pick beats their alert settings, which beat what this device remembered.
let source: 'none' | 'stored' | 'alerts' | 'picked' = 'none';
const listeners = new Set<(id: RegionId | null) => void>();

function set(id: RegionId | null) {
  area.id = id;
  setStored(KEY, id ?? 'highest');
}

getStored(KEY).then((v) => {
  if (source !== 'none' || v == null) return;
  source = 'stored';
  area.id = asRegion(v);
});

/** The user picked an area (null: the highest region). Tells listeners, e.g. alert settings. */
export function pickArea(id: RegionId | null) {
  source = 'picked';
  set(id);
  for (const fn of listeners) fn(id);
}

/** Alert settings loaded with this region: follow it unless the user has picked one since. */
export function areaFromAlerts(id: string | null) {
  if (source === 'picked') return;
  source = 'alerts';
  set(asRegion(id));
}

/** Undo a pick whose save failed, without telling listeners again. */
export const revertArea = (id: RegionId | null) => set(id);

/** Whether the user has picked an area in this session. */
export const pickedHere = () => source === 'picked';

/** Call `fn` when the user picks an area; returns the unsubscribe. */
export function onAreaPicked(fn: (id: RegionId | null) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The NEA region nearest a point, by its label point. Rough near region edges. */
function nearest(lat: number, lon: number): RegionId {
  const d = (r: (typeof REGIONS)[number]) => (r.lat - lat) ** 2 + ((r.lon - lon) * Math.cos((lat * Math.PI) / 180)) ** 2;
  return REGIONS.reduce((a, b) => (d(b) < d(a) ? b : a)).id as RegionId;
}

const locationManager = tg?.isVersionAtLeast?.('8.0') ? tg.LocationManager : null;
/** Whether "Use my location" can work here. */
export const canLocate = Boolean(locationManager) || 'geolocation' in navigator;

/** Ask for the user's location and return their nearest region; null if refused, unavailable or slow. */
export function locateArea(): Promise<RegionId | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 15_000);
    const done = (loc: { latitude: number; longitude: number } | null) => {
      clearTimeout(timer);
      resolve(loc ? nearest(loc.latitude, loc.longitude) : null);
    };
    if (locationManager) {
      const ask = () => (locationManager.isLocationAvailable ? locationManager.getLocation(done) : done(null));
      // init only once: a second init doesn't call back.
      return locationManager.isInited ? ask() : locationManager.init(ask);
    }
    if (!('geolocation' in navigator)) return done(null);
    navigator.geolocation.getCurrentPosition(
      (p) => done(p.coords),
      () => done(null),
      { maximumAge: 10 * 60_000, timeout: 15_000 },
    );
  });
}
