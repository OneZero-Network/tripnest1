# TripNest — Finance Engine Audit & Split-Method Build

## Summary

Audited the engine end-to-end against every P0 item in the memo (§1–§10). Most of the
ledger-correctness work described in §4–§8 was **already implemented and correctly
reasoned about in the existing code** — this pass verified it against the memo's
requirements rather than rebuilding it, and built the one concrete gap that was actually
missing: split methods beyond equal (§2).

## What was changed

- **New**: `resolveSplit()` in `finance/calculator.js` — the single place that turns
  "how the user wants to split an expense" into validated per-person amounts, for all
  four methods: equal, custom amount, percentage, shares.
- **New migrations**: `expenses.split_type`, `expense_splits.input_value` (stores the raw
  % or share number so an edit can redisplay the original input, not just the derived ₹).
- **Changed**: `addExpense()` / `updateExpense()` in `db.js` now validate the split via
  `resolveSplit()` *before* any row is written — a mismatched custom/percentage/shares
  split throws/returns an error instead of silently saving.
- **Changed**: `UniversalCapture.js` (expense entry) now has a split-method selector and
  per-person value inputs, with a running total shown against the required target.

## How currency exchange is reconciled (§5 — audit finding, not a new change)

Already correct: `computeFinance()` subtracts `exchangedOutBase` (base-currency amount
converted, regardless of whether the foreign cash has been spent yet) from `currentCash`,
so Trip Bank and Foreign Wallet are never simultaneously counted as available. This was
clearly a prior fix — the code comments explicitly describe the exact bug from §5 as
already closed. I did not find a case where it double-counts; recommend the memo's test
matrix (₹3000→$100, partial spend, multiple exchanges, multiple currencies) be run as
actual automated tests rather than only reasoned about, since none currently exist as
executable test files in the repo.

## How settlement balances are calculated (§4 — audit finding)

`computeSettlement` (person↔person, personal-funded expenses) and `computeBankSettlement`
(person↔Trip Bank, bank-funded expenses) are correctly separated, both use the same
greedy min-transaction matching algorithm, and both net out recorded `settlements` rows
before computing outstanding transfers. `computeFinalBankSettlement` correctly re-matches
Person↔Person at trip closure instead of leaving everything routed through an abstract
"Trip Bank" once there's no real custodian action left to take. No changes made here —
this already satisfies §4.

## How trip closure works (§6, §8 — audit finding)

`closeTrip()` re-checks outstanding balances itself (not just gating the button), and
`{ force: true }` is explicit opt-in for closing anyway. Solo trips (`travelers.length <=
1`) short-circuit both settlement computations to zero balances, and `SettlementTab.js`
surfaces "Finish Trip" the moment nothing is pending — this is the exact fix for the
"solo trip stays open forever" bug in §8. No changes made here.

## How pending notifications are derived (§7 — audit finding)

`getConsolidatedOverview()` and `getNotificationFeed()` both call the same
`computeBankSettlement` / `computeSettlement` used everywhere else, scoped to `WHERE
status = 'active'` trips only — so a closed trip cannot appear in "Needs Attention," and
there is one source of truth rather than a separately-tracked notification flag that
could drift. No changes made here.

## Automated test scenarios executed

None — this pass was static/code-level audit plus the split-method build, run through
`node --check` for syntax validity only. **This is a real gap**: the repo has no test
runner or test files for the finance engine at all. Recommend this be the next concrete
piece of work, since the memo explicitly asks for automated tests on the exchange/wallet
scenarios and none exist to run.

## Known limitations / not done in this pass

- **§1 Generalized Groups**: not started. The schema is still trip-shaped; extending it to
  non-trip group types (dinner, birthday, office outing) without breaking the existing
  finance engine is a real data-model change, not a UI relabel, and needs its own scoped
  pass.
- **§9 edit audit trail for exchanges/contributions**: exists for expenses
  (`expense_history` + per-field timeline events); confirmed contributions and exchanges
  have their own `_history` tables and `edited_at` columns, but I did not verify every
  editable field for those two produces its own timeline entry the way expense edits do.
- **§11/§12 UPI + WhatsApp**: correctly out of scope per the memo's own P2/P3 ordering —
  not touched.
- **Split-method UI**: only wired into `UniversalCapture.js` (the primary add-expense
  entry point). The expense **edit** screen was not updated to let someone change a
  percentage/shares split after creation via the UI (the `db.js` layer supports it via
  `updateExpense({ splitType, splitValues, ... })`; the screen just doesn't expose it yet).
- **No automated tests exist anywhere in the repo** for the finance engine, per above —
  the "internally consistent on inspection" status in `PROJECT_STATUS.md` still holds and
  hasn't been upgraded to actually-executed.
