# TripNest — Product Status (Verified / Implemented / Vision)

Per the engineering principle adopted this phase:

- **Verified** — confirmed through code inspection, static analysis, or execution.
- **Implemented** — built, present in the code, but not yet behaviorally validated (no device/emulator run).
- **Vision** — planned, not yet implemented.

This document exists so status claims stay anchored to evidence rather than confidence. It should be updated at the point each item actually changes state, not batch-reviewed from memory later.

---

## Architecture & Data Layer

| Item | Status | Evidence |
|---|---|---|
| SQLite as local source of truth | **Verified** | Schema present, migrations run and tracked in `schema_migrations`, exercised by every feature above it |
| Timeline-based event history | **Verified** | `logTimelineEvent` is the single write path; grep-confirmed no feature bypasses it |
| Trip creation is transactional | **Verified** (structurally) | `db.withTransactionAsync` wraps trip+travelers+timeline insert; not yet exercised by a real kill-mid-write test, which is a **Implemented→Verified** step device QA should specifically include |
| Settlement / finance engine | **Implemented** | `computeSettlement`/`computeFinance` logic reviewed and internally consistent; never run against a real multi-traveler, multi-currency-scale dataset |
| Search | **Implemented** | `searchTrip` covers all 6 record types; not exercised against a large dataset |
| Organizer Drafts | **Implemented** | Full CRUD + conversion path exists; not used in a real multi-day capture-then-convert workflow |
| Timeline Replay (day/block grouping) | **Implemented** | `groupTimelineForReplay` logic present; nested-scroll bug found and fixed this phase, but visual correctness on-device unconfirmed |

## UI / Design System

| Item | Status | Evidence |
|---|---|---|
| Design tokens (color, type, spacing, motion, a11y) | **Verified** | Single `theme` object in `UI.js`; cross-checked that every screen imports from it |
| Shared component library (LedgerList/Row, ConfirmDialog, BottomSheet, ErrorState, StatHero, etc.) | **Verified** | Exports cross-checked against every import site — zero unresolved imports, zero dead exports remaining |
| No native `Alert.alert` remaining | **Verified** | Grep-confirmed zero call sites |
| No duplicate shadow/elevation rendering | **Verified** | `elevation` fully removed; only 2 deliberate FAB shadow exceptions remain, documented |
| Hairline ledger-list pattern across Expenses/Notes/Documents/Travelers/Timeline | **Verified** (structurally) | Consistent `LedgerList`/`LedgerRow` usage confirmed; **Implemented** in the sense that "does this actually look calm on a real screen" hasn't been human-eyeballed on a device |
| Accessibility labels on primary icon-only actions | **Implemented** | 8 highest-traffic targets fixed this phase; **not yet Verified** — no TalkBack pass has actually been run |
| Accessibility labels on every interactive element | **Vision** | Only the highest-traffic subset was covered; secondary controls (chip filters, list-row actions, dialog buttons) still lack labels |
| Dark mode | **Vision** | Explicitly out of scope per your last memo; no dark palette exists |
| RTL layout support | **Vision** | Deliberately deferred — no RTL language is a current requirement |

## Features

| Item | Status | Evidence |
|---|---|---|
| Create Trip (20-second onboarding) | **Implemented** | Name + travelers only, transactional write; never tapped through on a device |
| Trip Workspace / Smart Cockpit | **Implemented** | Contextual hero (morning/midday/evening/finished) logic reviewed; never seen rendering live at each time-of-day |
| Universal Capture | **Implemented** | Shares `BottomSheet` primitive; underlying add-expense/note/plan functions are the same ones the tabs use, so correctness is inherited, not independently verified |
| Safe Mode | **Implemented** | Pin/unpin + filtered view logic reviewed; the actual "can a panicked person find their passport in under 10 seconds" test is a usability question, not a code one — explicitly a QA-phase item |
| Fund custodian / settlement reconciliation | **Implemented** | `recordSettlement` nets against computed balances correctly in isolated logic review; never run through a real multi-person settle-up sequence |
| Active-trip bypass (Splash → Trip) | **Implemented** | Logic present and reviewed; depends on device behavior (cold start timing) that can't be confirmed without a device |
| OS App Shortcuts (long-press → Safe Mode) | **Implemented** | Wired correctly per `expo-quick-actions` API; **cannot be Verified without a native build**, which this environment cannot produce |
| Read-only Share / Export | **Implemented** | WebView preview + PDF export functions exist and are referenced correctly; PDF output has never actually been generated and opened |

## Explicitly Out of Scope (Vision)

- Event-driven / CQRS architecture rewrite — deferred pending evidence the current CRUD approach is actually a bottleneck
- Time-scheduled contextual cockpit float ("3pm on check-in day") — needs background scheduling infra not yet built
- AI / Receipt OCR, Voice capture, Organizer Inbox, Contributor workflows — original V1 scope-freeze list, untouched
- Tablet-optimized (not just tablet-safe) layouts

---

## What "Verified" Cannot Mean Yet

Every "Verified" tag above means *structurally* verified — code inspection, grep-level cross-checks, and static reasoning. None of it has run on a physical Android device, an emulator, or been touched by a real user. That distinction is the actual purpose of the QA phase, and this document should not be read as a substitute for it.
