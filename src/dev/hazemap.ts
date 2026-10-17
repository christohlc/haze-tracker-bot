// Dev-only haze map for the Where it's coming from card (see loadHazeMap in lib/api.ts).
import { fileDate, parseHaze, parseHome, parseHotspots, parseWind } from '../../tgcloud/lib/hazemap-parse.js';
import { toSgtIso } from '../../tgcloud/lib/time.js';
import type { HazeMap, HazeMapResult } from '../lib/api';
import home from '../../test/hazemap/haze-gov-home.html?raw';
import hotspotsKml from '../../test/hazemap/hotspots.kml?raw';
import hazeKml from '../../test/hazemap/boundaries.kml?raw';
import windKml from '../../test/hazemap/wind.kml?raw';

const agoIso = (min: number) => toSgtIso(Math.floor(Date.now() / 1000) - min * 60);

/** haze.gov.sg as fetched on 17 Oct 2026, re-timed to 2 hours ago. */
function sample(): HazeMap {
  const page = parseHome(home);
  return {
    hotspots: parseHotspots(hotspotsKml, fileDate(page.hotspotsUrl ?? '')),
    haze: parseHaze(hazeKml, fileDate(page.hazeUrl ?? '')),
    wind: parseWind(windKml, page.windUrl ?? ''),
    situation: page.situation,
    outlook: page.outlook,
    updatedAt: agoIso(120),
  };
}

export function demoHazeMap(): HazeMapResult {
  return { map: sample(), serverTime: Date.now() };
}

/** NEA's map on a clear day: no hotspots or haze areas, and the wind picture missing. */
export function emptyHazeMap(): HazeMapResult {
  const map = sample();
  return {
    map: { ...map, hotspots: { date: map.hotspots!.date, total: 0, regions: {}, dots: [] }, haze: { dense: [], moderate: [], date: null }, wind: null },
    serverTime: Date.now(),
  };
}

/** The texts a week old (NEA stopped updating them between episodes). */
export function oldHazeMap(): HazeMapResult {
  return { map: { ...sample(), updatedAt: agoIso(7 * 24 * 60) }, serverTime: Date.now() };
}

/** 5,000 hotspots (Sumatra and Kalimantan ablaze), haze over everything, and NEA's text three times as long. */
export function worstHazeMap(): HazeMapResult {
  const map = sample();
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const fires: string[] = [];
  const centres = [[102.5, -1.5, 2.2], [104.5, -3, 1.5], [113, -1.5, 2.5], [111, -0.5, 1.5]];
  for (let i = 0; i < 5000; i++) {
    const [x, y, spread] = centres[i % centres.length];
    const lon = x + (rand() - 0.5) * spread * 2;
    const lat = y + (rand() - 0.5) * spread * 2;
    fires.push(`<Placemark><SimpleData name="region">${lon < 106 ? 'Sumatra' : 'Kalimantan'}</SimpleData><Point><coordinates>${lon},${lat}</coordinates></Point></Placemark>`);
  }
  const box = (w: number, s: number, e: number, n: number) => `${w},${s} ${e},${s} ${e},${n} ${w},${n} ${w},${s}`;
  const area = (name: string, ring: string) => `<Placemark><name>${name}</name><Polygon><outerBoundaryIs><LinearRing><coordinates>${ring}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`;
  const huge = `<kml>${area('Moderate Haze', box(94, -11, 121, 9))}${area('Dense Haze', box(99, -5, 116, 3))}</kml>`;
  const long = `${map.situation}\n\n${map.situation}\n\n${map.situation}`;
  return {
    map: {
      ...map,
      hotspots: parseHotspots(`<kml>${fires.join('')}</kml>`, map.hotspots!.date),
      haze: parseHaze(huge, map.haze!.date),
      situation: long,
      outlook: `${map.outlook}\n\n${map.outlook}`,
      updatedAt: agoIso(60 * 30),
    },
    serverTime: Date.now(),
  };
}
