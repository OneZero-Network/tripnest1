import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  addExpense, addContribution, recordSettlement, closeTrip, reopenTrip,
  computeFinance, getNotificationFeed, getConsolidatedOverview,
  addCurrencyExchange, addItineraryItem, deleteTrip, getDB,
} from '../db.js';
import { createTrip } from '../test-utils/helpers.js';

describe('Lifecycle — solo trip', () => {
  test('solo trip with expenses has zero outstanding balance and can finish', async () => {
    const tripId = await createTrip({ travelers: ['A'] });
    await addExpense(tripId, 'A', 500, 'Solo dinner', { fundingSource: 'personal' });
    const finance = await computeFinance(tripId);
    assert.equal(finance.liveForecast.transactions.length, 0);
    const result = await closeTrip(tripId);
    assert.equal(result.ok, true);
    const closed = await computeFinance(tripId);
    assert.equal(closed.tripStatus, 'closed');
  });

  test('solo trip with no expenses closes cleanly', async () => {
    const tripId = await createTrip({ travelers: ['A'] });
    const result = await closeTrip(tripId);
    assert.equal(result.ok, true);
  });

  test('solo trip with shared cash / remaining bank balance still closes (no one to owe)', async () => {
    const tripId = await createTrip({ travelers: ['A'] });
    await addContribution(tripId, 'A', 1000);
    await addExpense(tripId, 'A', 400, 'Groceries', { fundingSource: 'bank' });
    const result = await closeTrip(tripId);
    assert.equal(result.ok, true, JSON.stringify(result));
  });
});

describe('Lifecycle — group trip, full flow', () => {
  test('create → contributions → expenses → settlement → all settled → close', async () => {
    const tripId = await createTrip({ travelers: ['A', 'B'] });
    await addContribution(tripId, 'A', 500);
    await addContribution(tripId, 'B', 500);
    await addExpense(tripId, 'A', 1000, 'Groceries', { fundingSource: 'bank' });
    await addExpense(tripId, 'A', 200, 'Cab', { fundingSource: 'personal' });

    let finance = await computeFinance(tripId);
    // B owes A 100 personally (half of 200); bank is balanced (equal contribution, equal share).
    assert.equal(finance.liveForecast.transactions.length, 1);
    assert.equal(finance.bankSettlement.transactions.length, 0);

    const blocked = await closeTrip(tripId);
    assert.equal(blocked.ok, false);
    assert.equal(blocked.reason, 'unsettled');

    await recordSettlement(tripId, 'B', 'A', 100);
    finance = await computeFinance(tripId);
    assert.equal(finance.liveForecast.transactions.length, 0);

    const closed = await closeTrip(tripId);
    assert.equal(closed.ok, true);
  });

  test('trip with no expenses at all has nothing outstanding', async () => {
    const tripId = await createTrip({ travelers: ['A', 'B'] });
    const finance = await computeFinance(tripId);
    assert.equal(finance.liveForecast.transactions.length, 0);
    assert.equal(finance.bankSettlement.transactions.length, 0);
  });

  test('trip with contributions but no expenses shows no pending settlement (unspent pool is not a debt)', async () => {
    const tripId = await createTrip({ travelers: ['A', 'B'] });
    await addContribution(tripId, 'A', 1000);
    await addContribution(tripId, 'B', 500);
    const finance = await computeFinance(tripId);
    assert.equal(finance.bankSettlement.transactions.length, 0);
    assert.equal(finance.currentCash, 1500);
  });

  test('trip with pending settlement cannot be force-closed accidentally (needs explicit force)', async () => {
    const tripId = await createTrip({ travelers: ['A', 'B'] });
    await addExpense(tripId, 'A', 1000, 'Dinner', { fundingSource: 'personal' });
    const result = await closeTrip(tripId);
    assert.equal(result.ok, false);
    assert.equal(result.outstandingCount, 1);
    const forced = await closeTrip(tripId, { force: true });
    assert.equal(forced.ok, true);
  });

  test('new expense after settlement recalculates pending state correctly', async () => {
    const tripId = await createTrip({ travelers: ['A', 'B'] });
    await addExpense(tripId, 'A', 200, 'Dinner', { fundingSource: 'personal' });
    await recordSettlement(tripId, 'B', 'A', 100);
    let finance = await computeFinance(tripId);
    assert.equal(finance.liveForecast.transactions.length, 0);

    await addExpense(tripId, 'A', 300, 'Second dinner', { fundingSource: 'personal' });
    finance = await computeFinance(tripId);
    assert.equal(finance.liveForecast.transactions.length, 1);
    assert.equal(finance.liveForecast.transactions[0].amount, 150);
  });
});

