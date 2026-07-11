World Cup v39.0 - Curated Highlights Quality Upgrade (v3)

This package supersedes the previous highlight-quality generator package.

Replace these exact files:
- scripts/generate-ai-posts.mjs
- .github/workflows/generate-ai-posts.yml

What changed
------------
1. One final highlight per match.
   Different wording about the same match/event is treated as a duplicate.

2. Compact format kept.
   Target length: 28-54 words, two or three sentences.
   The previous contradictory 60-word / 90-word prompt has been removed.

3. Stronger curation after AI generation.
   The code now selects the best rows after generation; quality no longer relies only on the model following the prompt.

4. Better stage balance.
   - Group-stage highlights: maximum 10
   - Participant spotlights: maximum 6
   - Stage summaries: maximum 2
   - Recent knockout stages are scored above older stages

5. No forced post for every participant.
   Every participant still gets an updated final_profile message.
   Highlights contain only the strongest participant stories.

6. Language QA.
   Rejects or repairs:
   - broken decimal percentages such as 55. 9%
   - incomplete sentences such as "بينما غادر 87"
   - "أهداف بالملّي" / "إصابات بالملّي"
   - obvious mixed-gender collective-pronoun mistakes
   - premature "finished/champion" wording before the tournament ends
   - excessive reuse of قراءة هادئة / الزحمة / الضجيج / الثبات / التوقع المريح

7. More concrete titles.
   Match-based highlights are forced to identify the two teams.

8. Better visual variety.
   Icons are derived from the story category instead of defaulting almost everything to ✨.

9. Profile wording remains live.
   Before the final it says "current leader/current position".
   Final champion language is used only after all 104 matches are complete.

Workflow settings
-----------------
- Paid model: qwen/qwen3.6-plus
- Fallback models: disabled
- Public target: 38 highlights
- Maximum requested: 40
- Calculated top-up target: 38
- Automatic final-six behavior and post-tournament cutoff remain unchanged.

Apply
-----
git add scripts/generate-ai-posts.mjs .github/workflows/generate-ai-posts.yml
git commit -m "Curate highlights and improve Arabic quality"
git push origin main

Run GitHub Actions -> Generate Final Highlights AI from main with:
- allow_preview_generation: true
- publish_visible: true
- max_highlights: 40
- reset_existing: true

Confirm in the log:
- aiModel = qwen/qwen3.6-plus
- publicHighlightTarget = 38
- groupStageHighlightMax = 10
- participantHighlightMax = 6
- stageSummaryMax = 2
- "Highlight curation summary" appears
- "Validated final AI rows" appears before "Cleared existing final AI rows"

The exact final count may be below 38 when fewer than 38 genuinely strong, unique stories pass all rules. That is intentional.
