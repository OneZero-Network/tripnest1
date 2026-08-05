# TripNest (V1 scaffold)

Offline-first trip logbook. Covers the full V1 "must complete" list:
Trip Creation, Traveler edit/remove, Expense Tracking (immutable), Note create/edit/delete,
Documents, complete Timeline (expenses + notes + documents + trip + traveler events),
Settlement (derived), Offline Storage, Local Export, Read-only Share Page.

Home screen is a dashboard-centric experience — a consolidated "active trips" summary
(spend today, pending settlements, active members) plus a per-trip hero card with cash
left and pending drafts. The Smart Cockpit context card (time-of-day aware) lives inside
each trip's Overview tab. The "lightweight launcher, no dashboard widgets" description
that used to be here was accurate for an earlier phase and is now stale — updating it as
part of the UX pass so this doesn't mislead the next reader.

## Get the APK
1. Push to GitHub.
2. Actions tab → `Build Android APK` runs on push to `main` (or trigger manually).
3. Download the `tripnest-apk` artifact → `app-debug.apk`.
4. Install on an Android phone (enable "install unknown apps").

## Run locally
```
npm install
npx expo start
```

## Edit/delete policy (consistent product-wide rule)
- **Immutable**: Expenses, Settlements, financial history — corrections go through
  reversing/adjustment entries later, never mutation.
- **Editable**: Travelers, Notes, Documents, Trip info — not financial records, freely
  editable. A traveler can't be removed once referenced by an expense (would corrupt
  settlement math) — the UI surfaces that reason if removal is blocked.

## Timeline
Every mutating action across the app writes one row into the shared `timeline` table:
trip creation, traveler rename/remove, expense add, note add/edit/delete,
document attach/remove. This was the biggest gap flagged in the last review and is
now the single source both the Timeline tab and any future "recent activity" view
would read from.

## Known gaps still open (flagged, not silently dropped)
- Settlement recomputes from the full expense list on every read — fine at small scale,
  flagged for revisit if it becomes noticeable with real trip data.
- No in-app document preview — opens via the native share/viewer sheet.
- Offline-restart data recovery and stress testing haven't been done — needs a real device pass.
- UI/UX audit intentionally not attempted here — needs hands-on testing on a built APK,
  not a description of the code.

## V2 — Smart Cockpit (in progress)

- **Schema**: added `segments` table (`trip_id, title, location, scheduled_at`) — the smallest
  extension needed to represent "planned for a specific time," which nothing in V1 could express.
  This is a real source-of-truth table, not a projection.
- **Today card**: collapsible header on the Trip screen (not the trip-list Home screen — see
  the design discussion for why). Shows today's scheduled segments, total spent, and last 3
  timeline events. Pure read projection: bounded queries only (today's date window, LIMIT 5 on
  activity), no full-table scans beyond what settlement already does.
- **Plan tab**: minimal add/remove UI for segments. This is the one place the Cockpit needed new
  organizer input — the card itself never asks for anything, matching "surface, don't collect."
- **Organizer Inbox**: intentionally not built yet. Scoped for V2 as organizer-owned staging only
  (drafts, reminders, unprocessed receipts) — no contributor attribution, no sync, no accounts.

## V2 — Domain naming, Finance, trip lifecycle

- **Renamed `segments` → `itinerary_items`** (domain-specific naming per feedback). Includes a
  safe migration (`ALTER TABLE ... ADD COLUMN`, caught if it already ran) so existing installs
  don't lose data.
- **Planning moved into a Modal** launched from the Today card, not a standalone tab — keeps
  navigation to 6 tabs instead of 7, planning stays attached to the cockpit it serves.
- **Finance tab** replaces Settlement, with 4 sections:
  - *Trip Fund*: contributions actually received. **"Expected" is not modeled** — flagged
    directly in the UI, not silently assumed, since it needs a target/split decision nobody's
    made yet.
  - *Current Cash*: received − spent, derived.
  - *Live Forecast*: always visible, same settlement algorithm as before.
  - *Final Settlement*: identical computation, gated behind trip `status = 'closed'`. Deliberately
    NOT a second algorithm — Live Forecast and Final Settlement call the exact same function, so
    they can't drift out of sync with each other. Closing a trip is reversible (Reopen Trip).
- New `contributions` table and `trips.status` column — both real schema additions, not just
  renames, flagged as such before building.

## V2 — Trip Fund target
Equal-split only, per organizer decision: Target = Contribution Per Person × current traveler
count. The multiplier is `travelers.length` at read time, not a stored total — so the target
self-corrects if travelers are added or removed, no stale number to notice and fix manually.

