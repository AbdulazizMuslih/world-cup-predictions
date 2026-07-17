V39.2.9 RESPONSIVE LEADERBOARD FIX

- Keeps Abdulaziz hidden by default.
- The temporary grey row still appears only after pressing عرض عبدالعزيز.
- Fixes mobile overflow in the observer explanation card and grey leaderboard row.
- Uses fixed responsive table columns on mobile.
- Removes repeated micro-copy inside the grey row on mobile because the card above already explains it.
- No SQL changes.
- Official ranks, podium, statistics, profiles, and all participant tables remain unchanged.

V39.2.8 LEADERBOARD BEHAVIOR

- Abdulaziz is always hidden when the leaderboard is opened.
- Clicking عرض عبدالعزيز shows a grey comparison row in points order.
- The preview exists only while the user remains on the leaderboard.
- Navigating to another page resets it; returning shows the official leaderboard only.
- The official podium, ranks, leader card, statistics, participant tables, and prediction tables are never changed.
- No additional SQL is required for this UI update.

World Cup Predictions — v39.2.7

This package keeps Abdulaziz completely isolated from official participant data while making his dashboard look and behave like a normal participant dashboard.

Changes:
- Removed the special "كل المباريات" workbench from Abdulaziz.
- The available-matches page now uses the same participant layout and availability rules.
- Any prediction saved from Abdulaziz still goes only through observer RPC functions.
- My Predictions and Profile use normal participant wording and visual treatment.
- The optional grey leaderboard row remains isolated and unchanged.
- Admin-only entry as Abdulaziz remains available.

Database import:
Run abdulaziz-observer-predictions-v39.2.7.sql once. It replaces only Abdulaziz rows in public.observer_predictions and does not touch public.participants, public.predictions, or public.champion_predictions.

Deploy these replacement files:
- index.html
- app.js
- style.css
- observer-mode.js
- participant-recap-pdf.js
- version.json
