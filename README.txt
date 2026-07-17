V39.2.4 — Premium Admin Command Center

This release builds on V39.2.3 and includes all participant-side champion prediction history changes.

Participant side
- Champion prediction remains inside توقعاتي between the quarterfinal and semifinal sections.
- Final-only champion card remains available after the World Cup final is concluded.
- Mobile champion history layout remains compact and readable.

Admin side
- New dark premium admin theme, isolated from participant pages.
- Admin now opens directly on a dedicated control center.
- Tournament overview: completed matches, remaining matches, predictions, participants, delayed results, champion prediction coverage, and PDF readiness.
- Tournament progress panel and upcoming match panel.
- Participant Explorer with previous/next controls and participant selector.
- Participant profile preview: rank, points, predictions, exact scores, accuracy, streak, best stage, badges, profile note, champion prediction, and journey-book availability.
- Quick actions from participant profile to open prediction history or edit a prediction.
- Champion prediction overview grouped by selected team, including participant names and current status.
- Participant Records page now includes champion prediction in its chronological position between quarterfinals and semifinals.
- Existing result entry and manual participant prediction controls remain available in the Operations Center.

Files
- index.html
- app.js
- style.css
- participant-recap-pdf.js
- version.json

No database migration is required. Existing admin write operations continue to use the current database/RPC setup.

Version: 39.2.4
