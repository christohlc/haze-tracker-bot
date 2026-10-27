## What and why

<!-- The problem this solves, and how. On a bug fix, the cause. -->

## Risk

<!-- High / Medium / Low, by the riskiest file it touches (REVIEW.md#risk-tiers). -->

- [ ] Needs `npx tgcloud migrate` before deploy (reads a new column or table)
- [ ] Needs `npx wrangler@4 deploy --config cron/wrangler.jsonc` (changes `cron/`)
- [ ] Needs `admin` `{ action: 'commands' }` after deploy (changes `COMMANDS`)
- [ ] User-facing: has a “What’s new” entry

## Testing

<!-- What you ran and what it showed: npm test / check / build, the preview, a tgcloud run. -->

## Review

<!-- Which reviews ran (REVIEW.md), and what each finding became: fixed, or why not. -->

## How to revert

<!-- Usually: revert the merge and `npm run deploy`. Say if a migration, a setting or a state row also needs undoing. -->
