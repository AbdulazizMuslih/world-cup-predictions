World Cup v39.0 — quality-first highlight generation fix

This package supersedes the previous 9/10 highlight package.

Replace:
- scripts/generate-ai-posts.mjs
- .github/workflows/generate-ai-posts.yml

Why the previous run failed:
- The paid model produced good candidates.
- The curation layer kept only 19.
- The calculated top-up revisited the same matches and was removed again.
- Nothing was deleted or inserted.

What this package changes:
1. The paid Qwen model is asked for one post per already-ranked high-signal story seed.
2. Story seeds are not random matches. They must have at least one strong contest signal:
   - trusted event note;
   - knockout significance;
   - exact-score hit;
   - high points awarded;
   - very difficult match for the group;
   - popular prediction trap;
   - unique correct reader.
3. Calculated fallback is limited to four posts maximum and uses the same high-signal filter.
4. One post per match remains enforced.
5. Same event-note/source duplicate protection remains enforced.
6. Compact Arabic length, stage caps, participant caps, and malformed-language rejection remain.
7. Target is 32 strong posts; minimum safe publish count is 24.
8. Profiles still refresh automatically during the final-six window.
9. Paid model remains qwen/qwen3.6-plus with fallback models disabled.
10. The twice-hourly automatic schedule and post-tournament cutoff remain unchanged.

After pushing to main, run the workflow manually with:
- allow_preview_generation: true
- publish_visible: true
- max_highlights: 40
- reset_existing: true

Expected log:
- aiBatchHighlightTarget: 6
- publicHighlightTarget: 32
- styleFamilyMax: 3
- maxCalculatedTopUp: 4
- at least 24 curated final_highlights
- validation before clearing existing rows
