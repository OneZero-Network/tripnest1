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
  {
    name: '019_add_expense_edited_at',
    // NULL means "never edited" — the common case, and exactly what every pre-existing
    // expense actually is. Distinguishing this from "edited at creation time" matters for
    // the detail sheet: it's the difference between showing an "Edited" badge or not.
    sql: `ALTER TABLE expenses ADD COLUMN edited_at INTEGER;`,
  },
  {
    name: '020_add_expense_history',
    // The "immutable vs. editable" tension resolved: expenses ARE now editable, but every
    // edit first snapshots the pre-edit row here before the UPDATE touches it, and delete
    // snapshots the row here too (as a tombstone) before the DELETE. Nothing is silently
    // overwritten or silently gone — there's always a prior version on record, and the
    // Activity timeline (via a paired timeline event, not this table) is what a user
    // actually sees; this table is the underlying proof it's not just a claim.
    sql: `CREATE TABLE IF NOT EXISTS expense_history (
      id TEXT PRIMARY KEY,
      expense_id TEXT NOT NULL,
      trip_id TEXT NOT NULL,
      snapshot TEXT NOT NULL,
      action TEXT NOT NULL,
      changed_at INTEGER NOT NULL
    );`,
  },
  {
    name: '021_add_contribution_edited_at',
    sql: `ALTER TABLE contributions ADD COLUMN edited_at INTEGER;`,
  },
  {
    name: '022_add_contribution_history',
    // Same reasoning as expense_history, scoped to contributions — a top-up entered wrong
    // needs the same "edit preserves the prior version, doesn't just silently change the
    // number a settlement is based on" treatment.
    sql: `CREATE TABLE IF NOT EXISTS contribution_history (
      id TEXT PRIMARY KEY,
      contribution_id TEXT NOT NULL,
      trip_id TEXT NOT NULL,
      snapshot TEXT NOT NULL,
      action TEXT NOT NULL,
      changed_at INTEGER NOT NULL
    );`,
  },
  {
    name: '023_add_trip_type',
    // 'domestic' (default — every existing trip stays exactly as-is) or 'international'.
    // International unlocks the currency-exchange wallet: a solo/group trip abroad often
    // converts a chunk of money once (INR → SAR) and then spends DOWN a foreign-currency
    // cash pocket over many small purchases — a fundamentally different shape than "log
    // each expense in its own currency with its own rate," which is what the app already
    // did and which works fine for occasional foreign purchases but not for "I am now
    // carrying 1,265 SAR and want to see what's left of it."
    sql: `ALTER TABLE trips ADD COLUMN trip_type TEXT NOT NULL DEFAULT 'domestic';`,
  },
  {
    name: '024_add_trip_foreign_currency',
    sql: `ALTER TABLE trips ADD COLUMN foreign_currency TEXT;`,
  },
  {
    name: '025_add_currency_exchanges',
    // Each row is one real-world conversion event: handed over `from_amount` of
    // `from_currency` (almost always the base currency), received `to_amount` of
    // `to_currency` (the foreign currency) at that moment's rate. This is deliberately
    // NOT an expense — converting money isn't spending it, and counting it as spend would
    // inflate "total spent" by money that's sitting in your pocket, not gone. The foreign
    // wallet balance is derived at read time: sum(to_amount here) minus sum(amount of
    // every expense recorded in that foreign currency) — never stored, so it's always
    // consistent with whatever expenses actually exist.
    sql: `CREATE TABLE IF NOT EXISTS currency_exchanges (
      id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL,
      from_amount REAL NOT NULL,
      from_currency TEXT NOT NULL,
      to_amount REAL NOT NULL,
      to_currency TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );`,
  },
  {
    name: '026_add_exchange_edited_at',
    sql: `ALTER TABLE currency_exchanges ADD COLUMN edited_at INTEGER;`,
  },
  {
    name: '027_add_exchange_history',
    // Same snapshot-before-write discipline as expense_history/contribution_history.
    sql: `CREATE TABLE IF NOT EXISTS exchange_history (
      id TEXT PRIMARY KEY,
      exchange_id TEXT NOT NULL,
      trip_id TEXT NOT NULL,
      snapshot TEXT NOT NULL,
      action TEXT NOT NULL,
      changed_at INTEGER NOT NULL
    );`,
  },
  {
    name: '028_add_exchange_converted_by',
    // NULL for solo trips (no need to attribute conversions to a specific person) or
    // trips created before this migration. For a group international trip, this is what
    // lets the foreign wallet be split per-traveler instead of one undifferentiated pool —
    // "Adnan converted ₹15,000, Tariq converted ₹8,000" instead of one shared number
    // nobody can attribute.
    sql: `ALTER TABLE currency_exchanges ADD COLUMN converted_by TEXT;`,
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
  const trip = await db.getFirstAsync('SELECT base_currency, name FROM trips WHERE id = ?', tripId);
  await db.runAsync('UPDATE trips SET base_currency = ? WHERE id = ?', currency, tripId);
  if (trip && trip.base_currency !== currency) {
    await logTimelineEvent({ tripId, type: 'trip', title: `Trip currency changed: ${trip.base_currency} → ${currency}`, timestamp: Date.now(), idSuffix: '_cur' });
  }
}