## V3 — Search Everywhere (priority #1, built)
Full-screen search reachable via a 🔍 icon in the Trip header — not a 7th tab, consistent with
keeping bottom navigation at 6. Searches travelers, expenses, notes, documents, timeline, and
contributions with bounded `LIKE` queries scoped to the current trip. No schema change, no new
source of truth — pure read.

## Known limitation (documented, not fixed): Trip Fund target vs traveler removal
If a traveler contributes and is later removed, their contribution stays in `totalReceived` but
they drop out of `travelerCount`, so the fund target can shrink while received stays fixed —
this can misleadingly show "over-funded." Per product decision, staying as-is for now; the fix
(contributors with financial history become permanent, non-removable, once Finance is redesigned
more comprehensively) is intentionally deferred, not forgotten.

## Not yet built (queued behind Search, per V3 priority order)
Better Exports, Rich Timeline Replay, Organizer Drafts, AI Assistance (each AI capability needs
its own proposal per the AI Philosophy: optional assistant only, never a dependency, always has
an offline/no-AI fallback). Operations Hub (for Parking/Emergency/Vault/Checklists/Vehicle/etc.)
also not built — it's a navigation container with nothing inside it yet, since none of those
V2-scoped-out features exist.

## V3 — Better Exports (Complete Trip Record, built)
Export/Share Page now include: Trip Summary, Travelers, Expenses, Finance (received/spent/cash +
fund target if set), Live Forecast or Final Settlement (whichever applies), Notes, Documents
Index (names + dates — files aren't embedded in the PDF, that's a different mechanism if wanted
later), Timeline. Still one function (`buildTripHTML`) feeding both Export and the Share Page,
so they can't drift apart. No schema change — broader read coverage only, per the
one-capability-per-change principle.

## V3 — Timeline Replay (built)
- Added `type` column to the existing `timeline` table (migration-safe), written by each
  function at the point it inserts — never inferred later from string content, per your
  instruction. Existing rows before this change default to `'trip'` since their real type
  can't be reliably recovered.
- Presentation layer only, no new table: `groupTimelineForReplay()` in `db.js` is a pure
  function over already-fetched rows — groups by calendar day, then clusters events within a
  15-minute window into a single "activity block" (matches your Day 2 / 10:30 AM example).
  Zero added query cost — same fetch as before, grouping happens client-side on an
  already-small result set.
- Filter chips (All / Expenses / Notes / Documents / Trip Events) — flagged as a second
  capability riding in the same pass as the presentation change, per the one-capability
  principle, but built since you asked for it explicitly in this round.
- No animations, no photos/media — kept to your "readability, not visual richness" instruction.

## Tech debt cleanup — logTimelineEvent()
All 13 raw `INSERT INTO timeline` call sites (across `db.js`, `tripExport.js`, `HomeScreen.js`)
now go through one function: `logTimelineEvent({ tripId, type, title, metadata, timestamp })`.
Verified with `grep -rn "INSERT INTO timeline"` that exactly one raw insert remains — the one
inside the helper itself. Also added a `metadata` column (nullable JSON) at the same time,
since it's the same schema-touch cost as adding a helper and Organizer Drafts will likely want
structured data on its own timeline entries. No current caller populates it yet.

## V3 — Organizer Drafts (built)
- New `drafts` table — genuine new source-of-truth, not a projection (only Drafts feature so
  far that needed one; Search/Replay/Better Exports were all reads over existing data).
- **No timeline event on draft creation.** Only `convertDraft()` writes to Timeline, through
  the same `logTimelineEvent()` path (and the same `addExpense`/`addNote`/`addItineraryItem`
  functions) everything else uses — no parallel/duplicate write logic for the converted record.
- Quick Capture lives in a header icon (📥), same pattern as Search — not a 7th tab.
- Aging buckets: Today / Yesterday / Older. Your requested "Older than 3 days" label isn't used
  verbatim — it would leave day 2-3 unlabeled, so the third bucket is honestly called "Older"
  instead of overclaiming an age it doesn't guarantee. Flagged rather than silently relabeled.
- Converting an incomplete draft (e.g. an expense with no payer) still succeeds, using fallback
  values ('Unknown' payer, 0 amount) — the organizer fixes it afterward like any normal record,
  rather than being blocked mid-flow by validation on a deliberately-incomplete object.

## Engineering review fixes (all 5 items)

1. **Duplicate settlement computation** — fixed. `computeTripData(tripId)` now computes
   `computeSettlement()` exactly once and feeds it into both `computeFinance` and
   `computeTodayView` via an optional `precomputedSettlement` param. Verified by grep: only
   one call site (`TripScreen.js`) calls it now, replacing the old two-independent-calls pattern.

