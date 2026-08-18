# Features in this zip

## 2. Shareable settlement summary — components/SettlementTab.js, screens/TripScreen.js
New share icon in the Settlement screen's header, next to the existing "how this
works" info icon. Builds a plain-text, WhatsApp-ready summary from whatever's
*currently* outstanding on screen (same `toRefund`/`toPay` data the screen itself
renders — never a stale or separately-computed number) and opens the native share
sheet via React Native's `Share` API. Uses the same "Receive money / Pay these people"
framing as the rest of this screen, not the underlying Trip Bank/personal split —
someone reading it in a WhatsApp chat shouldn't need to understand the accounting
model. `TripScreen.js` now passes `tripName` down so the summary can be headed with
the actual trip name.

## 5. Search/filter within a trip's expenses — components/ExpensesTab.js
Added a search box (matches description, category, or payer name) and category filter
chips, entirely client-side against the expense list already in memory — no new
queries. The "Total spent" header switches to "Matching" and reflects the filtered
total when a filter is active, so it never shows a number that doesn't match what's
listed below it. Empty state added for "filter matched nothing," distinct from "this
trip has no expenses at all."

## 6. Budget/limit warnings per category — db.js, components/ExpensesTab.js
- **db.js**: new `category_budgets` table (per-trip, per-category — a Food budget on
  one trip has nothing to do with another). `setCategoryBudget()` (amount ≤ 0 clears
  the budget rather than storing a meaningless zero), `getCategoryBudgets()`, and
  `getCategoryBudgetStatus()` — joins budgets against actual category spend
  (`amount * fx_rate`, same conversion every other total in the app uses) into one
  ready-to-render list with `spent`/`budget`/`remaining`/`isOver` per category.
- **ExpensesTab.js**: a target-icon next to the total opens a themed sheet (reusing the
  existing `BottomSheet` component) to set a limit per category — also reachable from
  the empty state, so a budget can be set before the first expense exists. Categories
  currently over budget get a ⚠️ on their filter chip and a warning banner naming them.
- 8 new tests in `test/budgets.test.js`: persistence, update-not-duplicate, clearing via
  0, under/over-budget status, categories with spend but no budget, budgeted categories
  with zero spend yet, and per-trip isolation.

Full suite: 82/82 passing (was 74; +8 for budgets). Whole-repo syntax check: 28/28
files clean with a real JSX-aware parser.
