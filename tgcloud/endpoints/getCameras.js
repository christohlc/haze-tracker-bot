// @ts-check
// endpoints/getCameras.js — LTA's checkpoint and Sentosa camera pictures for the Live views card.
// Separate from getDashboard so a slow camera feed never holds up the PSI.

import { getCameras } from '../lib/cameras.js';

export default async function () {
  return { cameras: await getCameras(), serverTime: Date.now() };
}
