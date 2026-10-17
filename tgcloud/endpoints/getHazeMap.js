// @ts-check
// endpoints/getHazeMap.js — NEA's regional haze map for the Where it's coming from card.
// Separate from getDashboard so a slow haze.gov.sg never holds up the PSI.

import { getHazeMap } from '../lib/hazemap.js';

export default async function () {
  return { map: await getHazeMap(), serverTime: Date.now() };
}
