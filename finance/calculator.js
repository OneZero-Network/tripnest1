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

// ---- Per-expense share computation ----
// Each expense owes its share to either an explicit set of participants (expense_splits
// rows — "only these 3 people split this one") or, when none exist, equally to every
// CURRENT traveler — the original behavior, preserved exactly for every expense recorded
// before per-expense splitting existed. Mixing both kinds of expense within the same trip
// is the normal case, not an edge case: most expenses split evenly across everyone, a few
// don't, and the math below handles that per-expense, not as one flat trip-wide division.
async function computeExpenseShares(db, expenses, travelerNames) {
  const paidByPerson = {};
  const owedByPerson = {};
  travelerNames.forEach((n) => { paidByPerson[n] = 0; owedByPerson[n] = 0; });
  const orphanedTotals = {};

  let splitsByExpense = {};
  const expenseIds = expenses.map((e) => e.id);
  if (expenseIds.length > 0) {
    const placeholders = expenseIds.map(() => '?').join(',');
    const splitRows = await db.getAllAsync(`SELECT * FROM expense_splits WHERE expense_id IN (${placeholders})`, ...expenseIds);
    splitRows.forEach((r) => {
      if (!splitsByExpense[r.expense_id]) splitsByExpense[r.expense_id] = [];
      splitsByExpense[r.expense_id].push(r);
    });
  }

  expenses.forEach((e) => {
    const baseAmt = e.amount * e.fx_rate;
    if (travelerNames.has(e.paid_by)) {
      paidByPerson[e.paid_by] += baseAmt;
    } else {
      // An expense paid by someone not in the current travelers list (stale data from
      // before the payer field was locked to real travelers, or a traveler removed after
      // the fact) has nowhere to go in the balance math — silently dropping that money
      // would make the settlement wrong with no sign it happened, which is exactly what
      // produced "all settled up" while every real traveler still showed a negative
      // balance. Tracked here and surfaced to the UI instead of swallowed.
      orphanedTotals[e.paid_by] = (orphanedTotals[e.paid_by] || 0) + baseAmt;
    }

    const explicitSplits = splitsByExpense[e.id];
    if (explicitSplits && explicitSplits.length > 0) {
      explicitSplits.forEach((s) => {
        if (owedByPerson[s.traveler_name] != null) owedByPerson[s.traveler_name] += s.share_amount;
      });
    } else if (travelerNames.size > 0) {
      const share = baseAmt / travelerNames.size;
      travelerNames.forEach((n) => { owedByPerson[n] += share; });
    }
  });

  const orphanedPayers = Object.entries(orphanedTotals).map(([name, amount]) => ({ name, amount: +amount.toFixed(2) }));
  return { paidByPerson, owedByPerson, orphanedPayers };
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

// Trip Bank ↔ Person: each traveler's bank balance is what they put in minus their share
// of bank-funded spend (per-expense, via computeExpenseShares — equal among all unless an
// expense named specific participants). Positive = the bank owes them a refund. Negative =
// they owe the bank. This is a hub, not peer-to-peer, so there's no matching algorithm
// needed — every imbalance is directly between one traveler and "Trip Bank."
export async function computeBankSettlement(tripId) {
  const db = await getDB();
  const travelers = await db.getAllAsync('SELECT * FROM travelers WHERE trip_id = ?', tripId);
  const contributions = await db.getAllAsync('SELECT * FROM contributions WHERE trip_id = ?', tripId);
  const bankExpenses = await db.getAllAsync("SELECT * FROM expenses WHERE trip_id = ? AND funding_source = 'bank'", tripId);
  if (travelers.length === 0) return { balances: {}, transactions: [], sharedSpendByPerson: {} };

  const travelerNames = new Set(travelers.map((t) => t.name));
  // A solo trip has nobody to settle with — the one traveler IS the Trip Bank, so a
  // mismatch between what they contributed and what they spent isn't really a debt,
  // it's just their own money moving between two pockets. Without this, a solo trip
  // could show a permanent "owes ₹X" that no one could ever actually pay off to
  // anyone, which is exactly the "trip never finishes" bug this guards against.
  if (travelers.length <= 1) {
    const balances = {};
    travelers.forEach((t) => (balances[t.name] = 0));
    return { balances, transactions: [], sharedSpendByPerson: {} };
  }
  const { owedByPerson } = await computeExpenseShares(db, bankExpenses, travelerNames);

  const contributedByPerson = {};
  travelers.forEach((t) => (contributedByPerson[t.name] = 0));
  contributions.forEach((c) => {
    if (contributedByPerson[c.traveler] != null) contributedByPerson[c.traveler] += c.amount * c.fx_rate;
  });

  const balances = {};
  travelers.forEach((t) => (balances[t.name] = +(contributedByPerson[t.name] - owedByPerson[t.name]).toFixed(2)));

  const transactions = [];
  Object.entries(balances).forEach(([name, bal]) => {
    if (bal > 0.01) transactions.push({ from: 'Trip Bank', to: name, amount: +bal.toFixed(2) });
    else if (bal < -0.01) transactions.push({ from: name, to: 'Trip Bank', amount: +(-bal).toFixed(2) });
  });

  // Each person's share of bank-funded spend — "Shared Spend" on Members, distinct from
  // what they personally paid out of pocket. Exposed here rather than making Members
  // re-derive it, since this is the one place that already computes it correctly.
  return { balances, transactions, sharedSpendByPerson: owedByPerson };
}

// FINAL Trip Bank settlement — used only once a trip is closed. This is a genuine
// reconciliation with the founding settlement model, not a reversal of it: the three
// outcomes (Trip Bank→Person, Person→Trip Bank, Person→Person) are all correct WHILE a
// trip is active — someone topping up a shortfall mid-trip is paying into a pool that's
// still actively being spent from, which is exactly what the Trip Bank is for. But once a
// trip is closed, "Trip Bank" stops being a place money is still flowing through — it's
// just a number that needs to be zeroed out. Asking someone to "pay the wallet" at that
// point has no real-world action behind it; there's no custodian left to hand cash to for
// a trip that's over. So at closure specifically, any Person→Trip Bank shortfalls get
// matched directly against Trip Bank→Person refunds using the same greedy algorithm as
// personal settlement — real people paying real people. Only a genuine unmatched surplus
// (the bank has real leftover cash with nobody left who owes it) still comes from Trip
// Bank, since that money has to come from somewhere real: the custodian's own pocket.
export async function computeFinalBankSettlement(tripId) {
  const db = await getDB();
  const trip = await db.getFirstAsync('SELECT custodian FROM trips WHERE id = ?', tripId);
  // If a custodian is named, use their real name for the leftover case instead of the
  // abstract "Trip Bank" label — the custodian IS a real person physically holding that
  // cash, so naming them directly keeps this a genuine Person↔Person transaction rather
  // than one involving an entity that isn't a person. Falls back to "Trip Bank" only when
  // no custodian was ever set, since there's no real name available to use instead.
  const bankName = trip?.custodian || 'Trip Bank';
  const { balances } = await computeBankSettlement(tripId);

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
  // Anything left over after matching real people against each other is a genuine
  // surplus or shortfall — real leftover cash that needs to go somewhere real, or a real
  // funding gap someone needs to cover. Routed to the custodian by name when known.
  while (i < debtors.length) { transactions.push({ from: debtors[i][0], to: bankName, amount: +debtors[i][1].toFixed(2) }); i++; }
  while (j < creditors.length) { transactions.push({ from: bankName, to: creditors[j][0], amount: +creditors[j][1].toFixed(2) }); j++; }

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

  const travelerNames = new Set(travelers.map((t) => t.name));
  // Same reasoning as computeBankSettlement: one traveler has no one to owe or be owed
  // by, so personal-expense settlement is a no-op for a solo trip.
  if (travelers.length <= 1) {
    const balances = {};
    travelers.forEach((t) => (balances[t.name] = 0));
    return { balances, transactions: [], settledTransactions: settlementRows, orphanedPayers: [] };
  }
  const { paidByPerson, owedByPerson, orphanedPayers } = await computeExpenseShares(db, expenses, travelerNames);

  const balances = {};
  travelers.forEach((t) => (balances[t.name] = +(paidByPerson[t.name] - owedByPerson[t.name]).toFixed(2)));

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
  // Only computed when actually needed — closed trips are the exception, not the common
  // case, and this does its own extra querying (custodian lookup, re-deriving balances).
  const finalBankSettlement = trip?.status === 'closed' ? await computeFinalBankSettlement(tripId) : null;
  const perPerson = trip?.contribution_per_person ?? null;
  const fundTarget = perPerson != null ? perPerson * travelerCount : null;

  // Foreign wallets: one per currency actually converted into on this trip — not just
  // the trip's single default `foreign_currency`. A Europe-then-UK trip converts into
  // both EUR and GBP; each needs its own "how much is left" number, so this is computed
  // from every distinct to_currency seen in currency_exchanges, not a fixed column.
  let foreignWallets = [];
  if (trip?.trip_type === 'international') {
    const currencies = await db.getAllAsync('SELECT DISTINCT to_currency FROM currency_exchanges WHERE trip_id = ?', tripId);
    for (const row of currencies) {
      const c = row.to_currency;
      const exchanged = await db.getFirstAsync('SELECT COALESCE(SUM(to_amount),0) as total FROM currency_exchanges WHERE trip_id = ? AND to_currency = ?', tripId, c);
      const fxSpent = await db.getFirstAsync('SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE trip_id = ? AND currency = ?', tripId, c);
      const convertedByPerson = await db.getAllAsync('SELECT converted_by, COALESCE(SUM(to_amount),0) as total FROM currency_exchanges WHERE trip_id = ? AND to_currency = ? AND converted_by IS NOT NULL GROUP BY converted_by', tripId, c);
      const spentByPerson = await db.getAllAsync('SELECT paid_by, COALESCE(SUM(amount),0) as total FROM expenses WHERE trip_id = ? AND currency = ? GROUP BY paid_by', tripId, c);
      const spentMap = {};
      spentByPerson.forEach((r) => { spentMap[r.paid_by] = r.total; });
      const byPerson = convertedByPerson.map((r) => ({ converted_by: r.converted_by, total: r.total, spent: spentMap[r.converted_by] || 0, remaining: r.total - (spentMap[r.converted_by] || 0) }));
      foreignWallets.push({ currency: c, exchanged: exchanged.total, spent: fxSpent.total, remaining: exchanged.total - fxSpent.total, byPerson });
    }
  }
  // Kept for anything still reading the singular field — the trip's default currency's
  // wallet, or null if nothing's been converted into it yet.
  const foreignWallet = foreignWallets.find((w) => w.currency === trip?.foreign_currency) || null;

  return {
    tripStatus: trip?.status || 'active',
    custodian: trip?.custodian || null,
    hasTripBank: trip?.has_trip_bank !== 0,
    baseCurrency: trip?.base_currency || 'INR',
    tripType: trip?.trip_type || 'domestic',
    foreignCurrency: trip?.foreign_currency || null,
    foreignWallet,
    foreignWallets,
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
    finalBankSettlement,
  };
}
