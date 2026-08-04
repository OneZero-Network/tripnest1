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

// ---- THE SETTLEMENT MODEL ----
// Every expense is one of two kinds, and they settle completely differently:
//   'bank'     — paid out of the shared Trip Bank (the pooled contributions). This is a
//                collective cost; it changes the bank's balance, not any individual's.
//   'personal' — a traveler paid out of their own pocket, expecting to be repaid directly
//                by whoever benefited. This never touches the bank.
// Conflating these into one pool (the old model) is exactly what produced a confusing
// "current balance: -300" on a trip where nobody had contributed anything to a shared
// fund yet — that number was mixing "the bank is short" with "someone's owed money
// personally," which are different problems with different fixes.
//
// So there are two independent computations below:
//   computeBankSettlement  — Trip Bank ↔ Person (contributions in, bank-funded spend out)
//   computeSettlement      — Person ↔ Person (personal-expense peer-to-peer, unchanged
//                             algorithm, just scoped to funding_source = 'personal' now)

// Trip Bank ↔ Person: each traveler's bank balance is what they put in minus their equal
// share of bank-funded spend. Positive = the bank owes them a refund. Negative = they owe
// the bank. This is a hub, not peer-to-peer, so there's no matching algorithm needed —
// every imbalance is directly between one traveler and "Trip Bank."
export async function computeBankSettlement(tripId) {
  const db = await getDB();
  const travelers = await db.getAllAsync('SELECT * FROM travelers WHERE trip_id = ?', tripId);
  const contributions = await db.getAllAsync('SELECT * FROM contributions WHERE trip_id = ?', tripId);
  const bankExpenses = await db.getAllAsync("SELECT * FROM expenses WHERE trip_id = ? AND funding_source = 'bank'", tripId);
  if (travelers.length === 0) return { balances: {}, transactions: [] };

  const bankSpent = bankExpenses.reduce((s, e) => s + e.amount * e.fx_rate, 0);
  const share = bankSpent / travelers.length;

  const contributedByPerson = {};
  travelers.forEach(t => (contributedByPerson[t.name] = 0));
  contributions.forEach(c => {
    if (contributedByPerson[c.traveler] != null) contributedByPerson[c.traveler] += c.amount * c.fx_rate;
  });

  const balances = {};
  travelers.forEach(t => (balances[t.name] = +(contributedByPerson[t.name] - share).toFixed(2)));

  const transactions = [];
  Object.entries(balances).forEach(([name, bal]) => {
    if (bal > 0.01) transactions.push({ from: 'Trip Bank', to: name, amount: +bal.toFixed(2) });
    else if (bal < -0.01) transactions.push({ from: name, to: 'Trip Bank', amount: +(-bal).toFixed(2) });
  });

  return { balances, transactions };
}

// Person ↔ Person: unchanged greedy-settlement algorithm, now scoped to only the expenses
// a traveler paid personally (funding_source = 'personal') — bank-funded expenses are
// handled entirely by computeBankSettlement above and must not double-count here.
//
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
  const expenses = await db.getAllAsync("SELECT * FROM expenses WHERE trip_id = ? AND funding_source = 'personal'", tripId);
  const settlementRows = await db.getAllAsync('SELECT * FROM settlements WHERE trip_id = ?', tripId);
  if (travelers.length === 0) return { balances: {}, transactions: [], settledTransactions: settlementRows, orphanedPayers: [] };

  const total = expenses.reduce((s, e) => s + e.amount * e.fx_rate, 0);
  const share = total / travelers.length;
  const paidByPerson = {};
  const travelerNames = new Set(travelers.map(t => t.name));
  travelers.forEach(t => (paidByPerson[t.name] = 0));

  // An expense paid by someone not in the current travelers list (stale data from before
  // the payer field was locked to real travelers, or a traveler removed after the fact)
  // has nowhere to go in the balance math below — silently dropping that money would make
  // the settlement wrong without any sign that it happened, which is exactly what
  // produced "all settled up" while every real traveler still showed a negative balance.
  // Tracked here and surfaced to the UI instead of swallowed.
  const orphanedTotals = {};
  expenses.forEach(e => {
    const amt = e.amount * e.fx_rate;
    if (travelerNames.has(e.paid_by)) {
      paidByPerson[e.paid_by] += amt;
    } else {
      orphanedTotals[e.paid_by] = (orphanedTotals[e.paid_by] || 0) + amt;
    }
  });
  const orphanedPayers = Object.entries(orphanedTotals).map(([name, amount]) => ({ name, amount: +amount.toFixed(2) }));

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
  return { balances, transactions, settledTransactions: settlementRows, orphanedPayers };
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
  const bankSpentRow = await db.getFirstAsync("SELECT COALESCE(SUM(amount * fx_rate),0) as total FROM expenses WHERE trip_id = ? AND funding_source = 'bank'", tripId);
  const personalSpentRow = await db.getFirstAsync("SELECT COALESCE(SUM(amount * fx_rate),0) as total FROM expenses WHERE trip_id = ? AND funding_source = 'personal'", tripId);
  const bankSpent = bankSpentRow.total;
  const personalSpent = personalSpentRow.total;
  const totalSpent = bankSpent + personalSpent;
  // "Current balance" is the Trip Bank's own cash position — contributions in, bank-funded
  // spend out. Personal expenses don't touch it; they're a separate peer-to-peer matter,
  // which is exactly the distinction the old single-bucket model was missing.
  const currentCash = totalReceived - bankSpent;
  const settlement = precomputedSettlement ?? await computeSettlement(tripId);
  const bankSettlement = await computeBankSettlement(tripId);
  const perPerson = trip?.contribution_per_person ?? null;
  const fundTarget = perPerson != null ? perPerson * travelerCount : null;

  return {
    tripStatus: trip?.status || 'active',
    custodian: trip?.custodian || null,
    baseCurrency: trip?.base_currency || 'INR',
    contributions: contribRows,
    totalReceived,
    totalSpent,
    bankSpent,
    personalSpent,
    currentCash,
    perPerson,
    fundTarget,
    travelerCount,
    liveForecast: settlement,
    finalSettlement: trip?.status === 'closed' ? settlement : null,
    bankSettlement,
  };
}
