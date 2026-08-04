// Finance module: settlement, trip fund, and finance projection logic, separated from
// db.js's general schema/query concerns per the "finance calculations separate from UI
// and from the rest of the database layer" direction. db.js re-exports these so no other
// file's imports had to change — this is an internal reorganization, not a public API change.
import { getDB } from '../db';

// Trip Fund target: equal split only for V2 — Number of Travelers × Contribution Per Person.
// Organizer sets the per-person amount; target is always derived from current traveler count,
// so it stays correct automatically if travelers are added/removed (no stale stored total).
export async function setContributionPerPerson(tripId, amount) {
  const db = await getDB();
  await db.runAsync('UPDATE trips SET contribution_per_person = ? WHERE id = ?', amount, tripId);
}

// Settlements are derived, never stored — recomputed from expenses every time.
export async function computeSettlement(tripId) {
  const db = await getDB();
  const travelers = await db.getAllAsync('SELECT * FROM travelers WHERE trip_id = ?', tripId);
  const expenses = await db.getAllAsync('SELECT * FROM expenses WHERE trip_id = ?', tripId);
  if (travelers.length === 0) return { balances: {}, transactions: [] };

  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const share = total / travelers.length;
  const paidByPerson = {};
  travelers.forEach(t => (paidByPerson[t.name] = 0));
  expenses.forEach(e => (paidByPerson[e.paid_by] = (paidByPerson[e.paid_by] || 0) + e.amount));

  const balances = {};
  travelers.forEach(t => (balances[t.name] = +(paidByPerson[t.name] - share).toFixed(2)));

  // Greedy settlement: minimize number of transactions
  const debtors = Object.entries(balances).filter(([, v]) => v < -0.01).map(([n, v]) => [n, -v]);
  const creditors = Object.entries(balances).filter(([, v]) => v > 0.01).map(([n, v]) => [n, v]);
  const transactions = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const [dName, dAmt] = debtors[i];
    const [cName, cAmt] = creditors[j];
    const amt = Math.min(dAmt, cAmt);
    transactions.push({ from: dName, to: cName, amount: +amt.toFixed(2) });
    debtors[i][1] -= amt;
    creditors[j][1] -= amt;
    if (debtors[i][1] < 0.01) i++;
    if (creditors[j][1] < 0.01) j++;
  }
  return { balances, transactions };
}

// ---- Finance: projection over contributions + expenses, no new derived storage ----
// "Live Forecast" and "Final Settlement" are the SAME computation (computeSettlement) —
// the only difference is a status gate, not different math. Keeping them as one function
// avoids two settlement algorithms silently drifting apart.
export async function computeFinance(tripId, precomputedSettlement = null) {
  const db = await getDB();
  const trip = await db.getFirstAsync('SELECT * FROM trips WHERE id = ?', tripId);
  const travelerCount = (await db.getFirstAsync('SELECT COUNT(*) as c FROM travelers WHERE trip_id = ?', tripId)).c;
  const contribRows = await db.getAllAsync('SELECT * FROM contributions WHERE trip_id = ? ORDER BY created_at DESC', tripId);
  const totalReceived = contribRows.reduce((s, c) => s + c.amount, 0);
  const spentRow = await db.getFirstAsync('SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE trip_id = ?', tripId);
  const totalSpent = spentRow.total;
  const currentCash = totalReceived - totalSpent;
  const settlement = precomputedSettlement ?? await computeSettlement(tripId);
  const perPerson = trip?.contribution_per_person ?? null;
  const fundTarget = perPerson != null ? perPerson * travelerCount : null;

  return {
    tripStatus: trip?.status || 'active',
    contributions: contribRows,
    totalReceived,
    totalSpent,
    currentCash,
    perPerson,
    fundTarget,
    travelerCount,
    liveForecast: settlement,
    finalSettlement: trip?.status === 'closed' ? settlement : null,
  };
}
