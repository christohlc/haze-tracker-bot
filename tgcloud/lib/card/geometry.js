// @ts-check
// Summary card size and map placement. Shared by the card (summary.js) and the scripts that
// generate its assets (scripts/card/), so the silhouette and the tiles line up.

export const CARD_W = 1080;
export const CARD_H = 1350;

/** Equirectangular projection of the island: (MAP.lon, MAP.lat) lands on card px (MAP.x, MAP.y),
 *  MAP.scale px per degree. Near the equator, so no cos(lat) correction. */
export const MAP = { lon: 103.835, lat: 1.355, x: 540, y: 690, scale: 2500 };

/** @param {number} lon @param {number} lat @returns {[number, number]} card px */
export const project = (lon, lat) => [MAP.x + (lon - MAP.lon) * MAP.scale, MAP.y - (lat - MAP.lat) * MAP.scale];
