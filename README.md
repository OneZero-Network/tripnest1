# Fixes in this zip

## 1. Keyboard covering the field being typed in — screens/CreateTripScreen.js
Replaced the fragile fix from last round (onFocus + a guessed 120ms timeout on two
specific fields, then always scrolling to the very END of the form) with React Native's
own purpose-built API for this: `scrollResponderScrollNativeHandleToKeyboard` — the same
mechanism `KeyboardAvoidingView` uses internally. Attached to **all 5** text inputs on
the screen (Trip Name, both currency-exchange fields, traveler name, every contribution
amount), not just two. Critically, this scrolls just enough to reveal the SPECIFIC field
that was focused, wherever it is — the old approach's blind "always scroll to the end"
would have made things worse for a field near the top (Trip Name) by scrolling it out of
view the instant it was focused.

## 2. Wrong currency symbol on foreign-currency amounts — components/ExpensesTab.js, TimelineTab.js, ActivityItemSheet.js
**Confirmed real bug, not vague.** Your Dubai screenshot showed "₹25.00 USD" — a rupee
symbol directly next to a dollar-denominated amount. Root cause: all three of these
files used the trip's *base* currency symbol unconditionally for every row, even when
that row's actual `currency` field was different (e.g. a Trip-Bank-funded USD expense on
an INR-base trip). Fixed to use `currencySymbol(item.currency || baseCurrency)` — the
row's own currency — instead of always the trip's base currency.

## 3. Trip Bank showing two different numbers on two different tabs — components/TravelersTab.js
**Also confirmed and fixed — this was the real substance of "vague/incorrect logic."**
Your screenshots show Overview reporting "Cash left: ₹347" while the Members tab's
"TRIP BANK" card showed ₹2227, for the *same trip at the same time*. Root cause: the
Members tab was displaying `finance.totalReceived` (the lifetime total ever
contributed — 2227) under a label that means "current balance," while Overview
correctly showed `finance.currentCash` (347 — what's actually left after spend and
currency exchange). Same underlying data, wrong field picked. Fixed to use
`finance.currentCash`, matching Overview and every other screen.

(The "Spent USD 0" wallet figure in an earlier screenshot, despite two USD expenses
existing a minute later, wasn't a bug — those screenshots were roughly a minute apart;
the expenses were added after that particular screenshot was taken.)

## 4. Overview cards not clickable — screens/HomeScreen.js + db.js
Trip count / People / Spend-per-currency cards now route to the Trips list (there's no
more specific destination for those three, so "show me the trips" is the honest
answer). The "Biggest trip so far" card now opens that exact trip directly — added
`id` to `topTrip` in `getLifetimeInsights()` (db.js) so it has something real to
navigate to. `test/insights.test.js` updated to check the id is present.

## 5. Gmail/Drive sync status — no code change, direct answer
Checked `googleBackup.js`: this is real, working code (OAuth sign-in flow, backup-to-
Drive, restore-from-Drive), not a stub. It is **not yet functional** because it needs a
real Google Cloud OAuth client ID — `GOOGLE_CLIENT_ID` is currently the literal
placeholder `'REPLACE_WITH_YOUR_GOOGLE_CLOUD_OAUTH_CLIENT_ID'`. That requires registering
an OAuth client in Google Cloud Console (with the Drive API enabled) under your own
Google account/project — something only you can do, not something fixable in code. Once
you have that client ID, it's a one-line swap and the feature should work as built.

Full suite: 74/74 passing. All touched files verified with a real JSX-aware parser.
