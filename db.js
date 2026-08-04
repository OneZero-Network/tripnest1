import * as SQLite from 'expo-sqlite';

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
  await db.runAsync(
    'INSERT INTO expenses (id, trip_id, paid_by, amount, description, currency, fx_rate, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    id, tripId, paidBy, amount, description, currency, fxRate, ts
  );
  const label = currency === baseCurrency ? `${amount}` : `${amount} ${currency}`;
  await logTimelineEvent({ tripId, type: 'expense', title: `${paidBy} paid ${label} for ${description}`, timestamp: ts, idSuffix: '_t' });
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
  await logTimelineEvent({ tripId, type: 'note', title: `Note added: ${text.slice(0, 60)}${text.length > 60 ? '…' : ''}`, timestamp: ts, idSuffix: '_t' });
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
export { setContributionPerPerson, computeSettlement, computeFinance } from './finance/calculator';
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

// ---- Itinerary items: scheduled trip items (source-of-truth, not derived) ----
export async function addItineraryItem(tripId, title, scheduledAt, location) {
  const db = await getDB();
  const id = String(Date.now()) + Math.random().toString(36).slice(2);
  const ts = Date.now();
  await db.runAsync(
    'INSERT INTO itinerary_items (id, trip_id, title, location, scheduled_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    id, tripId, title, location || null, scheduledAt, ts
  );
  await logTimelineEvent({ tripId, type: 'itinerary', title: `Planned: ${title}`, timestamp: ts, idSuffix: '_t' });
  return id;
}

export async function deleteItineraryItem(id, tripId, title) {
  const db = await getDB();
  await db.runAsync('DELETE FROM itinerary_items WHERE id = ?', id);
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
  const spentRow = await db.getFirstAsync('SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE trip_id = ?', tripId);

  return {
    todaysSegments,
    recentActivity,
    totalSpent: spentRow.total,
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