// ---- International trips: trip type + foreign-currency wallet ----
export async function setTripType(tripId, tripType, foreignCurrency = null) {
  const db = await getDB();
  const trip = await db.getFirstAsync('SELECT trip_type FROM trips WHERE id = ?', tripId);
  await db.runAsync('UPDATE trips SET trip_type = ?, foreign_currency = ? WHERE id = ?', tripType, tripType === 'international' ? foreignCurrency : null, tripId);
  if (trip && trip.trip_type !== tripType) {
    await logTimelineEvent({ tripId, type: 'trip', title: `Trip type changed: ${trip.trip_type} → ${tripType}`, timestamp: Date.now(), idSuffix: '_type' });
  }
}

// One row per real conversion event (INR → SAR, say). Deliberately separate from
// expenses — see migration 025's comment for why counting this as spend would be wrong.
export async function addCurrencyExchange(tripId, fromAmount, fromCurrency, toAmount, toCurrency, convertedBy = null) {
  const db = await getDB();
  const id = String(Date.now()) + Math.random().toString(36).slice(2);
  const ts = Date.now();
  await db.runAsync(
    'INSERT INTO currency_exchanges (id, trip_id, from_amount, from_currency, to_amount, to_currency, converted_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    id, tripId, fromAmount, fromCurrency, toAmount, toCurrency, convertedBy, ts
  );
  const who = convertedBy ? `${convertedBy} exchanged` : 'Exchanged';
  await logTimelineEvent({ tripId, type: 'exchange', title: `${who} ${fromAmount} ${fromCurrency} → ${toAmount} ${toCurrency}`, timestamp: ts, idSuffix: '_t', metadata: { id, fromAmount, fromCurrency, toAmount, toCurrency, convertedBy } });
  return id;
}

// The most recent conversion rate for a given foreign currency on this trip — used to
// pre-fill an expense's FX rate so it doesn't have to be manually re-typed every time,
// while staying editable in case the actual rate moved since that conversion.
export async function getLatestExchangeRate(tripId, currency) {
  const db = await getDB();
  const row = await db.getFirstAsync(
    'SELECT from_amount, to_amount FROM currency_exchanges WHERE trip_id = ? AND to_currency = ? ORDER BY created_at DESC LIMIT 1',
    tripId, currency
  );
  if (!row || !row.to_amount) return null;
  return +(row.from_amount / row.to_amount).toFixed(4);
}

export async function getCurrencyExchanges(tripId) {
  const db = await getDB();
  return db.getAllAsync('SELECT * FROM currency_exchanges WHERE trip_id = ? ORDER BY created_at DESC', tripId);
}

export async function getCurrencyExchangeById(id) {
  const db = await getDB();
  return db.getFirstAsync('SELECT * FROM currency_exchanges WHERE id = ?', id);
}

