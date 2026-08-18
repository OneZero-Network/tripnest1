# Fixes in this zip

## 1. Keyboard on Create Trip — screens/CreateTripScreen.js
Not the double-resize layout bug from last round (that fix is still in place and
correct) — this was a discoverability request: when the keyboard is open, nothing
indicates there's more form below it. Added auto-scroll-on-focus for the lower-down
fields (traveler name, each contribution amount) so the rest of the form and the Create
Trip button scroll into view automatically instead of the user having to guess they
should scroll manually.

## 2. Decimal precision — finance/calculator.js + components/UI.js + 5 display files
**Root cause confirmed and fixed.** `computeFinance()` had several raw floating-point
sums (`totalReceived`, `bankSpent`, `currentCash`, `exchangedOutBase`, foreign wallet
figures) with no rounding at all, unlike the rest of that file — that's exactly how
"₹0.00999999999999990905" reached your Settlement screen.
- `finance/calculator.js`: added a `round2()` helper, applied to every numeric field
  `computeFinance` returns.
- `components/UI.js`: added a `formatMoney()` display helper (always exactly 2 decimals).
- Applied `formatMoney()` everywhere money was rendered raw/unformatted:
  `SettlementTab.js`, `ExpensesTab.js`, `TimelineTab.js`, `TripBankSettingsSheet.js`,
  `ActivityItemSheet.js`. (A few spots elsewhere use `.toFixed(0)` deliberately for
  rounded headline numbers — left alone, that's an existing design choice, not this bug.)
- `test/exchange.test.js`: added 2 regression tests. Verified they actually catch the
  bug — temporarily reverted the `currentCash` fix, confirmed the new test failed with
  the exact symptom, then restored it. Full suite: 71/71 passing.

## 3. Expense edit not going through
**Investigated, could not find a new bug.** Re-traced the fix from two rounds ago (the
missing `id` on the event object built in `ExpensesTab.js`, which broke the detail
sheet's data-loading effect) and confirmed it is still correctly in place — checked
`ExpensesTab.js`, `ActivityItemSheet.js`'s effect logic, and `TimelineTab.js`'s event
construction, all structurally correct. No fix included in this zip for item 3 because
none was identified — if this is still reproducing on the latest build, the next step
is confirming exactly which screen/tab the tap originated from (Expenses tab vs.
Activity tab vs. elsewhere), since that's what will actually localize it.

## Suggestions (Group Management, WhatsApp/Payment integration)
No code changes — both already match the existing roadmap sequencing (finance engine
correctness first, these come later). Nothing actioned here.
