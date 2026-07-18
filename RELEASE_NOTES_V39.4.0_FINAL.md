# v39.4.0 FINAL — Release Notes

This release is rebuilt directly from the confirmed v39.3.0 final source files. The rejected earlier v39.4.0 attempt was not used as a base.

## Changes

- Corrected the post-tournament status from `اكتملت كأس العالم` to `اكتمل كأس العالم`.
- Kept the original v39.3.0 post-tournament Home design and gold destination cards.
- Fixed the low-contrast Home card copy by changing only the text inside the gold cards to dark navy, including titles, descriptions and arrows.
- Rebuilt `عن المسابقة والتواصل` as a stable vertical page with full-width titled sections:
  - `ما هو هذا الموقع؟`
  - `نظرة عامة على المسابقة`
  - `قواعد المسابقة`
  - `للتواصل أو الاقتراحات`
- Added the organizer and contact details:
  - `أخوكم: عبدالعزيز`
  - WhatsApp group
  - `aazizalamri2@gmail.com`
- Added explicit desktop, tablet and mobile grid rules so About sections cannot collapse into narrow columns.
- Updated frontend cache references and `version.json` to `39.4.0`.

## Preserved without functional changes

- Official scoring and tie-breaking.
- Champion prediction scoring.
- Abdulaziz isolated observer account and data separation.
- Final recap, highlights, statistics, badges and journey-book PDFs.
- Result sync, AI generation and audit scripts.
- Workflow cutoff and automatic shutdown behavior.

## Deployment note

This ZIP is a source replacement overlay. Keep the repository's existing `assets/` directory.