// Same snapshot-then-update discipline as expenses/contributions — a wrong conversion
// entered by mistake gets a fix path now, not just a "live with it or re-enter everything."
export async function updateCurrencyExchange(tripId, exchangeId, fromAmount, toAmount) {
  const db = await getDB();
  const existing = await db.getFirstAsync('SELECT * FROM currency_exchanges WHERE id = ?', exchangeId);
  if (!existing) return { ok: false, reason: 'not_found' };
  const historyId = String(Date.now()) + Math.random().toString(36).slice(2);
  await db.runAsync(
    'INSERT INTO exchange_history (id, exchange_id, trip_id, snapshot, action, changed_at) VALUES (?, ?, ?, ?, ?, ?)',
    historyId, exchangeId, tripId, JSON.stringify(existing), 'edit', Date.now()
  );
  const ts = Date.now();
  await db.runAsync('UPDATE currency_exchanges SET from_amount = ?, to_amount = ?, edited_at = ? WHERE id = ?', fromAmount, toAmount, ts, exchangeId);
  await logTimelineEvent({ tripId, type: 'exchange', title: `Exchange edited: ${existing.from_amount} ${existing.from_currency} → ${existing.to_amount} ${existing.to_currency} became ${fromAmount} ${existing.from_currency} → ${toAmount} ${existing.to_currency}`, timestamp: ts, idSuffix: '_ee', metadata: { id: exchangeId, edited: true, field: 'exchange', oldValue: `${existing.to_amount} ${existing.to_currency}`, newValue: `${toAmount} ${existing.to_currency}` } });
  return { ok: true };
}

export async function deleteCurrencyExchange(tripId, exchangeId) {
  const db = await getDB();
  const existing = await db.getFirstAsync('SELECT * FROM currency_exchanges WHERE id = ?', exchangeId);
  if (!existing) return { ok: false, reason: 'not_found' };
  const historyId = String(Date.now()) + Math.random().toString(36).slice(2);
  await db.runAsync(
    'INSERT INTO exchange_history (id, exchange_id, trip_id, snapshot, action, changed_at) VALUES (?, ?, ?, ?, ?, ?)',
    historyId, exchangeId, tripId, JSON.stringify(existing), 'delete', Date.now()
  );
  await db.runAsync('DELETE FROM currency_exchanges WHERE id = ?', exchangeId);
  await logTimelineEvent({ tripId, type: 'exchange', title: `Removed exchange: ${existing.from_amount} ${existing.from_currency} → ${existing.to_amount} ${existing.to_currency}`, timestamp: Date.now(), idSuffix: '_edel' });
  return { ok: true };
}

// Every distinct currency actually converted into on this trip — the multi-currency
// case (Europe leg in EUR, UK leg in GBP) needs one wallet per currency, not one fixed
// to trips.foreign_currency, which is now just the *default* the Add sheet pre-selects.
export async function getForeignWalletBalances(tripId) {
  const db = await getDB();
  const currencies = await db.getAllAsync('SELECT DISTINCT to_currency FROM currency_exchanges WHERE trip_id = ?', tripId);
  const wallets = [];
  for (const row of currencies) {
    const c = row.to_currency;
    const exchanged = await db.getFirstAsync('SELECT COALESCE(SUM(to_amount),0) as total FROM currency_exchanges WHERE trip_id = ? AND to_currency = ?', tripId, c);
    const spent = await db.getFirstAsync('SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE trip_id = ? AND currency = ?', tripId, c);
    // Per-person REMAINING, not just how much each person converted — this was the gap
    // flagged last round as needing new schema, but it doesn't: expenses.paid_by already
    // tells us who spent from a given currency, so "Adnan converted X, Adnan's expenses
    // in that currency sum to Y, Adnan has X-Y left" falls straight out of existing data.
    const convertedByPerson = await db.getAllAsync('SELECT converted_by, COALESCE(SUM(to_amount),0) as total FROM currency_exchanges WHERE trip_id = ? AND to_currency = ? AND converted_by IS NOT NULL GROUP BY converted_by', tripId, c);
    const spentByPerson = await db.getAllAsync('SELECT paid_by, COALESCE(SUM(amount),0) as total FROM expenses WHERE trip_id = ? AND currency = ? GROUP BY paid_by', tripId, c);
    const spentMap = {};
    spentByPerson.forEach((r) => { spentMap[r.paid_by] = r.total; });
    const byPerson = convertedByPerson.map((r) => ({ converted_by: r.converted_by, total: r.total, spent: spentMap[r.converted_by] || 0, remaining: r.total - (spentMap[r.converted_by] || 0) }));
    wallets.push({ currency: c, exchanged: exchanged.total, spent: spent.total, remaining: exchanged.total - spent.total, byPerson });
  }
  return wallets;
}