2. **Indexes on trip_id** — added for every table (`idx_travelers_trip`, `idx_expenses_trip`,
   etc.), all 8 non-trips tables. Added directly to the init SQL, not a migration, since new
   installs get them for free and `CREATE INDEX IF NOT EXISTS` is safe to re-run.

3. **TripScreen split** — 498 lines / 25 `useState` hooks → 98 lines / 8 hooks (measured, not
   estimated). Six new components: `CockpitCard`, `TravelersTab`, `ExpensesTab`, `NotesTab`,
   `DocumentsTab`, `TimelineTab`, `FinanceTab`, each owning its own local form/edit state.
   TripScreen is now purely an orchestrator: one data fetch, tab selection, nothing else.

4. **Shared UI components** — new `components/UI.js`: `ListRow`, `PrimaryButton`, `Chip`,
   `EmptyState`, plus a shared `theme` object for colors. Used across every new tab component,
   replacing the copy-pasted `docRow`/`btn`/`listItem` style blocks. (`SearchScreen` and
   `DraftsScreen` still have their own local styles — not migrated in this pass, flagged as a
   follow-up rather than silently left inconsistent.)

5. **Migration versioning** — new `schema_migrations` table tracks applied migrations by name.
   `MIGRATIONS` array in `db.js` replaces the old "try ALTER TABLE, catch and ignore" pattern —
   each migration runs exactly once, ever, tracked explicitly rather than inferred from a
   thrown exception every single app launch.

Verified end-to-end with static checks (not just "it compiles in my head"): every relative
import across all new/changed files resolves to an actual export in its target module — checked
by parsing every `import { X } from '../db'` style statement and confirming `X` exists there.
Zero missing imports found.

## Post-V3 audit — status clarification + new work

**Already done (confirmed, not re-implemented):** duplicate settlement computation, trip_id
indexes, TripScreen split, shared UI components, migration versioning, single timeline write
path — all from the prior engineering review round. Re-verified nothing regressed.

**New — Priority 3, Finance module separation (first step):** `finance/calculator.js` now
holds `computeSettlement`, `computeFinance`, `setContributionPerPerson` — the actual financial
math, isolated from `db.js`'s general schema/query concerns. `db.js` re-exports them so every
existing `from '../db'` import across 8+ files kept working unchanged — verified with a static
import-resolution check (parses every import statement, confirms the named export exists at
the resolved target). Zero call sites needed to change.

**Deferred — Priority 4, full database file split:** not started. Explicitly permitted by
"no rush, incrementally" — splitting `db.js` (travelers/expenses/notes/documents/timeline/
itinerary/contributions/drafts, ~450 lines) into separate files right now would touch every
import across the app for reorganization's sake, not to fix anything broken. The Finance
extraction above is the template for doing this safely later, one domain at a time.

**New — Priority 5, Universal Capture:** floating + button on the Trip screen, opens a bottom
sheet with 5 actions (Expense, Note, Plan Item, Document, Quick Draft). Expense/Note/Plan Item
create real records immediately through the exact same `addExpense`/`addNote`/
`addItineraryItem` functions every tab uses — no parallel creation path. Quick Draft is the
one exception: it hands off to the Drafts screen rather than creating anything itself, since
an undecided capture is Drafts' whole purpose. Expense capture defaults payer to "Unknown"
rather than blocking the organizer for a decision they may not have time to make in the moment
— same pattern as Draft conversion.

## What I did not do — flagged explicitly, not silently skipped

The Final Request asked for performance benchmarking, a UI consistency audit, an Android
compatibility matrix, and an accessibility review. I have no Android SDK, no emulator, and no
physical device access in this environment — I can't measure cold-start time, verify contrast
ratios render correctly, or confirm layout behavior on a notched display, because I can't run
the app. Producing numbers for any of those would mean inventing them. This is exactly the
Stage 2 device-based review you already scoped for yourself; I'm not duplicating it badly from
source-code inspection. What I *can* and did verify from source: import correctness, duplicate
export detection, and the specific architectural claims made above — all checked, not assumed.

## Fix: "Unable to load script" on first open
The debug APK from CI was a live-Metro build — it needs a JS bundler running nearby (USB or
same Wi-Fi) or it can't load anything, hence the red error screen on standalone install.
Not related to the earlier `.git` path issue at all — different problem entirely.

Fix applied in the workflow: after `expo prebuild` regenerates `android/`, a step patches
`android/app/build.gradle` to set `bundleInDebug = true` inside the `react { }` block, which
makes the debug build embed the JS bundle the same way a release build would — no Metro, no
signing key needed, still the simple debug pipeline.

