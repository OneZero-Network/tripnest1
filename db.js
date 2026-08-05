import * as SQLite from 'expo-sqlite';
import { scheduleItineraryNotification, cancelItineraryNotification } from './notifications';

let db;

// ---- Versioned migrations: replaces the old try/catch-on-every-launch approach.
// Each migration runs exactly once, tracked in schema_migrations, in order. Adding a new
// migration means appending to this array — never editing an already-shipped entry.
const MIGRATIONS = [
  {
    name: '001_add_trip_status',
    sql: `ALTER TABLE trips ADD COLUMN status TEXT NOT NULL DEFAULT 'active';`,
  },
  {
    name: '002_add_contribution_per_person',
    sql: `ALTER TABLE trips ADD COLUMN contribution_per_person REAL;`,
  },
  {
    name: '003_add_timeline_type',
    sql: `ALTER TABLE timeline ADD COLUMN type TEXT NOT NULL DEFAULT 'trip';`,
  },
  {
    name: '004_add_timeline_metadata',
    sql: `ALTER TABLE timeline ADD COLUMN metadata TEXT;`,
  },
  {
    name: '005_add_trip_custodian',
    // The POC who physically/digitally holds the pooled trip cash (e.g. "Ayaz — SBI a/c").
    // Purely informational: it doesn't change how settlement math works, it just answers
    // "who do I actually hand my contribution to" — the gap organizers kept hitting.
    sql: `ALTER TABLE trips ADD COLUMN custodian TEXT;`,
  },
  {
    name: '006_add_emergency_pin_documents',
    // Safe Mode support: an organizer pins the handful of documents that actually matter
    // in an emergency (passport, travel insurance, ID) so Safe Mode can surface exactly
    // those instead of every attached ticket and booking confirmation.
    sql: `ALTER TABLE documents ADD COLUMN pinned_emergency INTEGER NOT NULL DEFAULT 0;`,
  },
  {
    name: '007_add_emergency_pin_notes',
    sql: `ALTER TABLE notes ADD COLUMN pinned_emergency INTEGER NOT NULL DEFAULT 0;`,
  },
  {
    name: '008_add_trip_base_currency',
    // The currency settlement math is done in. Every expense/contribution converts to
    // this at entry time via fx_rate, so "cash left" and settlement transactions are
    // always one consistent number, never a sum of mismatched currencies.
    sql: `ALTER TABLE trips ADD COLUMN base_currency TEXT NOT NULL DEFAULT 'INR';`,
  },
  {
    name: '009_add_expense_currency',
    sql: `ALTER TABLE expenses ADD COLUMN currency TEXT NOT NULL DEFAULT 'INR';`,
  },
  {
    name: '010_add_expense_fx_rate',
    // amount_in_base_currency = amount * fx_rate. Rate is captured at entry time (not
    // looked up live) because settlement must stay reproducible — a trip closed in March
    // should settle at March's rate, not whatever the rate is when someone reopens it later.
    sql: `ALTER TABLE expenses ADD COLUMN fx_rate REAL NOT NULL DEFAULT 1;`,
  },
  {
    name: '011_add_contribution_currency',
    sql: `ALTER TABLE contributions ADD COLUMN currency TEXT NOT NULL DEFAULT 'INR';`,
  },
  {
    name: '012_add_contribution_fx_rate',
    sql: `ALTER TABLE contributions ADD COLUMN fx_rate REAL NOT NULL DEFAULT 1;`,
  },
  {
    name: '013_add_expense_category',
    sql: `ALTER TABLE expenses ADD COLUMN category TEXT;`,
  },
  {
    name: '014_add_expense_funding_source',
    // Distinguishes an expense paid out of the shared Trip Bank from one a traveler paid
    // personally and needs to be settled 1:1 for. This is the real fix for "current
    // balance shows -300 and it's confusing" — that number was conflating two different
    // things (pool spend vs. personal advances) into one bucket. Existing rows default to
    // 'personal' since that's what every expense in this app has meant until now.
    sql: `ALTER TABLE expenses ADD COLUMN funding_source TEXT NOT NULL DEFAULT 'personal';`,
  },
  {
    name: '015_add_trip_has_bank',
    // Whether this trip even has a shared pool — defaults to 1 (on) so every existing
    // trip keeps behaving exactly as before. New trips can opt out at creation; when off,
    // "Paid from: Trip Bank" isn't offered on Add Expense and the Trip Bank Pool card
    // doesn't show on Members, since there's nothing there to show.
    sql: `ALTER TABLE trips ADD COLUMN has_trip_bank INTEGER NOT NULL DEFAULT 1;`,
  },
  {
    name: '016_add_app_meta',
    // A tiny key-value table for app-level flags that aren't about any one trip — first-run
    // onboarding being the initial (and so far only) use. Deliberately not reusing "zero
    // trips exist" as a proxy for "never onboarded": a user who deletes every trip would
    // wrongly see onboarding again under that logic.
    sql: `CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT);`,
  },
  {
    name: '017_add_itinerary_notification_id',
    // Links a plan item to the local notification scheduled for it, so deleting the item
    // can cancel the notification instead of leaving an orphaned reminder that fires for
    // a plan the organizer already removed.
    sql: `ALTER TABLE itinerary_items ADD COLUMN notification_id TEXT;`,
  },
  {
    name: '018_add_expense_splits',
    // Real correctness gap being closed: every expense used to split equally among EVERY
    // traveler on the trip, even ones who didn't participate in that specific expense —
    // "three people got appetizers, two got dessert" had no way to be represented. Absence
    // of rows here for a given expense means "equal split among all current travelers,"
    // exactly matching the old behavior — so every expense recorded before this migration
    // keeps computing exactly the same settlement it always did. Presence of rows means
    // "only these specific people split this one," each for their explicit share.
    sql: `CREATE TABLE IF NOT EXISTS expense_splits (
      id TEXT PRIMARY KEY,
      expense_id TEXT NOT NULL,
      traveler_name TEXT NOT NULL,
      share_amount REAL NOT NULL
    );`,
  },
];