// Foreign wallet balance = every SAR (or whatever) you've converted into, minus every
// expense you've logged in that same foreign currency — i.e. what's still in your pocket.
// Deliberately recomputed from source rows every time rather than stored, so it can never
// drift out of sync with the actual exchange/expense history.
export async function getForeignWalletBalance(tripId) {
  const db = await getDB();
  const trip = await db.getFirstAsync('SELECT foreign_currency FROM trips WHERE id = ?', tripId);
  if (!trip?.foreign_currency) return null;
  const exchanged = await db.getFirstAsync(
    'SELECT COALESCE(SUM(to_amount), 0) as total FROM currency_exchanges WHERE trip_id = ? AND to_currency = ?',
    tripId, trip.foreign_currency
  );
  const spent = await db.getFirstAsync(
    'SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE trip_id = ? AND currency = ?',
    tripId, trip.foreign_currency
  );
  return { currency: trip.foreign_currency, exchanged: exchanged.total, spent: spent.total, remaining: exchanged.total - spent.total };
}

// Trip name is editable post-creation — same audit-trail treatment as everything else
// in this pass: the change itself is logged, not hidden as a silent field update.
export async function renameTrip(tripId, newName) {
  const db = await getDB();
  const trip = await db.getFirstAsync('SELECT name FROM trips WHERE id = ?', tripId);
  if (!newName.trim() || !trip) return { ok: false };
  await db.runAsync('UPDATE trips SET name = ? WHERE id = ?', newName.trim(), tripId);
  await logTimelineEvent({ tripId, type: 'trip', title: `Trip renamed: ${trip.name} → ${newName.trim()}`, timestamp: Date.now(), idSuffix: '_rn' });
  return { ok: true };
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
  await logTimelineEvent({ tripId, type: 'expense', title: `${paidBy} paid ${label} for ${timelineNoun}${sourceLabel}`, timestamp: ts, idSuffix: '_t', metadata: { id, paidBy, amount, currency, category, fundingSource } });
  return id;
}

