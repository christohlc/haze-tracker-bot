// Every per-user value the Mini App keeps in Telegram CloudStorage (localStorage outside Telegram).
// One list, so getStored/setStored only take these. Telegram accepts keys of 1–128 A–Z, a–z, 0–9,
// _ and - (no colons) and refuses anything else; test/store-keys.test.js checks them.
export const STORE_KEYS = {
  adviceGroup: 'advice_group',
  area: 'area',
  whatsNewSeen: 'whats_new_seen',
  petHidden: 'pet_hidden',
  petPos: 'pet_pos',
  petName: 'pet_name',
  petFilter: 'pet_filter',
  ninjaBest: 'ninja_best',
} as const;

export type StoreKey = (typeof STORE_KEYS)[keyof typeof STORE_KEYS];
