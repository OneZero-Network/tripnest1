# TripNest — QA Review Response

Root cause + fix for each numbered item, then the requirement status table.

## 1. Goa — member/expense data inconsistency

**Root cause:** a race condition in `TripScreen.js`'s `loadAll()`, not stale UI state.
Switching trips quickly (Dubai → Goa) can leave two `loadAll()` calls in flight — one
started for Dubai, one for Goa. Nothing checked which one was still relevant, so if the
Dubai response happened to resolve *after* the Goa response, it silently overwrote the
correct Goa traveler list with Dubai's (`Ayaz, Tariq`) — exactly the symptom reported.

**Fix:** `loadAll()` now records the trip it was called for in a ref, and after the
async reads come back, checks whether a *newer* call has started since. If so, it
discards its own result instead of writing it into state. (`screens/TripScreen.js`)

**Also fixed at the data layer, not just the UI (per item 8):** `addExpense` and
`updateExpense` in `db.js` now check `paidBy` and every `participants` entry against
that trip's actual `travelers` table and **reject** the write if anyone isn't a real
member — regardless of what the UI sends. This means even if a future UI bug reintroduces
stale member data, it can no longer reach the database. Covered by 5 new tests
(`test/split.test.js`), including one that reproduces the exact reported shape: a
traveler who's real (Tariq, member of Dubai) but not a member of the trip being edited
(Goa) is rejected.

## 2. Dubai — settlement does not clear correctly

**Root cause found and confirmed:** in `SettlementTab.js`, `confirmSettleAll()` (the
handler behind "Mark all as settled") only looped over `toPay` — it never touched
`toRefund`. So tapping the button correctly recorded every person-to-person and top-up
payment, but silently left every Trip Bank *refund* (money owed back to a traveler —
"Receive money") completely unrecorded. That's exactly the contradiction reported:
"Everyone is settled" under Pay These People (true — that list really was empty) while
Receive Money kept showing $643 / $95 forever, because nothing had ever actually marked
those refunds as paid.

**Fix:** the loop now processes `[...toRefund, ...toPay]`. Both kinds already used the
correct underlying function (`recordBankSettlementLeg`, which nets a signed contribution
row so the bank balance actually reaches zero, not `recordSettlement`) — the bug was
purely that refunds were never included in the "all" loop at all.

**Trace confirmed against the flow you asked for:**
Outstanding settlement → tap "Mark as settled" → `settleOne()` picks
`recordBankSettlementLeg` for any leg touching the bank, `recordSettlement` for
person-to-person → a real contribution/settlement row is written → next
`computeBankSettlement`/`computeSettlement` call reads that row and nets it out →
outstanding reaches 0 → Settlement UI re-renders from that number → Dashboard/
Notifications derive from the same computation (see item 6/single-source-of-truth,
unchanged and still correct). The break was specifically in "which legs get recorded,"
not in the recompute or the UI layer downstream of it — confirmed by a new test that
reproduces the bug with only `toPay` recorded (refund stays stuck) and a companion test
that proves recording both actually zeroes the balance (`test/settlement.test.js`).

**Not fixed by hiding amounts** — the underlying `contributions` rows are what change;
the UI is just reading real numbers.

## 3. Settlement terminology

Added a one-line clarifier under "Receive money" when there's something outstanding:
*"Still sitting in the shared pool, owed back to them — not yet paid out."* This
directly answers "is this already settled or not" without requiring the user to
understand Trip Bank vs. personal accounting — which was the actual confusion, now that
item 2 no longer makes the screen self-contradictory in the first place. A fuller
terminology/mental-model pass (item 7) is scoped separately below since it's a larger
design decision, not a bug fix.

## 4. Delete Trip — model defined

Trip lifecycle now has three distinct, deliberate states:

| Action | Reversible? | What happens to financial records |
|---|---|---|
| **Close / Finish Trip** (existing `closeTrip`/`reopenTrip`) | Yes — Reopen brings it back exactly as it was | Nothing is touched. Trip just leaves the Active list. |
| **Delete Trip** (`deleteTrip`, added last session) | **No** | Everything is permanently removed: expenses, splits, contributions, exchanges, settlements, notes, documents, itinerary items (+ their scheduled notifications), and the full activity/audit history. |

