World Cup v39.0.3 — strict highlight date sorting

Replace only:
app.js

Behavior:
- Match-based highlights are sorted by match kickoff time, newest first.
- General/participant highlights appear after match-based highlights.
- Existing editorial priority remains as the tie-breaker.
- Argentina vs Switzerland correctly appears above Norway vs England because it kicked off later.
- No workflow, AI, database, CSS, or version change is required.
