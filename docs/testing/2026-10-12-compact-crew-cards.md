# Compact mobile Crew cards — verification

Date: 2026-10-12. Verified application source: `4969538b43940f886696315454d61a78f48ab0f1`, based on synchronized main `feb422172e1995eff322af52db73f8770d0a923b`.

## Result

Mobile cards group identity, rating and menu in the header, then activity and contact actions in a wrapping footer. Full contact values remain on desktop and in the existing profile detail. Unknown ratings keep accessible wording; a zero rating remains valid. Contact accessible names include the action, member name and displayed contact value.

## Automated checks

- 22 tests passed across CrewView, CrewDetailView, CrewDetailView shift workflows and crew presentation helpers.
- ESLint passed for both modified TSX files; `git diff --check` passed.
- Production web build passed. Existing bundle size, dynamic import and Browserslist notices remain.
- Independent specification review passed. Quality review's contact accessible-name finding was corrected and the reviewer confirmed no remaining important findings.

## Browser verification

Used local synthetic fixtures only; no people were saved, contacts called, emails sent or database records changed.

| Fixture at 390 px | Previous height | Compact height |
| --- | ---: | ---: |
| Ordinary name, two contacts | 245 px | 131 px |
| Long name and email, two contacts | 261 px | 145 px |
| No contacts, zero rating | 187 px | 119 px |

- 375, 390, 412, 768 and 1280 px: no horizontal document or card overflow, including unbroken long names/cities.
- Mobile contact labels measure 14 px and actions measure at least 44 px tall; profile and menu targets are also at least 44 px.
- A 20 px root font at 375 and 390 px wraps the footer and text without horizontal overflow; contact actions grow to 55 px.
- Light and dark themes visually inspected. Desktop retains full contact text in its original columns and hides the mobile unknown-rating dash.
- Searching by an email hidden in the mobile card finds the correct person. Opening the name loads the expected profile with real contact destinations.

## Main integration and installations

Pending final main integration, synchronized push, simulator/phone refresh and native input-focus inspection. These are required before completion.
