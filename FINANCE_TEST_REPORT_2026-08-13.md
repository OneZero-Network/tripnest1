# Finance Test Suite — Report

Run with: `npm test` (`node --test`), against a real SQLite engine (Node's built-in
`node:sqlite`) via a test-only `expo-sqlite` stub — not a hand-rolled fake of SQL
semantics. `db.js` and `finance/calculator.js` run completely unmodified; only their
native-module dependencies (`expo-sqlite`, `expo-notifications`, `react-native`'s
`Platform`) are stubbed so they're importable outside Expo. This is the first time this
engine has actually been executed, as opposed to statically reasoned about.

## Finance Test Suite

Total tests: **58**
Passed: **58**
Failed: **0**

### Split
- Equal: 3 (unit) + 1 (integration, excluded-participant scenario) — pass
- Custom: 2 (unit, valid + invalid) + 2 (integration, valid + edit-without-updating-values rejected) — pass
- Percentage: 2 (unit, valid + invalid) + 2 (integration, create + amount-change rescale) — pass
- Shares: 2 (unit, valid + invalid) + 1 (integration) — pass
- Also covered: rounding/fractional amounts, one participant, no participants rejected — pass

### Currency
- Exchange (₹3,000 → $100, and the four spend-progression variants): 4 — pass
- Partial foreign spend ($40 of $100, $60 of $100): 2 — pass
- Full foreign spend ($100 of $100): 1 — pass
- Multiple exchanges / multiple currencies: 2 — pass
- Personal-funded vs. bank-funded foreign expense: 2 — pass
- Remaining wallet balance survives trip closure: 1 — pass
- Explicit "money never double-counted" invariant asserted in every case above (`currentCash` and every foreign wallet's `remaining` checked non-negative and non-overlapping)

### Settlement
- Personal (person↔person): 6 — 2, 3, and 10-member cases, different participants per expense, partial and complete settlement — pass
- Trip Bank (person↔pool): 3 — equal contributions, unequal contributions, mixed personal+bank — pass
- Final bank settlement at closure (mixed debtors/creditors, custodian-routed surplus): 2 — pass (previously flagged gap, now closed)
- Lifecycle interaction (reopened, closed): 2 — pass

### Lifecycle
- Solo: 3 (with expenses, no expenses, with shared cash) — pass
- Group: 5 (full create→close flow, no-expense trip, contribution-only trip, blocked-then-forced close, new expense after settlement) — pass
- Notification/dashboard single source of truth: 4 (closed trip excluded from feed, excluded from dashboard count, zero pending after full settlement, reopened trip becomes eligible again) — pass

### Audit trail
- Contributions (edit logs old→new, history snapshot preserved): 2 — pass
- Currency exchange (edit logs old→new for both currencies, history snapshot preserved, AND correctly ripples through `computeFinance` — currentCash/exchangedOutBase/wallet figures update to the new values, not stuck on stale ones): 3 — pass (reconciliation ripple-through was a previously flagged gap, now closed)
- Expenses (regression coverage — per-field logging, participant removal reflected in `expense_splits`): 2 — pass

## Failures

None.

## What this suite does NOT cover (explicit gaps, not silently assumed passing)

- **No device/emulator run.** These are Node-process tests against real SQLite, not the
  actual Expo/React Native app. UI screens (`UniversalCapture.js`, `SettlementTab.js`,
  the expense edit form in `ActivityItemSheet.js`) are untested — the split-method UI
  (creation and, now, editing) has been syntax-checked with a real JSX-aware parser
  (`@babel/parser`) but not tapped through on a device or in a component test.
- **No concurrency/race tests** (e.g. two expenses written near-simultaneously, or a
  kill-mid-write scenario) — `PROJECT_STATUS.md` already flagged transactional writes as
  unverified under real interruption; this suite doesn't close that gap either.
- **No test for the `orphanedPayers` path** (an expense whose `paid_by` no longer matches
  any current traveler) — the code has explicit handling for it; untested here.

## Status classification (per the memo's request)

- Split methods (equal/custom/percentage/shares), including symmetrical create/edit:
  **Finance verified** — automated, passing, both creation and editing (percentage/shares
  edits redisplay original input values, not just derived ₹, per item 4 of the memo).
- Currency exchange / shared-cash reconciliation, **including edits**: **Finance
  verified** for every scenario in the memo's list, plus edit-time reconciliation.
- Settlement engine (personal + bank, 2/3/10 members, partial/complete, **and final
  closure settlement with mixed debtors/creditors**): **Finance verified** for the
  scenarios tested; minimum-transaction property checked with a loose upper bound
  (`≤ participants − 1`), not an exact optimality proof.
- Trip lifecycle (solo/group/closed/reopened, notification sync): **Finance verified**
  for the scenarios tested.
- Contribution/exchange audit trail: **Finance verified** — every editable field checked
  produces a timeline event with old→new values, not just "a history table exists."
- Everything above: still **not** device-validated, per Phase 1 of the sequence in your
  memo (automated tests → device validation are two separate steps).

## Running the suite

```
npm test
```

Runs via Node's built-in test runner (`node --test test/`) against a real SQLite engine
(`node:sqlite`, Node 22+). No install step is required for the finance tests themselves —
`node_modules/expo-sqlite`, `node_modules/expo-notifications`, and
`node_modules/react-native` in this repo are deliberate test-only stubs (a few lines each,
see their source) that let `db.js` run outside Expo. **Do not `npm install` in this
directory** — that pulls the real Expo/RN dependency tree and overwrites these stubs,
which breaks the test suite (it happened once during this work; the fix was deleting
`node_modules` and re-writing the three stub files). If real app dependencies are ever
needed for a device build, install them in a separate checkout, not this one.
