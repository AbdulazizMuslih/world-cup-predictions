# v39.4.0 Final Deployment and Post-End Checklist

## Before push

- [ ] Back up the current repository branch.
- [ ] Confirm the package name is `WORLD_CUP_V39.4.0_FINAL_SOURCE_OVERLAY.zip`.
- [ ] Replace files using the exact repository paths in the package.
- [ ] Keep the existing `assets/` directory.
- [ ] Confirm no active `39.3.0` cache references remain in `index.html`, `app.js` or `version.json`.

## Immediately after push

- [ ] Open `version.json` and confirm `39.4.0`.
- [ ] Hard-refresh once and confirm the update prompt no longer appears.
- [ ] Confirm the public login does not list Abdulaziz.
- [ ] Confirm admin-only Abdulaziz entry still works.
- [ ] Confirm official ranks remain unchanged.
- [ ] Confirm GitHub Actions still includes `Shutdown World Cup Automation`.

## Post-tournament Home

- [ ] Confirm the first tab becomes `الرئيسية` only after 104/104 completed matches.
- [ ] Confirm the status pill says `اكتمل كأس العالم`.
- [ ] Confirm the original v39.3 Home layout and backgrounds remain unchanged.
- [ ] Confirm titles and descriptions inside all four gold destination cards are dark and clearly readable.
- [ ] Confirm text inside `الترتيب النهائي` and `توقعاتي` shortcuts is dark and readable.
- [ ] Confirm all six Home links open the intended pages.
- [ ] Test at one desktop width and one mobile width with no horizontal scrolling.

## About and contact page

- [ ] Confirm the page renders vertically, not as several narrow columns.
- [ ] Confirm the titled sections appear in this order: site overview, contest overview, rules, contact.
- [ ] Confirm all eight rule cards are readable.
- [ ] Confirm `أخوكم: عبدالعزيز` appears.
- [ ] Confirm the WhatsApp group contact method appears.
- [ ] Confirm `aazizalamri2@gmail.com` is visible and opens a mail link.
- [ ] Test desktop, tablet and mobile widths.

## Final-data checks

- [ ] Confirm 104/104 matches are completed with valid scores.
- [ ] Confirm champion, runner-up and champion-prediction points.
- [ ] Confirm highlights, statistics, badges and `ختام المسابقة` load.
- [ ] Confirm PDF works from both profile and closing page.
- [ ] Run the final recap audit.
- [ ] Back up Supabase tables.
- [ ] Stop the external cron jobs.
- [ ] Confirm workflows are disabled after `2026-07-20T23:00:00Z`.

## Exact final-match completion order

- [ ] Push the updated `scripts/generate-ai-posts.mjs` before generating the final profiles.
- [ ] After the final whistle, wait until the official football feed marks the final as finished.
- [ ] Run `Sync World Cup - Active Match Correction` manually once for a controlled final update.
- [ ] Confirm the database shows 104 total completed matches with valid scores.
- [ ] Confirm the final winner, runner-up, official prediction points and champion-prediction points.
- [ ] Run `Fetch Final Event Notes Drafts` with:
  - `dry_run=false`
  - `fetch_football_data_notes=true`
  - `fetch_api_football_events=false`
  - `fetch_news_events=true`
  - `recent_completed_days=3`
  - `news_max_per_match=2`
  - `default_approved=false`
- [ ] Run `Generate Final Highlights AI` with:
  - `generation_mode=full`
  - `allow_preview_generation=false`
  - `publish_visible=true`
  - `max_highlights=40`
  - `reset_existing=true`
- [ ] Run `Audit Final Recap Data`.
- [ ] Open the website in a fresh session and confirm Home, final leaderboard, highlights, profile messages, statistics, badges, closing page and both PDF buttons.
- [ ] Verify Abdulaziz remains outside the official table and that `عرض عبدالعزيز` remains temporary.
- [ ] Back up Supabase, stop the external cron, and let the shutdown workflow disable the World Cup workflows after the cutoff.

