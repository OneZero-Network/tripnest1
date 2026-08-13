import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  addContribution, updateContribution, addCurrencyExchange, updateCurrencyExchange,
  addExpense, updateExpense, getDB, computeFinance,
} from '../db.js';
import { createTrip, getTimeline } from '../test-utils/helpers.js';

describe('Audit trail — contributions', () => {
  test('editing a contribution amount logs old → new in the timeline', async () => {
    const tripId = await createTrip({ travelers: ['A'] });
    const db = await getDB();
    await addContribution(tripId, 'A', 2000);
    const contrib = await db.getFirstAsync('SELECT * FROM contributions WHERE trip_id = ?', tripId);
    await updateContribution(tripId, contrib.id, 3000);
    const timeline = await getTimeline(tripId);
    const editEvent = timeline.find((e) => e.event.includes('2000') && e.event.includes('3000'));
    assert.ok(editEvent, 'no timeline event describes the 2000 → 3000 change');
  });

  test('a snapshot of the pre-edit row is preserved in contribution_history', async () => {
    const tripId = await createTrip({ travelers: ['A'] });
    const db = await getDB();
    await addContribution(tripId, 'A', 2000);
    const contrib = await db.getFirstAsync('SELECT * FROM contributions WHERE trip_id = ?', tripId);
    await updateContribution(tripId, contrib.id, 3000);
    const history = await db.getAllAsync('SELECT * FROM contribution_history WHERE contribution_id = ?', contrib.id);
    assert.equal(history.length, 1);
    const snapshot = JSON.parse(history[0].snapshot);
    assert.equal(snapshot.amount, 2000); // the OLD value, not the new one
  });
});

describe('Audit trail — currency exchange', () => {
  test('editing an exchange logs old → new values in the timeline, both currencies visible', async () => {
    const tripId = await createTrip({ tripType: 'international', foreignCurrency: 'USD', travelers: ['A'] });
    const db = await getDB();
    await addCurrencyExchange(tripId, 3000, 'INR', 100, 'USD', 'A');
    const exch = await db.getFirstAsync('SELECT * FROM currency_exchanges WHERE trip_id = ?', tripId);
    await updateCurrencyExchange(tripId, exch.id, 4000, 133.33);
    const timeline = await getTimeline(tripId);
    const editEvent = timeline.find((e) => e.event.includes('4000') && e.event.includes('133.33'));
    assert.ok(editEvent, 'no timeline event describes the exchange edit with new values');
    // Old values should also be recoverable from the event text, not just the new ones.
    assert.ok(editEvent.event.includes('3000') && editEvent.event.includes('100'), 'old values missing from the edit description');
  });

  test('a snapshot of the pre-edit exchange is preserved in exchange_history', async () => {
    const tripId = await createTrip({ tripType: 'international', foreignCurrency: 'USD', travelers: ['A'] });
    const db = await getDB();
    await addCurrencyExchange(tripId, 3000, 'INR', 100, 'USD', 'A');
    const exch = await db.getFirstAsync('SELECT * FROM currency_exchanges WHERE trip_id = ?', tripId);
    await updateCurrencyExchange(tripId, exch.id, 4000, 133.33);
    const history = await db.getAllAsync('SELECT * FROM exchange_history WHERE exchange_id = ?', exch.id);
    assert.equal(history.length, 1);
    const snapshot = JSON.parse(history[0].snapshot);
    assert.equal(snapshot.from_amount, 3000);
    assert.equal(snapshot.to_amount, 100);
  });

  test('editing an exchange amount correctly ripples through reconciliation — currentCash and wallet remaining update to the NEW figures, not the old ones', async () => {
    const tripId = await createTrip({ tripType: 'international', foreignCurrency: 'USD', travelers: ['A'] });
    const db = await getDB();
    await addContribution(tripId, 'A', 5000);
    await addCurrencyExchange(tripId, 3000, 'INR', 100, 'USD', 'A');

    const before = await computeFinance(tripId);
    assert.equal(before.currentCash, 2000); // 5000 - 3000 exchanged
    assert.equal(before.foreignWallets.find((w) => w.currency === 'USD').exchanged, 100);

    const exch = await db.getFirstAsync('SELECT * FROM currency_exchanges WHERE trip_id = ?', tripId);
    await updateCurrencyExchange(tripId, exch.id, 4000, 133.33); // exchanged MORE of the base currency

    const after = await computeFinance(tripId);
    assert.equal(after.currentCash, 1000); // 5000 - 4000, not stuck at the old 2000
    assert.equal(after.exchangedOutBase, 4000);
    const wallet = after.foreignWallets.find((w) => w.currency === 'USD');
    assert.equal(wallet.exchanged, 133.33); // not the stale 100
  });
});

describe('Audit trail — expenses (regression coverage for the existing per-field logging)', () => {
  test('editing amount, payer, and category each produce their own timeline event', async () => {
    const tripId = await createTrip({ travelers: ['A', 'B'] });
    const expenseId = await addExpense(tripId, 'A', 1000, 'Dinner', { fundingSource: 'personal', category: 'Food' });
    await updateExpense(tripId, expenseId, { amount: 1500, paidBy: 'B', category: 'Transport' });
    const timeline = await getTimeline(tripId);
    const events = timeline.filter((e) => e.type === 'expense' && JSON.parse(e.metadata || '{}').id === expenseId);
    const fields = events.map((e) => JSON.parse(e.metadata || '{}').field).filter(Boolean);
    assert.ok(fields.includes('amount'), 'amount change was not logged');
    assert.ok(fields.includes('category'), 'category change was not logged');
  });

  test('removing a participant from an expense split is reflected in expense_splits, not silently kept', async () => {
    const tripId = await createTrip({ travelers: ['A', 'B', 'C'] });
    const db = await getDB();
    const expenseId = await addExpense(tripId, 'A', 300, 'Dinner', { fundingSource: 'personal', participants: ['A', 'B', 'C'] });
    await updateExpense(tripId, expenseId, { participants: ['A', 'B'] });
    const splits = await db.getAllAsync('SELECT traveler_name FROM expense_splits WHERE expense_id = ?', expenseId);
    assert.equal(splits.length, 2);
    assert.ok(!splits.some((s) => s.traveler_name === 'C'));
  });
});