export async function getDB() {
  if (!db) {
    db = await SQLite.openDatabaseAsync('tripnest.db');
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS trips (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS travelers (
        id TEXT PRIMARY KEY,
        trip_id TEXT NOT NULL,
        name TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        trip_id TEXT NOT NULL,
        paid_by TEXT NOT NULL,
        amount REAL NOT NULL,
        description TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        trip_id TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS timeline (
        id TEXT PRIMARY KEY,
        trip_id TEXT NOT NULL,
        event TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'trip',
        metadata TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        trip_id TEXT NOT NULL,
        name TEXT NOT NULL,
        uri TEXT NOT NULL,
        mime_type TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS itinerary_items (
        id TEXT PRIMARY KEY,
        trip_id TEXT NOT NULL,
        title TEXT NOT NULL,
        location TEXT,
        scheduled_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS contributions (
        id TEXT PRIMARY KEY,
        trip_id TEXT NOT NULL,
        traveler TEXT NOT NULL,
        amount REAL NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS drafts (
        id TEXT PRIMARY KEY,
        trip_id TEXT NOT NULL,
        draft_type TEXT NOT NULL,
        partial_data TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      -- A settlement is a REAL recorded transfer between two travelers reconciling their
      -- computed balance (e.g. "Tariq paid Ayaz ₹500 in cash"), as distinct from an
      -- expense or a contribution. Recording it lets computeSettlement() net it out of
      -- the outstanding from→to list, which is the missing piece that made "settle up"
      -- a read-only report instead of something you could actually check off.
      CREATE TABLE IF NOT EXISTS settlements (
        id TEXT PRIMARY KEY,
        trip_id TEXT NOT NULL,
        from_traveler TEXT NOT NULL,
        to_traveler TEXT NOT NULL,
        amount REAL NOT NULL,
        created_at INTEGER NOT NULL
      );

      -- Every table is queried exclusively by trip_id ("WHERE trip_id = ?" everywhere) —
      -- these turn every one of those into an index lookup instead of a full table scan.
      CREATE INDEX IF NOT EXISTS idx_travelers_trip ON travelers(trip_id);
      CREATE INDEX IF NOT EXISTS idx_expenses_trip ON expenses(trip_id);
      CREATE INDEX IF NOT EXISTS idx_notes_trip ON notes(trip_id);
      CREATE INDEX IF NOT EXISTS idx_timeline_trip ON timeline(trip_id);
      CREATE INDEX IF NOT EXISTS idx_documents_trip ON documents(trip_id);
      CREATE INDEX IF NOT EXISTS idx_itinerary_trip ON itinerary_items(trip_id);
      CREATE INDEX IF NOT EXISTS idx_contributions_trip ON contributions(trip_id);
      CREATE INDEX IF NOT EXISTS idx_drafts_trip ON drafts(trip_id);
      CREATE INDEX IF NOT EXISTS idx_settlements_trip ON settlements(trip_id);
    `);

    const applied = new Set(
      (await db.getAllAsync('SELECT name FROM schema_migrations')).map((r) => r.name)
    );
    for (const migration of MIGRATIONS) {
      if (applied.has(migration.name)) continue;
      try {
        await db.execAsync(migration.sql);
      } catch (e) {
        // Column/table already exists from a fresh install (the CREATE TABLE above already
        // includes it) — that's fine. A genuinely new failure would still throw on the next
        // real migration, so this doesn't hide errors indefinitely, only this known case.
      }
      await db.runAsync(
        'INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)',
        migration.name, Date.now()
      );
    }
  }
  return db;
}

// ---- Single write path for timeline events ----
// Every feature that logs a trip event goes through this function, not a raw INSERT.
// This is why the type/metadata columns can evolve in one place instead of N call sites —
// the exact problem flagged after Timeline Replay's implementation.
export async function logTimelineEvent({ tripId, type, title, metadata = null, timestamp = Date.now(), idSuffix = '' }) {
  const db = await getDB();
  const id = `${timestamp}${idSuffix}_${Math.random().toString(36).slice(2, 7)}`;
  await db.runAsync(
    'INSERT INTO timeline (id, trip_id, event, type, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    id, tripId, title, type, metadata ? JSON.stringify(metadata) : null, timestamp
  );
  return id;
}

// Financial history is immutable: expenses are only ever inserted, never updated/deleted.
// ---- Currency helpers ----
async function getTripBaseCurrency(tripId) {
  const db = await getDB();
  const trip = await db.getFirstAsync('SELECT base_currency FROM trips WHERE id = ?', tripId);
  return trip?.base_currency || 'INR';
}

// ---- App-level flags (not tied to any one trip) ----
export async function getAppMeta(key) {
  const db = await getDB();
  const row = await db.getFirstAsync('SELECT value FROM app_meta WHERE key = ?', key);
  return row?.value ?? null;
}
export async function setAppMeta(key, value) {
  const db = await getDB();
  await db.runAsync('INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
}

export async function setBaseCurrency(tripId, currency) {
  const db = await getDB();
  await db.runAsync('UPDATE trips SET base_currency = ? WHERE id = ?', currency, tripId);
}

export async function addExpense(tripId, paidBy, amount, description, opts = {}) {
  const db = await getDB();
  const id = String(Date.now()) + Math.random().toString(36).slice(2);
  const ts = Date.now();
  const baseCurrency = await getTripBaseCurrency(tripId);
  const currency = opts.currency || baseCurrency;
  // fx_rate defaults to 1 when the expense is already in the trip's base currency —
  // no conversion needed, and this is the common case for most trips.
  const fxRate = opts.fxRate ?? (currency === baseCurrency ? 1 : opts.fxRate);
  if (fxRate == null) throw new Error(`fxRate is required when currency (${currency}) differs from the trip's base currency (${baseCurrency})`);
  const category = opts.category || null;
  const fundingSource = opts.fundingSource === 'bank' ? 'bank' : 'personal';
  await db.runAsync(
    'INSERT INTO expenses (id, trip_id, paid_by, amount, description, currency, fx_rate, category, funding_source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id, tripId, paidBy, amount, description, currency, fxRate, category, fundingSource, ts
  );

  // Optional explicit participant list — who actually shares THIS expense, not
  // necessarily every traveler on the trip. `participants` is an array of traveler names;
  // splits equally among exactly those names. Omit entirely for the old/default behavior
  // (equal split among every current traveler, computed dynamically at settlement time,
  // not stored — so it stays correct even if travelers are added or removed later).
  if (opts.participants && opts.participants.length > 0) {
    const baseAmount = amount * fxRate;
    const perPerson = +(baseAmount / opts.participants.length).toFixed(2);
    for (const name of opts.participants) {
      const splitId = String(Date.now()) + Math.random().toString(36).slice(2);
      await db.runAsync(
        'INSERT INTO expense_splits (id, expense_id, traveler_name, share_amount) VALUES (?, ?, ?, ?)',
        splitId, id, name, perPerson
      );
    }
  }

  const label = currency === baseCurrency ? `${amount}` : `${amount} ${currency}`;
  const sourceLabel = fundingSource === 'bank' ? ' from the Trip Bank' : '';
  // The timeline entry needs some noun even when description is blank — falls back to
  // the category (or "an expense") for that one line, but this is display-only and never
  // gets written back into the stored `description`, which is what caused the
  // "Food · Food · Personal" duplicate in the row list.
  const timelineNoun = description || category || 'an expense';
  await logTimelineEvent({ tripId, type: 'expense', title: `${paidBy} paid ${label} for ${timelineNoun}${sourceLabel}`, timestamp: ts, idSuffix: '_t', metadata: { id, paidBy, amount, currency, category } });
  return id;
}

// ---- Travelers: editable (not financial records) ----
export async function renameTraveler(travelerId, tripId, newName) {
  const db = await getDB();
  const old = await db.getFirstAsync('SELECT name FROM travelers WHERE id = ?', travelerId);
  await db.runAsync('UPDATE travelers SET name = ? WHERE id = ?', newName, travelerId);
  const ts = Date.now();
  await logTimelineEvent({ tripId, type: 'traveler', title: `Traveler renamed: ${old?.name ?? '?'} → ${newName}`, timestamp: ts, idSuffix: '_rt' });
}

// A traveler can only be removed if no expense references them as payer —
// removing a referenced traveler would silently corrupt settlement math.
export async function removeTraveler(travelerId, tripId) {
  const db = await getDB();
  const traveler = await db.getFirstAsync('SELECT name FROM travelers WHERE id = ?', travelerId);
  if (!traveler) return { ok: false, reason: 'not_found' };
  const referenced = await db.getFirstAsync(
    'SELECT COUNT(*) as c FROM expenses WHERE trip_id = ? AND paid_by = ?', tripId, traveler.name
  );
  if (referenced.c > 0) return { ok: false, reason: 'referenced' };
  await db.runAsync('DELETE FROM travelers WHERE id = ?', travelerId);
  const ts = Date.now();
  await logTimelineEvent({ tripId, type: 'traveler', title: `Traveler removed: ${traveler.name}`, timestamp: ts, idSuffix: '_dt' });
  return { ok: true };
}

// ---- Notes: editable (not financial records) ----
export async function addNote(tripId, text) {
  const db = await getDB();
  const id = String(Date.now()) + Math.random().toString(36).slice(2);
  const ts = Date.now();
  await db.runAsync('INSERT INTO notes (id, trip_id, text, created_at) VALUES (?, ?, ?, ?)', id, tripId, text, ts);
  await logTimelineEvent({ tripId, type: 'note', title: `Note added: ${text.slice(0, 60)}${text.length > 60 ? '…' : ''}`, timestamp: ts, idSuffix: '_t', metadata: { id } });
  return id;
}

export async function updateNote(noteId, tripId, newText) {
  const db = await getDB();
  await db.runAsync('UPDATE notes SET text = ? WHERE id = ?', newText, noteId);
  const ts = Date.now();
  await logTimelineEvent({ tripId, type: 'note', title: 'Note edited', timestamp: ts, idSuffix: '_un' });
}

export async function deleteNote(noteId, tripId) {
  const db = await getDB();
  await db.runAsync('DELETE FROM notes WHERE id = ?', noteId);
  const ts = Date.now();
  await logTimelineEvent({ tripId, type: 'note', title: 'Note deleted', timestamp: ts, idSuffix: '_dn' });
}

// ---- Safe Mode: pin/unpin + a single fetch for the emergency view ----
// Toggling reuses the existing notes/documents tables (pinned_emergency is just a flag on
// each row) rather than a parallel "emergency contacts" table — an organizer pins whatever
// ---- Single-record lookups: what makes an Activity feed row tappable rather than just
// informational text. Without these, a timeline entry has a title string and nothing
// else — no way to open, edit, or delete the thing it's describing. ----
export async function getNoteById(id) {
  const db = await getDB();
  return db.getFirstAsync('SELECT * FROM notes WHERE id = ?', id);
}
export async function getDocumentById(id) {
  const db = await getDB();
  return db.getFirstAsync('SELECT * FROM documents WHERE id = ?', id);
}
export async function getExpenseById(id) {
  const db = await getDB();
  return db.getFirstAsync('SELECT * FROM expenses WHERE id = ?', id);
}

export async function getExpenseSplits(expenseId) {
  const db = await getDB();
  return db.getAllAsync('SELECT * FROM expense_splits WHERE expense_id = ?', expenseId);
}

// note or document already has the info (passport photo, "Embassy: +91..." note) instead
// of re-entering it somewhere else.
export async function togglePinnedDocument(docId) {
  const db = await getDB();
  await db.runAsync('UPDATE documents SET pinned_emergency = NOT pinned_emergency WHERE id = ?', docId);
}

export async function togglePinnedNote(noteId) {
  const db = await getDB();
  await db.runAsync('UPDATE notes SET pinned_emergency = NOT pinned_emergency WHERE id = ?', noteId);
}

export async function getSafeModeData(tripId) {
  const db = await getDB();
  const trip = await db.getFirstAsync('SELECT * FROM trips WHERE id = ?', tripId);
  const travelers = await db.getAllAsync('SELECT * FROM travelers WHERE trip_id = ?', tripId);
  const documents = await db.getAllAsync('SELECT * FROM documents WHERE trip_id = ? AND pinned_emergency = 1 ORDER BY created_at DESC', tripId);
  const notes = await db.getAllAsync('SELECT * FROM notes WHERE trip_id = ? AND pinned_emergency = 1 ORDER BY created_at DESC', tripId);
  return { trip, travelers, documents, notes };
}

// ---- Contributions: money travelers put into the trip fund (received only — see note) ----
// "Expected" contributions are NOT modeled here: that needs a per-traveler target or split
// rule nobody has specified yet. Building it silently would mean inventing a default the
// organizer never asked for. This tracks money actually received, full stop.
export async function addContribution(tripId, traveler, amount, opts = {}) {
  const db = await getDB();
  const id = String(Date.now()) + Math.random().toString(36).slice(2);
  const ts = Date.now();
  const baseCurrency = await getTripBaseCurrency(tripId);
  const currency = opts.currency || baseCurrency;
  const fxRate = opts.fxRate ?? (currency === baseCurrency ? 1 : opts.fxRate);
  if (fxRate == null) throw new Error(`fxRate is required when currency (${currency}) differs from the trip's base currency (${baseCurrency})`);
  await db.runAsync(
    'INSERT INTO contributions (id, trip_id, traveler, amount, currency, fx_rate, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id, tripId, traveler, amount, currency, fxRate, ts
  );
  const label = currency === baseCurrency ? `${amount}` : `${amount} ${currency}`;
  await logTimelineEvent({ tripId, type: 'contribution', title: `${traveler} contributed ${label} to the trip fund`, timestamp: ts, idSuffix: '_t' });
  return id;
}

// ---- Trip lifecycle: minimal active/closed status, needed only to gate Final Settlement ----
// ---- Fund custodian: who the pooled cash actually sits with ----
export async function setCustodian(tripId, custodian) {
  const db = await getDB();
  await db.runAsync('UPDATE trips SET custodian = ? WHERE id = ?', custodian, tripId);
}

// ---- Recording a real settlement between two travelers (reconciliation) ----
// This is a source-of-truth write, same tier as an expense or contribution — it represents
// something that actually happened ("X paid Y ₹amount"), which is why it gets its own
// table instead of being inferred. computeSettlement() nets these against the greedy
// from→to list so a paid transaction stops showing as outstanding.
export async function recordSettlement(tripId, from, to, amount) {
  const db = await getDB();
  const id = String(Date.now()) + Math.random().toString(36).slice(2);
  const ts = Date.now();
  await db.runAsync(
    'INSERT INTO settlements (id, trip_id, from_traveler, to_traveler, amount, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    id, tripId, from, to, amount, ts
  );
  await logTimelineEvent({ tripId, type: 'settlement', title: `${from} paid ${to} ${amount}`, timestamp: ts, idSuffix: '_settle' });
  return id;
}

export async function closeTrip(tripId) {
  const db = await getDB();
  await db.runAsync("UPDATE trips SET status = 'closed' WHERE id = ?", tripId);
  const ts = Date.now();
  await logTimelineEvent({ tripId, type: 'trip', title: 'Trip closed', timestamp: ts, idSuffix: '_close' });
}

export async function reopenTrip(tripId) {
  const db = await getDB();
  await db.runAsync("UPDATE trips SET status = 'active' WHERE id = ?", tripId);
}

// ---- Finance (settlement, trip fund, finance projection) lives in finance/calculator.js ----
// Re-exported here so every existing "from '../db'" import across the app keeps working
// unchanged — this is an internal file reorganization, not a public API change.
export { setContributionPerPerson, computeSettlement, computeFinance, computeBankSettlement } from './finance/calculator';
import { computeSettlement, computeFinance } from './finance/calculator';

// ---- Single entry point for TripScreen's load cycle ----
// Computes settlement exactly once, then feeds it into both Finance and Today —
// replaces the old pattern where loadAll() called computeFinance() and computeTodayView()
// independently, each silently recomputing the same settlement.
export async function computeTripData(tripId) {
  const settlement = await computeSettlement(tripId);
  const [finance, today] = await Promise.all([
    computeFinance(tripId, settlement),
    computeTodayView(tripId, settlement),
  ]);
  return { finance, today };
}

// ---- Notification feed: a real aggregation across every trip, not fabricated content.
// Home's "Notifications" tab shows exactly this — pending drafts, outstanding
// settlements, and plan items coming up in the next 24 hours, for every active trip.
// Nothing here is invented; it's the same data Settlement/Drafts/Cockpit already compute,
// just gathered from every trip in one pass instead of one trip at a time. ----
// ---- Destination insights: "how many times have I been here, with whom, how much" ----
// Trip names are free text ("Goa Trip 2026," "Goa with friends," "Weekend in Goa") — there's
// no separate structured "destination" field anywhere in the schema. Rather than adding
// one (a real migration, and it still wouldn't retroactively fix trips already named
// freely), this normalizes names heuristically: lowercase, strip common trip-naming
// filler words and years, and use what's left as the place key. Imperfect for unusual
// naming, but correct for the common case, and it costs nothing to be wrong about a trip
// that just never gets grouped — the trip's own data is never touched by this.
const STOPWORDS = new Set(['trip', 'vacation', 'holiday', 'weekend', 'getaway', 'with', 'and', 'the', 'a', 'an', 'to', 'in', 'our', 'my', 'friends', 'family', 'gang']);
function placeKey(tripName) {
  const words = (tripName || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w) && !/^\d{4}$/.test(w)); // drop stopwords and bare years
  return words[0] || null;
}

export async function getDestinationInsights() {
  const db = await getDB();
  const trips = await db.getAllAsync('SELECT * FROM trips ORDER BY created_at ASC');

  const groups = {};
  trips.forEach((t) => {
    const key = placeKey(t.name);
    if (!key) return;
    if (!groups[key]) groups[key] = { label: t.name, trips: [] };
    groups[key].trips.push(t);
  });

  const insights = [];
  for (const group of Object.values(groups)) {
    if (group.trips.length < 2) continue; // "insight" implies a pattern — one visit isn't one yet

    let totalSpent = 0;
    const companionCounts = {};
    for (const trip of group.trips) {
      const spentRow = await db.getFirstAsync('SELECT COALESCE(SUM(amount*fx_rate),0) as total FROM expenses WHERE trip_id = ?', trip.id);
      totalSpent += spentRow.total;
      const travelers = await db.getAllAsync('SELECT name FROM travelers WHERE trip_id = ?', trip.id);
      travelers.forEach((tr) => { companionCounts[tr.name] = (companionCounts[tr.name] || 0) + 1; });
    }
    const topCompanions = Object.entries(companionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name);

    insights.push({
      place: group.trips[group.trips.length - 1].name, // most recent trip's own naming, most recognizable to the user
      visitCount: group.trips.length,
      totalSpent,
      baseCurrency: group.trips[0].base_currency || 'INR',
      topCompanions,
    });
  }
  return insights.sort((a, b) => b.visitCount - a.visitCount);
}

export async function getNotificationFeed() {
  const db = await getDB();
  const trips = await db.getAllAsync("SELECT * FROM trips WHERE status = 'active' ORDER BY created_at DESC");
  const items = [];

  for (const trip of trips) {
    const drafts = await getDrafts(trip.id);
    if (drafts.length > 0) {
      items.push({
        id: `draft_${trip.id}`,
        tripId: trip.id,
        tripName: trip.name,
        icon: 'inbox',
        tone: 'accent',
        message: `${drafts.length} pending draft${drafts.length === 1 ? '' : 's'} in ${trip.name}`,
        sortKey: 2,
      });
    }

    const { finance, today } = await computeTripData(trip.id);
    const bankTx = finance.bankSettlement?.transactions || [];
    const personalTx = finance.liveForecast?.transactions || [];
    const outstandingCount = bankTx.length + personalTx.length;
    if (outstandingCount > 0) {
      items.push({
        id: `settlement_${trip.id}`,
        tripId: trip.id,
        tripName: trip.name,
        icon: 'check-circle',
        tone: 'warn',
        message: `${outstandingCount} outstanding settlement${outstandingCount === 1 ? '' : 's'} in ${trip.name}`,
        sortKey: 1,
      });
    }

    const soon = Date.now() + 24 * 60 * 60 * 1000;
    (today.todaysSegments || []).forEach((seg) => {
      if (seg.scheduled_at >= Date.now() && seg.scheduled_at <= soon) {
        items.push({
          id: `plan_${seg.id}`,
          tripId: trip.id,
          tripName: trip.name,
          icon: 'calendar',
          tone: 'brand',
          message: `${seg.title} coming up in ${trip.name}`,
          timestamp: seg.scheduled_at,
          sortKey: 0,
        });
      }
    });
  }

  // Upcoming plan items first (time-sensitive), then settlements, then drafts —
  // roughly "what needs action soonest" rather than alphabetical or by trip.
  return items.sort((a, b) => a.sortKey - b.sortKey || (a.timestamp || 0) - (b.timestamp || 0));
}

// ---- Itinerary items: scheduled trip items (source-of-truth, not derived) ----
export async function addItineraryItem(tripId, title, scheduledAt, location) {
  const db = await getDB();
  const id = String(Date.now()) + Math.random().toString(36).slice(2);
  const ts = Date.now();
  // Only schedule a reminder for something actually in the future — a plan item logged
  // for earlier today (common when back-filling a day's activities) shouldn't queue a
  // notification that fires the instant it's saved.
  let notificationId = null;
  if (scheduledAt > Date.now()) {
    const trip = await db.getFirstAsync('SELECT name FROM trips WHERE id = ?', tripId);
    notificationId = await scheduleItineraryNotification(trip?.name || 'Your trip', title, location, scheduledAt);
  }
  await db.runAsync(
    'INSERT INTO itinerary_items (id, trip_id, title, location, scheduled_at, created_at, notification_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id, tripId, title, location || null, scheduledAt, ts, notificationId
  );
  await logTimelineEvent({ tripId, type: 'itinerary', title: `Planned: ${title}`, timestamp: ts, idSuffix: '_t' });
  return id;
}

export async function deleteItineraryItem(id, tripId, title) {
  const db = await getDB();
  const existing = await db.getFirstAsync('SELECT notification_id FROM itinerary_items WHERE id = ?', id);
  await db.runAsync('DELETE FROM itinerary_items WHERE id = ?', id);
  if (existing?.notification_id) await cancelItineraryNotification(existing.notification_id);
  const ts = Date.now();
  await logTimelineEvent({ tripId, type: 'itinerary', title: `Plan removed: ${title}`, timestamp: ts, idSuffix: '_ds' });
}

// ---- Smart Cockpit: pure read projection, no new source-of-truth beyond itinerary_items ----
// Cheap by construction: bounded queries (today's window, LIMIT on recent activity),
// no full-table scans beyond what computeSettlement already does for the trip.
export async function computeTodayView(tripId, precomputedSettlement = null) {
  const db = await getDB();
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(); dayEnd.setHours(23, 59, 59, 999);

  const todaysSegments = await db.getAllAsync(
    'SELECT * FROM itinerary_items WHERE trip_id = ? AND scheduled_at BETWEEN ? AND ? ORDER BY scheduled_at ASC',
    tripId, dayStart.getTime(), dayEnd.getTime()
  );
  const recentActivity = await db.getAllAsync(
    'SELECT * FROM timeline WHERE trip_id = ? ORDER BY created_at DESC LIMIT 5', tripId
  );
  const { balances } = precomputedSettlement ?? await computeSettlement(tripId);
  // Was `totalSpent` here before — an all-time sum that also ignored fx_rate (wrong for
  // any foreign-currency expense) and, checked against every screen in the app, was never
  // actually read anywhere. Replaced with a genuine "spent today" figure, fx-adjusted,
  // which is what the Overview dashboard actually needs.
  const spentTodayRow = await db.getFirstAsync(
    'SELECT COALESCE(SUM(amount * fx_rate),0) as total FROM expenses WHERE trip_id = ? AND created_at BETWEEN ? AND ?',
    tripId, dayStart.getTime(), dayEnd.getTime()
  );

  return {
    todaysSegments,
    recentActivity,
    spentToday: spentTodayRow.total,
    balances,
  };
}

// Settlements are derived, never stored — recomputed from expenses every time.
// (Function body now lives in finance/calculator.js — see the re-export near the top of this file.)

// ---- Organizer Drafts: genuine new source-of-truth (unlike Search/Replay, which are projections) ----
// A draft is NOT a timeline event by design — it represents an unresolved intention, not
// something that happened. Only conversion (draft -> real record) logs to the timeline,
// via the same logTimelineEvent() path every other feature uses.
export async function addDraft(tripId, draftType, partialData) {
  const db = await getDB();
  const id = String(Date.now()) + Math.random().toString(36).slice(2);
  await db.runAsync(
    'INSERT INTO drafts (id, trip_id, draft_type, partial_data, created_at) VALUES (?, ?, ?, ?, ?)',
    id, tripId, draftType, JSON.stringify(partialData), Date.now()
  );
  return id;
}

export async function updateDraft(draftId, partialData) {
  const db = await getDB();
  await db.runAsync('UPDATE drafts SET partial_data = ? WHERE id = ?', JSON.stringify(partialData), draftId);
}

export async function discardDraft(draftId) {
  const db = await getDB();
  await db.runAsync('DELETE FROM drafts WHERE id = ?', draftId);
}

export async function getDrafts(tripId) {
  const db = await getDB();
  const rows = await db.getAllAsync('SELECT * FROM drafts WHERE trip_id = ? ORDER BY created_at DESC', tripId);
  return rows.map((r) => ({ ...r, partial_data: JSON.parse(r.partial_data) }));
}

// Converting a draft creates the real record through the SAME functions the rest of the app
// uses (addExpense / addNote / addItineraryItem) — no parallel write path, no chance of a
// draft-to-record conversion behaving differently than a normal creation.
export async function convertDraft(draft) {
  const data = draft.partial_data;
  let newId;
  if (draft.draft_type === 'expense') {
    newId = await addExpense(draft.trip_id, data.paidBy || 'Unknown', parseFloat(data.amount) || 0, data.description || 'Expense');
  } else if (draft.draft_type === 'note') {
    newId = await addNote(draft.trip_id, data.text || '');
  } else if (draft.draft_type === 'itinerary') {
    newId = await addItineraryItem(draft.trip_id, data.title || 'Untitled', data.scheduledAt || Date.now(), data.location || null);
  }
  await discardDraft(draft.id);
  return newId;
}

// ---- Search Everywhere: pure read, bounded to one trip, no schema change ----
export async function searchTrip(tripId, query) {
  const db = await getDB();
  const q = `%${query.trim()}%`;
  if (!query.trim()) {
    return { travelers: [], expenses: [], notes: [], documents: [], timeline: [], contributions: [] };
  }
  const [travelers, expenses, notes, documents, timeline, contributions] = await Promise.all([
    db.getAllAsync('SELECT * FROM travelers WHERE trip_id = ? AND name LIKE ?', tripId, q),
    db.getAllAsync('SELECT * FROM expenses WHERE trip_id = ? AND (description LIKE ? OR paid_by LIKE ?) ORDER BY created_at DESC', tripId, q, q),
    db.getAllAsync('SELECT * FROM notes WHERE trip_id = ? AND text LIKE ? ORDER BY created_at DESC', tripId, q),
    db.getAllAsync('SELECT * FROM documents WHERE trip_id = ? AND name LIKE ? ORDER BY created_at DESC', tripId, q),
    db.getAllAsync('SELECT * FROM timeline WHERE trip_id = ? AND event LIKE ? ORDER BY created_at DESC', tripId, q),
    db.getAllAsync('SELECT * FROM contributions WHERE trip_id = ? AND traveler LIKE ? ORDER BY created_at DESC', tripId, q),
  ]);
  return { travelers, expenses, notes, documents, timeline, contributions };
}

// ---- Timeline Replay: pure presentation transform, no query cost beyond the existing fetch ----
// Groups timeline rows (already fetched, already trip-scoped) by calendar day, then clusters
// events within a short window (15 min) into a single "activity block" so a burst of related
// actions (check-out + expense + note, all within minutes) reads as one moment, not three rows.
const CLUSTER_WINDOW_MS = 15 * 60 * 1000;

export function groupTimelineForReplay(rows) {
  // rows expected sorted DESC by created_at (matches existing query); replay wants ASC within a day.
  const byDay = new Map();
  for (const row of rows) {
    const day = new Date(row.created_at);
    const dayKey = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
    if (!byDay.has(dayKey)) byDay.set(dayKey, { dayKey, date: day, events: [] });
    byDay.get(dayKey).events.push(row);
  }

  const days = Array.from(byDay.values())
    .sort((a, b) => b.date - a.date)
    .map((d) => {
      const eventsAsc = [...d.events].sort((a, b) => a.created_at - b.created_at);
      const blocks = [];
      for (const ev of eventsAsc) {
        const last = blocks[blocks.length - 1];
        if (last && ev.created_at - last.events[last.events.length - 1].created_at <= CLUSTER_WINDOW_MS) {
          last.events.push(ev);
        } else {
          blocks.push({ anchorTime: ev.created_at, events: [ev] });
        }
      }
      return { ...d, blocks };
    });

  return days;
}

// ---- Draft aging: pure presentation helper, no query cost ----
// Note: your three labels (Today / Yesterday / Older than 3 days) leave days 2-3 unlabeled.
// Rather than inventing a 4th bucket you didn't ask for, this uses three buckets —
// Today / Yesterday / Older — and the UI labels the third "Older" rather than falsely
// claiming everything in it is >3 days old.
export function bucketDraftsByAge(drafts) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;

  const buckets = { today: [], yesterday: [], older: [] };
  for (const d of drafts) {
    if (d.created_at >= startOfToday) buckets.today.push(d);
    else if (d.created_at >= startOfYesterday) buckets.yesterday.push(d);
    else buckets.older.push(d);
  }
  return buckets;
}
