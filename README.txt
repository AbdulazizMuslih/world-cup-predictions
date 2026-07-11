World Cup v39.0.1 — live-highlight and UI hotfix

Replace/add:
- app.js
- style.css
- index.html
- version.json
- scripts/generate-ai-posts.mjs
- scripts/fetch-final-event-notes.mjs
- scripts/audit-final-recap-data.mjs
- .github/workflows/generate-ai-posts.yml
- .github/workflows/fetch-final-event-notes.yml

Run remove-noncompleted-highlights.sql immediately in Supabase SQL Editor.

Root cause fixed:
- A live match can have interim score values.
- Old code treated any match with two score values as completed.
- New code requires status=completed AND both score values.

Defense in depth:
1. Generator facts include only confirmed completed matches.
2. Event-note fetch ignores live/scheduled matches.
3. Existing notes linked to non-completed matches are ignored by AI.
4. Pre-publish assertion blocks any highlight whose source_match_id is not completed.
5. Frontend hides any stored match highlight whose match is not confirmed completed.

UI:
- Two highlight cards per row on desktop/tablet.
- One card per row at 760px and below.
- More readable title/body sizes and compact stage pill.

After pushing, manually rerun Generate Final Highlights AI with:
- allow_preview_generation: true
- publish_visible: true
- max_highlights: 40
- reset_existing: true

The corrected run should report 98 completed matches while Norway–England is still live, then 99 only after status becomes completed.