describe('Lifecycle — notification / dashboard single source of truth', () => {
  test('a closed trip never appears in the notification feed, even with balances that were once outstanding', async () => {
    const tripId = await createTrip({ name: 'ZZZ Closable Trip', travelers: ['A', 'B'] });
    await addExpense(tripId, 'A', 1000, 'Dinner', { fundingSource: 'personal' });
    await closeTrip(tripId, { force: true }); // close with balance outstanding, on purpose
    const feed = await getNotificationFeed();
    assert.ok(!feed.some((item) => item.tripId === tripId), 'closed trip leaked into notification feed');
  });

  test('a closed trip is excluded from the consolidated dashboard pending-settlement count', async () => {
    const tripId = await createTrip({ name: 'ZZZ Dashboard Trip', travelers: ['A', 'B'] });
    await addExpense(tripId, 'A', 1000, 'Dinner', { fundingSource: 'personal' });
    const before = await getConsolidatedOverview();
    await closeTrip(tripId, { force: true });
    const after = await getConsolidatedOverview();
    assert.ok(after.pendingSettlements <= before.pendingSettlements);
    assert.equal(after.activeTripCount, before.activeTripCount - 1);
  });

  test('all settlements completed → trip produces zero pending items in the feed', async () => {
    const tripId = await createTrip({ travelers: ['A', 'B'] });
    await addExpense(tripId, 'A', 1000, 'Dinner', { fundingSource: 'personal' });
    await recordSettlement(tripId, 'B', 'A', 500);
    const feed = await getNotificationFeed();
    const settlementItems = feed.filter((item) => item.tripId === tripId && item.id.startsWith('settlement_'));
    assert.equal(settlementItems.length, 0);
  });

  test('reopening a trip makes it eligible for notifications again if something is actually outstanding', async () => {
    const tripId = await createTrip({ travelers: ['A', 'B'] });
    await addExpense(tripId, 'A', 1000, 'Dinner', { fundingSource: 'personal' });
    await closeTrip(tripId, { force: true });
    await reopenTrip(tripId);
    const feed = await getNotificationFeed();
    const settlementItems = feed.filter((item) => item.tripId === tripId && item.id.startsWith('settlement_'));
    assert.equal(settlementItems.length, 1);
  });
});

describe('Lifecycle — deleting a trip', () => {
  test('deleteTrip removes the trip row and every related record across all tables', async () => {
    const tripId = await createTrip({ tripType: 'international', foreignCurrency: 'USD', travelers: ['A', 'B'] });
    await addContribution(tripId, 'A', 1000);
    await addCurrencyExchange(tripId, 500, 'INR', 15, 'USD', 'A');
    await addExpense(tripId, 'A', 300, 'Dinner', { fundingSource: 'personal' });
    await recordSettlement(tripId, 'B', 'A', 150);
    await addItineraryItem(tripId, 'City tour', Date.now() + 3600_000, 'Downtown');

    const result = await deleteTrip(tripId);
    assert.equal(result.ok, true);

    const db = await getDB();
    assert.equal(await db.getFirstAsync('SELECT * FROM trips WHERE id = ?', tripId), null);
    assert.equal((await db.getAllAsync('SELECT * FROM travelers WHERE trip_id = ?', tripId)).length, 0);
    assert.equal((await db.getAllAsync('SELECT * FROM expenses WHERE trip_id = ?', tripId)).length, 0);
    assert.equal((await db.getAllAsync('SELECT * FROM contributions WHERE trip_id = ?', tripId)).length, 0);
    assert.equal((await db.getAllAsync('SELECT * FROM currency_exchanges WHERE trip_id = ?', tripId)).length, 0);
    assert.equal((await db.getAllAsync('SELECT * FROM settlements WHERE trip_id = ?', tripId)).length, 0);
    assert.equal((await db.getAllAsync('SELECT * FROM itinerary_items WHERE trip_id = ?', tripId)).length, 0);
    assert.equal((await db.getAllAsync('SELECT * FROM timeline WHERE trip_id = ?', tripId)).length, 0);
  });

  test('deleteTrip removes expense_splits belonging to the trip\'s expenses (no orphaned rows)', async () => {
    const tripId = await createTrip({ travelers: ['A', 'B', 'C'] });
    const expenseId = await addExpense(tripId, 'A', 300, 'Dinner', { fundingSource: 'personal', participants: ['A', 'B', 'C'] });
    await deleteTrip(tripId);
    const db = await getDB();
    const splits = await db.getAllAsync('SELECT * FROM expense_splits WHERE expense_id = ?', expenseId);
    assert.equal(splits.length, 0);
  });

  test('deleting one trip does not touch another trip\'s data', async () => {
    const tripA = await createTrip({ name: 'Keep me', travelers: ['A'] });
    const tripB = await createTrip({ name: 'Delete me', travelers: ['B'] });
    await addExpense(tripA, 'A', 100, 'Snack', { fundingSource: 'personal' });
    await addExpense(tripB, 'B', 200, 'Snack', { fundingSource: 'personal' });

    await deleteTrip(tripB);

    const db = await getDB();
    const tripARow = await db.getFirstAsync('SELECT * FROM trips WHERE id = ?', tripA);
    assert.ok(tripARow);
    const tripAExpenses = await db.getAllAsync('SELECT * FROM expenses WHERE trip_id = ?', tripA);
    assert.equal(tripAExpenses.length, 1);
  });

  test('deleteTrip on a non-existent trip returns ok:false rather than throwing', async () => {
    const result = await deleteTrip('does-not-exist');
    assert.equal(result.ok, false);
  });
});
