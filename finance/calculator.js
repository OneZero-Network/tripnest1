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

// Balances are derived from expenses every time — never stored. Recorded settlements
// (real "X paid Y" transfers) ARE stored, since they represent something that actually
// happened rather than something computed; they get netted in below so a paid transaction
// stops showing up as outstanding on the next computation.
//
// CURRENCY: all math here happens in the trip's base currency. Every expense/contribution
// carries its own currency + fx_rate (rate to base, captured at entry time, never looked
// up live — so a trip's settlement stays reproducible regardless of when it's computed).
// amount * fx_rate is the base-currency value; that's what every calculation below uses,
// never the raw `amount` column alone.
export async function computeSettlement(tripId) {
  const db = await getDB();
  const travelers = await db.getAllAsync('SELECT * FROM travelers WHERE trip_id = ?', tripId);
  const expenses = await db.getAllAsync('SELECT * FROM expenses WHERE trip_id = ?', tripId);
  const settlementRows = await db.getAllAsync('SELECT * FROM settlements WHERE trip_id = ?', tripId);
  if (travelers.length === 0) return { balances: {}, transactions: [], settledTransactions: settlementRows };

  const total = expenses.reduce((s, e) => s + e.amount * e.fx_rate, 0);
  const share = total / travelers.length;
  const paidByPerson = {};
  travelers.forEach(t => (paidByPerson[t.name] = 0));
  expenses.forEach(e => (paidByPerson[e.paid_by] = (paidByPerson[e.paid_by] || 0) + e.amount * e.fx_rate));

  const balances = {};
  travelers.forEach(t => (balances[t.name] = +(paidByPerson[t.name] - share).toFixed(2)));

  // Net out recorded settlements before computing who-owes-whom: a settlement from X to Y
  // means X has already covered part of what they owed, so it raises X's balance and
  // lowers Y's by the same amount, exactly as if X had paid an expense worth that much.
  settlementRows.forEach((s) => {
    if (balances[s.from_traveler] != null) balances[s.from_traveler] = +(balances[s.from_traveler] + s.amount).toFixed(2);
    if (balances[s.to_traveler] != null) balances[s.to_traveler] = +(balances[s.to_traveler] - s.amount).toFixed(2);
  });

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
  return { balances, transactions, settledTransactions: settlementRows };
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
  // Base-currency totals: SUM(amount) alone would silently mix currencies if any expense
  // or contribution was entered in something other than the trip's base currency —
  // SUM(amount * fx_rate) is the actual base-currency value in every case, including the
  // common one where fx_rate is just 1.
  const totalReceived = contribRows.reduce((s, c) => s + c.amount * c.fx_rate, 0);
  const spentRow = await db.getFirstAsync('SELECT COALESCE(SUM(amount * fx_rate),0) as total FROM expenses WHERE trip_id = ?', tripId);
  const totalSpent = spentRow.total;
  const currentCash = totalReceived - totalSpent;
  const settlement = precomputedSettlement ?? await computeSettlement(tripId);
  const perPerson = trip?.contribution_per_person ?? null;
  const fundTarget = perPerson != null ? perPerson * travelerCount : null;

  return {
    tripStatus: trip?.status || 'active',
    custodian: trip?.custodian || null,
    baseCurrency: trip?.base_currency || 'INR',
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