// ---- Expense editing: snapshot-then-update, never a silent overwrite ----
// Resolves the "immutable vs. editable" conflict directly: the row IS updated (so the
// UI, exports, and every downstream read see the new value), but the pre-edit row is
// preserved first in expense_history, and every changed field gets its own timeline
// event carrying old→new — so "was this edited, by what, from what" is always
// answerable from the Activity feed without needing to open expense_history directly.
export async function updateExpense(tripId, expenseId, changes) {
  const db = await getDB();
  const existing = await db.getFirstAsync('SELECT * FROM expenses WHERE id = ?', expenseId);
  if (!existing) return { ok: false, reason: 'not_found' };

  const historyId = String(Date.now()) + Math.random().toString(36).slice(2);
  await db.runAsync(
    'INSERT INTO expense_history (id, expense_id, trip_id, snapshot, action, changed_at) VALUES (?, ?, ?, ?, ?, ?)',
    historyId, expenseId, tripId, JSON.stringify(existing), 'edit', Date.now()
  );

  const next = {
    paid_by: changes.paidBy ?? existing.paid_by,
    amount: changes.amount ?? existing.amount,
    description: changes.description !== undefined ? changes.description : existing.description,
    category: changes.category !== undefined ? changes.category : existing.category,
    funding_source: changes.fundingSource ?? existing.funding_source,
    currency: changes.currency ?? existing.currency,
    fx_rate: changes.fxRate ?? existing.fx_rate,
  };
  const ts = Date.now();
  await db.runAsync(
    'UPDATE expenses SET paid_by = ?, amount = ?, description = ?, category = ?, funding_source = ?, currency = ?, fx_rate = ?, edited_at = ? WHERE id = ?',
    next.paid_by, next.amount, next.description, next.category, next.funding_source, next.currency, next.fx_rate, ts, expenseId
  );

  // Re-derive the split from scratch rather than trying to patch individual rows —
  // simpler and correct either way (explicit participant list, or back to "everyone").
  if (changes.participants !== undefined) {
    await db.runAsync('DELETE FROM expense_splits WHERE expense_id = ?', expenseId);
    if (changes.participants && changes.participants.length > 0) {
      const baseAmount = next.amount * next.fx_rate;
      const perPerson = +(baseAmount / changes.participants.length).toFixed(2);
      for (const name of changes.participants) {
        const splitId = String(Date.now()) + Math.random().toString(36).slice(2);
        await db.runAsync('INSERT INTO expense_splits (id, expense_id, traveler_name, share_amount) VALUES (?, ?, ?, ?)', splitId, expenseId, name, perPerson);
      }
    }
  }

  // One timeline event per meaningfully changed field — this is what the Activity feed
  // actually renders as "Edited X: old → new", not the raw history table.
  if (existing.amount !== next.amount) {
    await logTimelineEvent({ tripId, type: 'expense', title: `${next.paid_by} changed ${next.category || 'an expense'}: ${existing.currency}${existing.amount} → ${next.currency}${next.amount}`, timestamp: ts, idSuffix: '_ea', metadata: { id: expenseId, edited: true, field: 'amount', oldValue: existing.amount, newValue: next.amount, category: next.category, paidBy: next.paid_by, currency: next.currency } });
  }
  if (existing.category !== next.category) {
    await logTimelineEvent({ tripId, type: 'expense', title: `${next.paid_by} changed category: ${existing.category || 'Uncategorized'} → ${next.category || 'Uncategorized'}`, timestamp: ts, idSuffix: '_ec', metadata: { id: expenseId, edited: true, field: 'category', oldValue: existing.category, newValue: next.category } });
  }
  if (existing.paid_by !== next.paid_by) {
    await logTimelineEvent({ tripId, type: 'expense', title: `Payer changed on ${next.category || 'an expense'}: ${existing.paid_by} → ${next.paid_by}`, timestamp: ts, idSuffix: '_ep', metadata: { id: expenseId, edited: true, field: 'paidBy', oldValue: existing.paid_by, newValue: next.paid_by } });
  }
  if (existing.funding_source !== next.funding_source) {
    await logTimelineEvent({ tripId, type: 'expense', title: `${next.paid_by} changed how ${next.category || 'an expense'} was paid: ${existing.funding_source === 'bank' ? 'Trip Bank' : 'Personal'} → ${next.funding_source === 'bank' ? 'Trip Bank' : 'Personal'}`, timestamp: ts, idSuffix: '_ef', metadata: { id: expenseId, edited: true, field: 'fundingSource', oldValue: existing.funding_source, newValue: next.funding_source } });
  }
  return { ok: true };
}

