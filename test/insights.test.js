import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { addExpense, closeTrip, getLifetimeInsights } from '../db.js';
import { createTrip } from '../test-utils/helpers.js';

// This file is deliberately separate from the other test files: each *file* gets a
// fresh in-memory DB (node --test runs files in their own process), but tests *within*
// one file share a single DB — and these assertions need to know the exact trip count,
// which a shared DB full of other suites' trips would break.
describe('getLifetimeInsights (Overview summary cards)', () => {
  test('no trips at all returns a clean zeroed structure, not an error', async () => {
    const insights = await getLifetimeInsights();
    assert.equal(insights.totalTripCount, 0);
    assert.equal(insights.activeTripCount, 0);
    assert.equal(insights.closedTripCount, 0);
    assert.equal(insights.totalUniqueTravelers, 0);
    assert.deepEqual(insights.spendByCurrency, []);
    assert.equal(insights.topTrip, null);
  });

  test('counts trips, unique travelers, and groups spend by each trip\'s own currency — never mixes currencies into one total', async () => {
    const goa = await createTrip({ name: 'Goa', baseCurrency: 'INR', travelers: ['A', 'B'] });
    const dubai = await createTrip({ name: 'Dubai', baseCurrency: 'USD', travelers: ['A', 'C'] }); // A repeats — shouldn't double-count
    await addExpense(goa, 'A', 1000, 'Dinner', { fundingSource: 'personal' });
    await addExpense(goa, 'B', 500, 'Cab', { fundingSource: 'personal' });
    await addExpense(dubai, 'A', 200, 'Hotel', { fundingSource: 'personal' });
    await closeTrip(dubai, { force: true });

    const insights = await getLifetimeInsights();
    assert.equal(insights.totalTripCount, 2);
    assert.equal(insights.activeTripCount, 1);
    assert.equal(insights.closedTripCount, 1);
    assert.equal(insights.totalUniqueTravelers, 3); // A, B, C — A not double-counted

    const inr = insights.spendByCurrency.find((s) => s.currency === 'INR');
    const usd = insights.spendByCurrency.find((s) => s.currency === 'USD');
    assert.equal(inr.total, 1500);
    assert.equal(inr.tripCount, 1);
    assert.equal(usd.total, 200);
    assert.equal(usd.tripCount, 1);

    assert.equal(insights.topTrip.name, 'Goa');
    assert.equal(insights.topTrip.amount, 1500);
    assert.equal(insights.topTrip.id, goa); // navigable — the id must be the real trip id, not just display text
  });

  test('a trip with zero expenses is still counted, just contributes 0 to its currency bucket', async () => {
    // Runs after the previous test in this same file/DB (Goa ₹1500, Dubai $200 already
    // exist) — asserting against the cumulative total here, not a fresh-DB count, since
    // tests within one file share a single in-memory DB (only separate *files* get a
    // fresh one). The actual thing under test: a new zero-expense trip must be counted
    // in totalTripCount and add a currency bucket if a new currency, but must NOT change
    // any existing currency's total or displace the existing topTrip.
    const before = await getLifetimeInsights();
    await createTrip({ name: 'Just planning', baseCurrency: 'INR', travelers: ['A'] });
    const after = await getLifetimeInsights();

    assert.equal(after.totalTripCount, before.totalTripCount + 1);
    const inrBefore = before.spendByCurrency.find((s) => s.currency === 'INR');
    const inrAfter = after.spendByCurrency.find((s) => s.currency === 'INR');
    assert.equal(inrAfter.total, inrBefore.total); // zero-spend trip adds no money
    assert.equal(inrAfter.tripCount, inrBefore.tripCount + 1); // but is still counted
    assert.equal(after.topTrip.name, before.topTrip.name); // doesn't displace the real top spender
  });
});
