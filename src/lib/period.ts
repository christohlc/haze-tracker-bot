/** The PSI averaging period picked in the hero; the region list follows it. */
export type Period = '1h' | '3h' | '24h';

export const PERIODS: Record<Period, { short: string; adj: string; eyebrow: string; caption: string }> = {
  '1h': {
    short: '1 hr',
    adj: '1-hour',
    eyebrow: 'Last hour',
    caption: 'Last hour, worked out from NEA’s PM2.5. Our calculation, not official.',
  },
  '3h': {
    short: '3 hr',
    adj: '3-hour',
    eyebrow: 'Last 3 hours',
    caption: 'Last 3 hours of PM2.5, averaged. Our calculation, not official.',
  },
  '24h': { short: '24 hr', adj: '24-hour', eyebrow: 'Past 24 hours', caption: 'NEA’s official 24-hour PSI.' },
};

/** Shortest first. */
export const PERIOD_ORDER = Object.keys(PERIODS) as Period[];

export const psiKey = (p: Period) => `psi${p}` as const;
