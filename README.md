# Fixes in this zip

## 1. Keyboard covering the Create Trip screen — screens/CreateTripScreen.js
Root cause was the opposite of the BottomSheet keyboard bug fixed last round.
`CreateTripScreen` is a regular full screen (not a Modal), so it genuinely inherits
`softwareKeyboardLayoutMode: resize` from `app.json` at the OS level. Its
`KeyboardAvoidingView` was *also* applying its own `'height'` resize on top of that —
shrinking available space by the keyboard's height twice, which pushed "Create Trip"
(and the traveler/contribution fields above it) down past the visible screen. Changed
`behavior` to `undefined` on Android (OS resize alone now handles it; iOS still uses
`'padding'`, since iOS has no OS-level equivalent) and added scroll content padding as a
safety margin.

## 2. No visible Delete Trip option — screens/TripScreen.js
Delete Trip was already implemented (added two rounds ago, under trip name → rename
sheet → Danger Zone) but had **zero visual affordance** — the only way to find it was to
tap the plain trip title text, with no icon, chevron, or hint that it was tappable for
this. Added a `⋮` (more-vertical) icon to the trip header, next to Share and Safe Mode,
that opens the same rename/delete sheet. Nothing about the delete logic itself changed —
this is purely a discoverability fix.

## 3. No way to finish a solo trip — components/SettlementTab.js
Confirmed exactly in your screenshot: the solo-trip branch of the Settlement screen
rendered only a "No settlement required" card with **no Finish Trip button at all** — the
button only existed in the multi-traveler branch. Added the same "Finish Trip" button
(and it already shares the existing confirmation dialog, so no duplication) to the
solo-trip card, gated on the trip still being active.

All three verified with a real JSX-aware parser (`@babel/parser`); the finance test
suite (69/69) is unaffected since these are UI-only changes.
