# WORLD CUP 2026 PREDICTION CONTEST — FINAL PROJECT HANDOVER

**Final release:** v39.4.0 FINAL  
**Prepared:** 18 July 2026  
**Interface:** Arabic, RTL  
**Implementation:** Static HTML/CSS/JavaScript + Supabase + GitHub Actions  
**Source of truth:** The files inside this v39.4.0 final resource pack.

---

## 1. Source-of-truth rule

Use this handover and the v39.4.0 files as the source of truth. This release was rebuilt directly from the confirmed v39.3.0 package after rejecting the first incorrect v39.4.0 attempt. Do not reuse that rejected attempt or start from older v38/v39 packages when they conflict with these files.

Suggested future-chat opening:

> Continue the World Cup 2026 prediction project from `WORLD_CUP_PROJECT_HANDOVER_V39.4.0_FINAL.md`. Treat the v39.4.0 files as the source of truth. Preserve official participant data, the isolated Abdulaziz observer account, scoring, the post-tournament Home, PDFs and automation shutdown unless I explicitly request a change.

---

## 2. Repository layout

### Frontend root

- `index.html` — Arabic RTL shell, login, dashboard, menu pages and versioned script loading.
- `app.js` — official participant logic, scoring, leaderboard, final recap, statistics, highlights, admin console and About-page rendering.
- `style.css` — complete visual system. The final v39.4.0 block is appended at the bottom and is intentionally scoped.
- `observer-mode.js` — isolated Abdulaziz account and post-tournament Home rendering.
- `participant-recap-pdf.js` — personal PDF journey-book rendering and export.
- `version.json` — mandatory update version: `39.4.0`.

### Scripts

- `scripts/sync-results.mjs`
- `scripts/fetch-final-event-notes.mjs`
- `scripts/generate-ai-posts.mjs`
- `scripts/import-final-event-notes.mjs`
- `scripts/audit-final-recap-data.mjs`

### GitHub Actions

- `.github/workflows/sync-worldcup-normal.yml`
- `.github/workflows/sync-worldcup-correction.yml`
- `.github/workflows/sync-worldcup-full-fixtures.yml`
- `.github/workflows/fetch-final-event-notes.yml`
- `.github/workflows/generate-ai-posts.yml`
- `.github/workflows/audit-final-recap-data.yml`
- `.github/workflows/worldcup-external-orchestrator.yml`
- `.github/workflows/shutdown-worldcup-automation.yml`

### Data helper

- `data/final-event-notes.template.json`

Keep the repository's existing `assets/` directory. It is referenced by the frontend and is not duplicated in this overlay.

---

## 3. Final scoring rules

- Correct result: **10 points**.
- Exact score in normal stages: **50 points**.
- Exact score in semifinals: **100 points**.
- Exact score in third-place match: **100 points**.
- Exact score in the final: **200 points**.
- Correct champion prediction: **50 points**.
- Runner-up champion prediction: **10 points**.
- Penalty shootouts use the football score before penalties; the shootout winner is stored separately.
- Prediction availability opens 72 hours before kickoff and closes at kickoff.

Scoring logic exists in both `app.js` and `scripts/sync-results.mjs`. Any future scoring change must update both.

---

## 4. Official participants and Abdulaziz

Official participants continue to use `participants`, `predictions` and `champion_predictions`.

Abdulaziz remains an isolated observer/fun account and must never be written through official participant tables.

Final observer behavior:

- absent from public participant login;
- available only from the admin dashboard;
- predictions and champion prediction use isolated RPCs/tables;
- profile and PDF use isolated prediction data;
- hidden from the official leaderboard by default;
- `عرض عبدالعزيز` temporarily shows a grey row without changing official ranks;
- leaving the leaderboard resets the temporary view.

The required observer SQL/runtime patches were already applied to the current Supabase project and are not included for rerun.

---

## 5. Post-tournament Home

The final state opens only when at least 104 matches exist and all 104 are confirmed completed with valid scores.

At that point:

1. `المباريات المتاحة` becomes `الرئيسية`.
2. The post-tournament Home appears.
3. The status pill reads **`اكتمل كأس العالم`**.
4. Four numbered destinations remain:
   - `الأضواء`
   - `الإحصائيات والشارات`
   - `ختام المسابقة`
   - `ملفك وكتاب الرحلة`
5. Secondary shortcuts remain for `الترتيب النهائي` and `توقعاتي`.
6. The v39.3 layout, gold final-stage cards and cinematic dark/glass atmosphere are preserved.
7. v39.4.0 changes only the text within gold Home cards to dark navy for strong contrast and readability.
8. Desktop and mobile layouts have no horizontal overflow in the tested preview shells.

Before 104/104 completion, the normal matches experience remains unchanged and the closing page remains locked.

---

## 6. About and contact page

`عن المسابقة والتواصل` is now a structured About page while retaining the existing site atmosphere.

The renderer creates four full-width vertical sections:

1. **`ما هو هذا الموقع؟`** — short description of the private World Cup contest.
2. **`نظرة عامة على المسابقة`** — predictions, ranking, highlights/statistics and journey book.
3. **`قواعد المسابقة`** — eight readable rule cards covering scoring, champion prediction, timing, penalties and privacy.
4. **`للتواصل أو الاقتراحات`** — organizer and contact methods.

Contact content:

- `أخوكم: عبدالعزيز`
- WhatsApp group
- `aazizalamri2@gmail.com`

Critical layout rule: `#rulesSummary` is explicitly one full-width column. Internal grids handle desktop/tablet/mobile columns. This prevents the narrow multi-column failure from the rejected build.

---

## 7. Highlights, statistics, closing and PDFs

- Final highlights are stored in `ai_posts` under `final_highlights`.
- Only concluded matches should be referenced.
- Profile messages use `final_profile` for official participants.
- Statistics and badges are calculated from locked data, not AI.
- The PDF journey book is available after final data completion from profile and `ختام المسابقة`.
- Abdulaziz PDF analysis is built from isolated predictions without changing official tables.
- PDF libraries load from CDN only when the participant clicks the download button.

---

## 8. Automation shutdown

**Automatic cutoff:** `2026-07-20T23:00:00Z` — `2026-07-21 02:00` Saudi Arabia.

Two protection layers remain unchanged from v39.3.0:

1. recurring workflows have cutoff guards that stop football API, Supabase sync and AI work after the cutoff;
2. `shutdown-worldcup-automation.yml` attempts to disable all World Cup workflows at 23:05 UTC on 20 July using `actions: write`.

The external cron service must still be stopped manually.

---

## 9. Deployment

Replace files using the exact paths in this package. Do not rename them.

At minimum push:

- `index.html`
- `app.js`
- `style.css`
- `observer-mode.js`
- `participant-recap-pdf.js`
- `version.json`
- `scripts/`
- `.github/workflows/`
- `data/final-event-notes.template.json`

Do not delete `assets/`.

After pushing:

- confirm `version.json` returns `39.4.0`;
- hard-refresh once;
- verify the post-end Home status and card text contrast;
- verify About page structure and contact details;
- confirm observer isolation and official ranks;
- confirm GitHub still detects the shutdown workflow.

---

## 10. v39.4.0 implementation boundaries

This release intentionally avoids a global redesign.

Changed functional files:

- `index.html` — version/cache references only.
- `app.js` — app version and About renderer only.
- `observer-mode.js` — version comment and `اكتمل كأس العالم` text only.
- `participant-recap-pdf.js` — version comment only.
- `style.css` — one appended, scoped v39.4.0 block.
- `version.json` — version only.

Unchanged from v39.3.0:

- all scripts in `scripts/`;
- all workflows in `.github/workflows/`;
- data template;
- scoring, leaderboard, final recap, observer storage and PDF behavior.

---

## 11. QA completed for this package

- JavaScript syntax checks for all `.js` and `.mjs` files.
- JSON parsing for `version.json` and the event-note template.
- YAML parsing for all workflows.
- HTML parsing and required version-reference checks.
- CSS parsing and balanced-block checks.
- Exact source-diff review against v39.3.0.
- Browser rendering with the actual final CSS and generated markup at:
  - Home desktop: 1486 px wide;
  - About desktop: 1365 px wide;
  - Home mobile: 390 px wide;
  - About mobile: 390 px wide.
- Browser-computed assertions confirmed:
  - dark Home card title and description text;
  - gold Home card backgrounds preserved;
  - About outer container is one column;
  - About overview is four columns on desktop and one on 390 px mobile;
  - rule cards are two columns on desktop and one on mobile;
  - no horizontal page overflow in tested widths.

---

## 12. Known maintenance notes

- The admin password remains in frontend JavaScript and is not server-side secure authentication.
- Supabase RLS/functions remain essential because the browser contains the public anonymous key.
- `style.css` is append-oriented. Future fixes should be scoped under a new version block.
- End-state detection is strict: missing fixtures, scores or statuses prevent final Home/closing unlock.
- PDF export depends on browser support, CDN libraries and device memory.
- Workflow self-disabling may be blocked by repository policy, but cutoff guards still prevent external work.

---

## 13. Final release changes

### v39.4.0 FINAL

- Rebuilt from v39.3.0 rather than the rejected v39.4.0 attempt.
- Corrected `اكتملت كأس العالم` to `اكتمل كأس العالم`.
- Preserved the original post-tournament Home design.
- Corrected low-contrast text inside gold destination and shortcut cards.
- Rebuilt the About/contact page with stable full-width sections and responsive internal grids.
- Added Abdulaziz, WhatsApp group and email contact details.
- Updated frontend version/cache references to `39.4.0`.
- Preserved all scoring, data, observer, PDF and automation behavior.

---

## 14. File fingerprints

See `FILE_MANIFEST_SHA256.txt` in the package for the final SHA-256 fingerprints.
