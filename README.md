# Fixes in this zip

## Recalculate calculation — components/TravelersTab.js
**Rigorously re-derived every number in your Thane screenshots by hand and confirmed
the math is correct.** Trip Bank −489 = 200+200 contributed − 889 bank spend. Gdh's
"Spent 1253" = 808 (personal Stay expense they paid) + 444.5 (their share of the 889 in
bank-funded spend). "Gets back 159.5" = −244.5 (Trip Bank side: contributed 200, owed
share 444.5) + 404 (Personal side: fronted the Stay expense, Adnan owes them half).
Everything reconciles exactly across Members, Settle, and Overview.

The actual problem was that "Net balance" quietly adds two genuinely separate
settlement mechanisms — Trip Bank (contribution vs. pool-spend share) and Personal
(who fronted a personal expense vs. who owes their share) — into one number with no
visible breakdown. That's why it read as "vague," even though it wasn't wrong. Fixed:
the expanded member card now shows "Trip Bank settlement" and "Personal settlement" as
their own lines, which sum to "Net balance" — so it's checkable, not just asserted.

## Item 1 — swipe between Home tabs — screens/HomeScreen.js
Added a `PanResponder`: right-to-left swipe moves forward through Overview → Trips →
Notifications → More (same order as the bottom nav icons); left-to-right moves back.
Overview/Trips are in-place content, so those two just flip state; Notifications/More
are separate pushed screens, so swiping into them navigates the same way tapping the
icon does. (Caught and fixed a real bug in my own first pass here: a `PanResponder`
built with `useRef(...)`'s initializer only runs once, so its callback would have kept
reading the `homeTab` value from the very first render forever, breaking a second
swipe. Fixed with a ref that's kept in sync every render.)

## Item 2 — keyboard covering fields
Re-verified: the fix from two rounds ago (`scrollFocusedIntoView` using React Native's
own `scrollResponderScrollNativeHandleToKeyboard`, wired to all 5 text inputs) is still
correctly in place in `CreateTripScreen.js`. No new root cause found this round.

## Item 3 — keyboard next/submit chaining — screens/CreateTripScreen.js
- Currency-exchange fields: pressing next on "amount given" now focuses "amount
  received" directly (added a ref + `returnKeyType="next"`).
- Per-traveler contribution fields: pressing next advances to the NEXT traveler's
  contribution field in order, via a refs map keyed by traveler name; the last one is
  `returnKeyType="done"`.
- Traveler name field: changed to `returnKeyType="next"` with `blurOnSubmit={false}` so
  adding several travelers in a row doesn't dismiss the keyboard between each one.

## Item 4 — FAB right → center — components/UniversalCapture.js
Removed `end: theme.space.lg` (pinned right), added `alignSelf: 'center'` — the
add-to-trip button is now horizontally centered at the bottom of the trip screen.

## Item 5 — Overview cards drill down further — screens/HomeScreen.js + db.js
- "Trips" card: clears any filter, shows the full list (unchanged behavior, now explicit).
- "Spent (currency)" cards: now actually filter the Trips list down to just that
  currency's trips, with a dismissible "‹currency› trips only" chip — a real filter,
  not a bigger list to scan.
- "People" card: `getLifetimeInsights()` (db.js) now also returns `travelerNames`; the
  card shows the actual names via an alert instead of routing to the same generic Trips
  list as everything else, since there's no dedicated cross-trip people screen to route
  to yet.

`test/insights.test.js` updated to check `travelerNames` is present and correctly
deduplicated/sorted.

Full suite: 74/74 passing. All touched files verified with a real JSX-aware parser
(whole-repo pass: 28/28 files clean).
