// Shared setup for the finance test suite. Mirrors exactly what CreateTripScreen.js does
// (trip + traveler rows inserted directly — there is no exported createTrip() in db.js,
// trip creation lives in the screen), so tests exercise the same writes the real app
// performs rather than a parallel test-only path.
import { getDB } from '../db.js';

let counter = 0;
function uid() {
  counter += 1;
  return `t${Date.now()}_${counter}_${Math.random().toString(36).slice(2)}`;
}

export async function createTrip({
  name = 'Test Trip',
  baseCurrency = 'INR',
  hasTripBank = true,
  tripType = 'domestic',
  foreignCurrency = null,
  travelers = [],
} = {}) {
  const db = await getDB();
  const id = uid();
  const ts = Date.now();
  await db.runAsync(
    'INSERT INTO trips (id, name, base_currency, has_trip_bank, trip_type, foreign_currency, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id, name, baseCurrency, hasTripBank ? 1 : 0, tripType, tripType === 'international' ? foreignCurrency : null, ts
  );
  for (const t of travelers) {
    await db.runAsync('INSERT INTO travelers (id, trip_id, name) VALUES (?, ?, ?)', uid(), id, t);
  }
  return id;
}

export async function getTrip(tripId) {
  const db = await getDB();
  return db.getFirstAsync('SELECT * FROM trips WHERE id = ?', tripId);
}

export async function getTimeline(tripId) {
  const db = await getDB();
  return db.getAllAsync('SELECT * FROM timeline WHERE trip_id = ? ORDER BY created_at ASC, rowid ASC', tripId);
}