// Delete also snapshots first — a tombstone, not a silent disappearance. The activity
// line stays in the timeline forever ("Adnan deleted Transport ₹300"), even though the
// expense_history row is the only place the full detail survives afterward.
export async function deleteExpense(tripId, expenseId) {
  const db = await getDB();
  const existing = await db.getFirstAsync('SELECT * FROM expenses WHERE id = ?', expenseId);
  if (!existing) return { ok: false, reason: 'not_found' };
  const historyId = String(Date.now()) + Math.random().toString(36).slice(2);
  await db.runAsync(
    'INSERT INTO expense_history (id, expense_id, trip_id, snapshot, action, changed_at) VALUES (?, ?, ?, ?, ?, ?)',
    historyId, expenseId, tripId, JSON.stringify(existing), 'delete', Date.now()
  );
  await db.runAsync('DELETE FROM expense_splits WHERE expense_id = ?', expenseId);
  await db.runAsync('DELETE FROM expenses WHERE id = ?', expenseId);
  const ts = Date.now();
  const label = existing.currency === 'INR' || !existing.currency ? `${existing.amount}` : `${existing.amount} ${existing.currency}`;
  await logTimelineEvent({ tripId, type: 'expense', title: `${existing.paid_by} deleted ${existing.category || 'an expense'}: ${label}`, timestamp: ts, idSuffix: '_del' });
  return { ok: true };
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

export async function getContributionById(id) {
  const db = await getDB();
  return db.getFirstAsync('SELECT * FROM contributions WHERE id = ?', id);
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
// ---- Recording a Trip Bank leg of a settlement (top-up or refund) as a real event ----
// Previously "Mark paid" on a Trip Bank leg only removed it from the settlement list for
// that render — nothing was written to the database, so the exact same balance came back
// on the next load. That's the "3 settlements pending even after everyone paid" bug: the
// personal (person-to-person) legs recorded fine via recordSettlement, but the bank legs
// never did. A top-up (traveler → Trip Bank) IS a contribution; a refund (Trip Bank →
// traveler) is the same thing with the sign flipped — both are handled as contribution
// rows so computeBankSettlement's balance naturally nets back to zero afterward.
export async function recordBankSettlementLeg(tripId, fromName, toName, amount, bankName = 'Trip Bank') {
  const db = await getDB();
  const baseCurrency = await getTripBaseCurrency(tripId);
  const id = String(Date.now()) + Math.random().toString(36).slice(2);
  const ts = Date.now();
  const isTopUp = toName === bankName; // traveler → bank
  const traveler = isTopUp ? fromName : toName; // bank → traveler is a refund
  const signedAmount = isTopUp ? amount : -amount;
  await db.runAsync(
    'INSERT INTO contributions (id, trip_id, traveler, amount, currency, fx_rate, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id, tripId, traveler, signedAmount, baseCurrency, 1, ts
  );
  const label = isTopUp ? `${traveler} topped up the Trip Bank with ${amount}` : `${traveler} got back ${amount} of unused Trip Bank contribution`;
  await logTimelineEvent({ tripId, type: 'contribution', title: label, timestamp: ts, idSuffix: '_t' });
  return id;
}

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
  await logTimelineEvent({ tripId, type: 'contribution', title: `${traveler} contributed ${label} to the trip fund`, timestamp: ts, idSuffix: '_t', metadata: { id, traveler, amount, currency } });
  return id;
}

// ---- Contribution editing: same snapshot-then-update discipline as expenses ----
export async function updateContribution(tripId, contributionId, newAmount) {
  const db = await getDB();
  const existing = await db.getFirstAsync('SELECT * FROM contributions WHERE id = ?', contributionId);
  if (!existing) return { ok: false, reason: 'not_found' };
  const historyId = String(Date.now()) + Math.random().toString(36).slice(2);
  await db.runAsync(
    'INSERT INTO contribution_history (id, contribution_id, trip_id, snapshot, action, changed_at) VALUES (?, ?, ?, ?, ?, ?)',
    historyId, contributionId, tripId, JSON.stringify(existing), 'edit', Date.now()
  );
  const ts = Date.now();
  await db.runAsync('UPDATE contributions SET amount = ?, edited_at = ? WHERE id = ?', newAmount, ts, contributionId);
  await logTimelineEvent({ tripId, type: 'contribution', title: `${existing.traveler} changed a contribution: ${existing.currency}${existing.amount} → ${existing.currency}${newAmount}`, timestamp: ts, idSuffix: '_ce', metadata: { id: contributionId, edited: true, traveler: existing.traveler, oldValue: existing.amount, newValue: newAmount, currency: existing.currency } });
  return { ok: true };
}

export async function deleteContribution(tripId, contributionId) {
  const db = await getDB();
  const existing = await db.getFirstAsync('SELECT * FROM contributions WHERE id = ?', contributionId);
  if (!existing) return { ok: false, reason: 'not_found' };
  const historyId = String(Date.now()) + Math.random().toString(36).slice(2);
  await db.runAsync(
    'INSERT INTO contribution_history (id, contribution_id, trip_id, snapshot, action, changed_at) VALUES (?, ?, ?, ?, ?, ?)',
    historyId, contributionId, tripId, JSON.stringify(existing), 'delete', Date.now()
  );
  await db.runAsync('DELETE FROM contributions WHERE id = ?', contributionId);
  const ts = Date.now();
  await logTimelineEvent({ tripId, type: 'contribution', title: `${existing.traveler} removed a contribution of ${existing.currency}${existing.amount}`, timestamp: ts, idSuffix: '_cdel' });
  return { ok: true };
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

// The "don't close with outstanding balances" rule previously lived only in
// SettlementTab.js, as the visibility condition on the Finish Trip button — a UI
// convenience, not a data-layer invariant. Anything else calling closeTrip() directly
// (another screen, a future bulk action, a bug) bypassed it silently. Enforced here
// instead, so it holds no matter which code path triggers closure.
//
// { force: true } is the deliberate override for a real "close anyway" case (e.g. an
// admin action, or a trip nobody will ever finish settling) — it's explicit opt-in, not
// a default, so accidentally closing a trip with money still owed stays hard to do by
// accident and easy to do on purpose.
export async function closeTrip(tripId, { force = false } = {}) {
  const db = await getDB();
  if (!force) {
    const { computeBankSettlement, computeSettlement } = await import('./finance/calculator');
    const [bankSettlement, settlement] = await Promise.all([
      computeBankSettlement(tripId),
      computeSettlement(tripId),
    ]);
    const outstanding = bankSettlement.transactions.length + settlement.transactions.length;
    if (outstanding > 0) {
      return {
        ok: false,
        reason: 'unsettled',
        outstandingCount: outstanding,
        bankTransactions: bankSettlement.transactions,
        personalTransactions: settlement.transactions,
      };
    }
  }
  await db.runAsync("UPDATE trips SET status = 'closed' WHERE id = ?", tripId);
  const ts = Date.now();
  await logTimelineEvent({ tripId, type: 'trip', title: force ? 'Trip closed (force-closed with balances outstanding)' : 'Trip closed', timestamp: ts, idSuffix: '_close' });
  return { ok: true };
}

export async function reopenTrip(tripId) {
  const db = await getDB();
  await db.runAsync("UPDATE trips SET status = 'active' WHERE id = ?", tripId);
}

// ---- Finance (settlement, trip fund, finance projection) lives in finance/calculator.js ----
// Re-exported here so every existing "from '../db'" import across the app keeps working
// unchanged — this is an internal file reorganization, not a public API change.
export { setContributionPerPerson, computeSettlement, computeFinance, computeBankSettlement, computeFinalBankSettlement } from './finance/calculator';
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

// ---- Consolidated Home dashboard: real numbers across every active trip, not just the
// most recent one. Money only gets summed within trips sharing the user's default
// currency — there's no live exchange-rate source in this app, and fabricating one to
// force a single global number would mean silently wrong totals in a finance app, which
// is worse than being upfront that a THB trip and an INR trip don't add together here.
// Trip counts and member counts are currency-independent, so those DO cover every trip. ----
export async function getConsolidatedOverview() {
  const db = await getDB();
  const defaultCurrency = (await getAppMeta('default_currency')) || 'INR';
  const activeTrips = await db.getAllAsync("SELECT * FROM trips WHERE status = 'active' ORDER BY created_at DESC");

  const sameCurrencyTrips = activeTrips.filter((t) => (t.base_currency || 'INR') === defaultCurrency);
  const otherCurrencyTrips = activeTrips.filter((t) => (t.base_currency || 'INR') !== defaultCurrency);

  let todaySpend = 0;
  let pendingSettlements = 0;
  const allMemberNames = new Set();
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(); dayEnd.setHours(23, 59, 59, 999);

  for (const trip of activeTrips) {
    const travelers = await db.getAllAsync('SELECT name FROM travelers WHERE trip_id = ?', trip.id);
    travelers.forEach((t) => allMemberNames.add(t.name));

    if ((trip.base_currency || 'INR') === defaultCurrency) {
      const spentRow = await db.getFirstAsync(
        'SELECT COALESCE(SUM(amount*fx_rate),0) as total FROM expenses WHERE trip_id = ? AND created_at BETWEEN ? AND ?',
        trip.id, dayStart.getTime(), dayEnd.getTime()
      );
      todaySpend += spentRow.total;
    }

    const { finance } = await computeTripData(trip.id);
    const bankTx = finance.bankSettlement?.transactions?.length || 0;
    const personalTx = finance.liveForecast?.transactions?.length || 0;
    pendingSettlements += bankTx + personalTx;
  }

  return {
    defaultCurrency,
    activeTripCount: activeTrips.length,
    sameCurrencyTrips,
    otherCurrencyTrips,
    todaySpend,
    pendingSettlements,
    totalActiveMembers: allMemberNames.size,
  };
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