**I haven't been able to run this CI myself to confirm the sed patch lands correctly** — it's
based on the standard Expo/RN Gradle DSL (`react { bundleInDebug = true }`), but the exact
generated `build.gradle` layout can vary by Expo SDK version. Push this and check the new
Actions run's "Force JS bundle into debug build" step output — the `grep -A2 "^react {"` line
in that step will show whether the patch actually applied. If the block isn't found, paste
that step's log back and I'll adjust the sed pattern to match.

## Fix attempt #2 — bundleInDebug via project property, not Gradle DSL
Fix attempt #1 (`react { bundleInDebug = true }`) failed in CI with:
`Could not set unknown property 'bundleInDebug' for extension 'react'` — that property doesn't
exist on this RN version's Gradle extension. Confirmed by an actual failed build log, not
assumed.

Fix attempt #2: pass `-PbundleInDebug=true` as a Gradle project property on the command line
instead (`./gradlew assembleDebug -PbundleInDebug=true`). This is checked internally by the
React Native Gradle plugin's own task logic (`project.hasProperty('bundleInDebug')`), separate
from the `react {}` extension's typed properties — it's the documented mechanism for this exact
situation in React Native's Gradle plugin.

**Same caveat as before: unverified by an actual run.** I don't have a way to execute this
Gradle build myself. If this also fails, send the next log — specifically the exact error text,
since that's what let me find the real cause last time instead of guessing again.

## Fix attempt #3 — debuggableVariants (verified against React Native's own docs)
Attempts #1 and #2 both failed, confirmed by actual CI logs, not assumption:
- #1: `react { bundleInDebug = true }` → "unknown property" — doesn't exist on this RN version.
- #2: `-PbundleInDebug=true` → build succeeded, but `bundleDebugJsAndAssets` never ran (checked
  the log directly for that task name — absent). That mechanism is from the old pre-0.71
  `react.gradle` script and doesn't apply to the current Kotlin-based Gradle plugin.

#3 is different: instead of guessing another property name, I searched and read
reactnative.dev's own React Native Gradle Plugin documentation. The real mechanism: the
`react {}` extension has a `debuggableVariants` list (default `["debug"]`) — any variant in
that list gets its JS bundling **skipped**, which is exactly the "Unable to load script"
symptom. Setting `debuggableVariants = []` is what forces this debug build to actually bundle.

Still can't run this myself to give 100% confirmation — but this one is backed by the plugin's
own documented API, not an inferred property name. If this log's build step shows the task
`:app:bundleDebugJsAndAssets` (or similar) actually running, that's the real confirmation to
look for — grep for it in the next log before assuming success from "BUILD SUCCESSFUL" alone,
since attempt #2 proved a green build doesn't mean the fix worked.

## UI/UX overhaul — lessons from mentor's reference, re-implemented in our actual RN stack

Your mentor's reference project (`tripnest_v3.zip`) is a different stack entirely —
React + Capacitor + Tailwind, not React Native/Expo. **Worth flagging**: that's the exact stack
choice this project deliberately moved away from earlier for performance-KPI reasons. So none
of their code was copied — the actual design *decisions* were extracted and rebuilt natively:

1. **Design tokens overhauled** (`components/UI.js`): a real ink/surface/brand color system
   (not one flat teal), larger corner radii, a defined type scale. `theme.primary`/`primaryLight`
   etc. kept as aliases so nothing broke mid-migration.

2. **Consistent icon language**: installed `@expo/vector-icons` (Feather set), replaced every
   raw emoji (👤💰📝📄🕒💵🚩) across every screen with the same stroke-icon system via a new
   `IconBadge` component. This was explicitly flagged as visual debt in an earlier engineering
   review — this pass actually fixes it.

3. **"One number answers the question" hero pattern**: adopted directly from the mentor's Home
   screen. `StatHero` component. Applied to:
   - Cockpit card → "Cash left" is now the dominant number, plan/activity demoted beneath it.
   - Finance tab → "Current cash" hero at top, Trip Fund/Forecast/Settlement each in their own
     clearly bordered card below, instead of 5 same-weight subheadings stacked in a row.

4. **Guided empty states**: adopted the mentor's `Empty` component philosophy directly — an
   empty state should explain *when the feature matters* and *whether it's optional*, not just
   report "no items yet." Every tab's empty state rewritten with real guidance text.

5. **Fixed a real duplicate-header bug**: screenshots showed the trip name rendered twice
   (native stack header + our own header row below it). Not a style opinion — a bug. Fixed by
   disabling the native header for the Trip screen and taking full manual control (back button,
   title, action icons) in one place.

6. **Tab bar**: icons paired with labels, softer card-style chips instead of flat pills.

Not touched in this pass: SearchScreen and DraftsScreen still use their pre-overhaul styling —
same gap already flagged in the earlier engineering review (shared components not yet migrated
everywhere). Flagging again rather than letting the README imply 100% coverage.