There is no separate "Archive" state — Close already serves that purpose (out of Active,
fully viewable, nothing lost, reversible), so a third state would duplicate it without
adding anything. Delete requires an explicit destructive `ConfirmDialog` naming the trip
and listing what's being removed, reachable via trip name → **Danger zone → Delete
trip**, and is `protected against accidental taps` — no single-tap path exists to it.

**Not yet done:** an "Archive" concept if the product ever wants "hide from list but
don't allow Reopen" as a distinct third state — flagging this as a real open design
question rather than assuming Close already covers every case someone might mean by
"archive."

## 5. Requirement status

| Requirement | Status | Evidence |
|---|---|---|
| Equal expense split | **Done** | `resolveSplit()`, UI in Add Expense + Edit Expense, 3 unit + integration tests |
| Custom amount split | **Done** | Same, validated (rejects non-reconciling totals), tested |
| Percentage split | **Done** | Same, validated (rejects ≠100%), tested |
| Shares split | **Done** | Same, validated (rejects ≤0 total), tested |
| Edit expense with all split methods | **Done** | `ActivityItemSheet.js` edit form has the same method selector as creation, seeded from stored `input_value` so 40/30/30 redisplays as percentages not derived ₹ |
| Correct currency/exchange accounting | **Done** | `exchangedOutBase` reconciliation, edit-ripple-through, 9 tests incl. the ₹3000→$100 progression from the original audit |
| Settlement calculation | **Done** | Personal + bank engines, 2/3/10-member, mixed funding, final-closure mixed debtor/creditor matching — 13 tests |
| Settlement completion/clearing | **Fixed this round** | Item 2 above — was broken for bank refunds specifically, now covered by 2 regression tests |
| Settlement notifications | **Done** | Single source of truth confirmed — Dashboard/Notifications/Settlement all read the same `computeBankSettlement`/`computeSettlement`, closed trips excluded, 4 tests |
| Trip deletion | **Done** | `deleteTrip()` + UI, cascades every related table, 4 tests |
| Generalized Groups | **Not started** | Explicitly held per your own sequencing (item 9 of the prior memo) |
| Members can participate in group expenses | **N/A — pre-Groups** | Current model is Trip-scoped; "group expenses" as a concept doesn't exist until Generalized Groups does |
| Group-level expense summary | **Not started** | Same — depends on Generalized Groups |
| Individual contribution/balance summary | **Done (trip-scoped)** | Per-traveler paid/share/net breakdown exists (Overview + Advanced Breakdown); not yet generalized beyond a single trip |
| UPI/payment integration | **Not started** | Explicitly held, per prior sequencing |
| WhatsApp integration | **Not started** | Explicitly held, per prior sequencing |
| Automated finance tests | **Done** | 69 tests, `node --test`, real SQLite engine, no mocked SQL — split/currency/settlement/lifecycle/audit/member-isolation, see `FINANCE_TEST_REPORT_2026-08-13.md` |

Per your instruction, nothing above is marked "Done" on backend-only grounds — split
editing specifically was previously backend-only and is now marked Done only because the
UI path was verified to exist and use the same validated function.

## 6. Automated finance tests

69/69 passing (`node --test`, real `node:sqlite` engine). Added this round: 5 member-
isolation tests (rejecting non-member payer/participants on both create and edit,
including the exact cross-trip scenario reported) and 2 settlement tests that reproduce
the Dubai bug and prove the fix. Full breakdown remains in
`FINANCE_TEST_REPORT_2026-08-13.md`. Still not device-validated — that remains a
separate, un-closed gap.

## 7. Mental model / UX

Not attempted as a redesign this round — this is a real product decision (which concepts
the primary Settlement screen exposes vs. hides behind "Advanced breakdown") rather than
a bug, and deserves its own scoped pass with your input on the target mental model,
not a unilateral rewrite. The terminology fix in item 3 is a minimal, defensible step in
that direction without pre-empting the larger decision.

## 8. Non-member data-integrity verification

Directly addressed in item 1 above — this was the main finding of this round. The
`addExpense`/`updateExpense` validation in `db.js` is the actual verification you asked
for: it's not a UI-only check, it's the same function every save path goes through,
tested independently of any screen.
