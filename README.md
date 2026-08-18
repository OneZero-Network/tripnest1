# Fixes in this zip

## 1. Auto-scroll on Create Trip — screens/CreateTripScreen.js
Last round's `scrollToEnd()` fix didn't actually work because the "Create Trip" button
lived **outside** the ScrollView, as a fixed footer sibling — no amount of scrolling the
ScrollView could ever reveal it. Moved the button to be the last item *inside* the
ScrollView instead. This is the real fix: scrolling (auto or manual) now always reaches
the button, on every device/keyboard-height combination, rather than depending on the
KeyboardAvoidingView's shrink math working out exactly right. The `onFocus`
auto-scroll-to-end from last round is unchanged and now actually has something
meaningful to scroll to.

## 2. Lifetime insight cards on Overview — db.js + screens/HomeScreen.js
Added `getLifetimeInsights()` in `db.js`: counts every trip ever created (any status),
unique travelers tracked across all of them, and total spend **grouped by each trip's
own currency** — a ₹ trip and a $ trip are never summed into one meaningless number.
Also surfaces the single highest-spend trip as a "biggest trip so far" card.

On the Overview screen, this renders as a row of stat cards (trip count, people, spend
per currency) plus a "biggest trip" card, shown once there's at least one trip — the
empty state (screenshot 2) is untouched, since there's nothing to summarize yet.

3 new tests in `test/insights.test.js` (its own file, since these need exact trip
counts — tests in the same file share one in-memory DB, only separate *files* get a
fresh one): empty state, multi-currency grouping with a repeated traveler, and a
zero-expense trip still being counted without affecting existing totals.

Full suite: 74/74 passing.
