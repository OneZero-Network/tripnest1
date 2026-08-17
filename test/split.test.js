import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSplit } from '../finance/calculator.js';
import { addExpense, updateExpense, computeSettlement } from '../db.js';
import { createTrip } from '../test-utils/helpers.js';

describe('resolveSplit — unit', () => {
  test('equal split divides evenly and sums exactly to the total', () => {
    const { rows, error } = resolveSplit(300, ['A', 'B', 'C'], 'equal');
    assert.equal(error, null);
    const sum = rows.reduce((s, r) => s + r.shareAmount, 0);
    assert.equal(+sum.toFixed(2), 300);
  });

  test('equal split with a non-dividing amount still sums exactly (rounding remainder absorbed)', () => {
    const { rows, error } = resolveSplit(10, ['A', 'B', 'C'], 'equal');
    assert.equal(error, null);
    const sum = rows.reduce((s, r) => s + r.shareAmount, 0);
    assert.equal(+sum.toFixed(2), 10);
  });

  test('equal split with one participant gives them the full amount', () => {
    const { rows, error } = resolveSplit(500, ['A'], 'equal');
    assert.equal(error, null);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].shareAmount, 500);
  });

  test('custom amounts that reconcile are accepted', () => {
    const { rows, error } = resolveSplit(300, ['A', 'B', 'C'], 'custom', { A: 100, B: 150, C: 50 });
    assert.equal(error, null);
    assert.deepEqual(rows.map((r) => r.shareAmount), [100, 150, 50]);
  });

  test('custom amounts that do NOT reconcile are rejected', () => {
    const { rows, error } = resolveSplit(300, ['A', 'B', 'C'], 'custom', { A: 100, B: 150, C: 40 });
    assert.equal(rows, null);
    assert.match(error, /total/i);
  });

  test('percentage split that sums to 100 is accepted and amounts sum to the total', () => {
    const { rows, error } = resolveSplit(300, ['A', 'B', 'C'], 'percentage', { A: 40, B: 30, C: 30 });
    assert.equal(error, null);
    const sum = rows.reduce((s, r) => s + r.shareAmount, 0);
    assert.equal(+sum.toFixed(2), 300);
    assert.equal(rows.find((r) => r.name === 'A').shareAmount, 120);
  });

  test('percentage split that does NOT sum to 100 is rejected', () => {
    const { rows, error } = resolveSplit(300, ['A', 'B', 'C'], 'percentage', { A: 40, B: 30, C: 20 });
    assert.equal(rows, null);
    assert.match(error, /100/);
  });

  test('shares split is proportional and sums exactly to the total', () => {
    const { rows, error } = resolveSplit(300, ['A', 'B'], 'shares', { A: 1, B: 2 });
    assert.equal(error, null);
    const sum = rows.reduce((s, r) => s + r.shareAmount, 0);
    assert.equal(+sum.toFixed(2), 300);
    assert.equal(rows.find((r) => r.name === 'A').shareAmount, 100);
    assert.equal(rows.find((r) => r.name === 'B').shareAmount, 200);
  });

  test('shares split with all-zero/negative shares is rejected', () => {
    const zero = resolveSplit(300, ['A', 'B'], 'shares', { A: 0, B: 0 });
    assert.equal(zero.rows, null);
    const negative = resolveSplit(300, ['A', 'B'], 'shares', { A: -1, B: 2 });
    assert.equal(negative.rows, null);
  });

  test('no participants is rejected regardless of method', () => {
    const { rows, error } = resolveSplit(300, [], 'equal');
    assert.equal(rows, null);
    assert.ok(error);
  });

  test('fractional/rounding amounts (₹10 split 3 ways) never drift from the total', () => {
    const { rows } = resolveSplit(10, ['A', 'B', 'C'], 'equal');
    const sum = rows.reduce((s, r) => s + r.shareAmount, 0);
    assert.equal(sum, 10);
  });
});

describe('addExpense / updateExpense — split integration', () => {
  test('participant excluded from an expense does not owe a share of it', async () => {
    const tripId = await createTrip({ travelers: ['Adnan', 'Tariq', 'Arbaaz', 'Sameer'] });
    await addExpense(tripId, 'Adnan', 3000, 'Dinner', {
      fundingSource: 'personal',
      participants: ['Adnan', 'Tariq', 'Arbaaz'], // Sameer excluded, per the memo's own example
    });
    const { balances } = await computeSettlement(tripId);
    assert.equal(balances['Sameer'], 0);
    assert.equal(balances['Adnan'], 2000);
    assert.equal(balances['Tariq'], -1000);
    assert.equal(balances['Arbaaz'], -1000);
  });

  test('addExpense rejects a custom split that does not reconcile — no row is written', async () => {
    const tripId = await createTrip({ travelers: ['A', 'B'] });
    await assert.rejects(
      () => addExpense(tripId, 'A', 300, 'Bad split', {
        fundingSource: 'personal',
        participants: ['A', 'B'],
        splitType: 'custom',
        splitValues: { A: 100, B: 100 }, // sums to 200, expense is 300
      }),
      /total/i
    );
    const { balances } = await computeSettlement(tripId);
    // Nothing should have been recorded — balances stay at zero.
    assert.equal(balances['A'], 0);
    assert.equal(balances['B'], 0);
  });

  test('percentage split persists and settles correctly', async () => {
    const tripId = await createTrip({ travelers: ['A', 'B', 'C'] });
    await addExpense(tripId, 'A', 1000, 'Hotel', {
      fundingSource: 'personal',
      participants: ['A', 'B', 'C'],
      splitType: 'percentage',
      splitValues: { A: 50, B: 25, C: 25 },
    });
    const { balances } = await computeSettlement(tripId);
    assert.equal(balances['A'], 500); // paid 1000, owes 500 → net +500
    assert.equal(balances['B'], -250);
    assert.equal(balances['C'], -250);
  });

  test('shares split persists and settles correctly', async () => {
    const tripId = await createTrip({ travelers: ['A', 'B'] });
    await addExpense(tripId, 'A', 300, 'Cab', {
      fundingSource: 'personal',
      participants: ['A', 'B'],
      splitType: 'shares',
      splitValues: { A: 1, B: 2 },
    });
    const { balances } = await computeSettlement(tripId);
    assert.equal(balances['A'], 200); // paid 300, owes 100 (1/3 share) → net +200
    assert.equal(balances['B'], -200);
  });

  test('editing an expense amount rescales a stored percentage split, not the raw rupee amounts', async () => {
    const tripId = await createTrip({ travelers: ['A', 'B'] });
    const expenseId = await addExpense(tripId, 'A', 1000, 'Hotel', {
      fundingSource: 'personal',
      participants: ['A', 'B'],
      splitType: 'percentage',
      splitValues: { A: 60, B: 40 },
    });
    const result = await updateExpense(tripId, expenseId, { amount: 2000 });
    assert.equal(result.ok, true);
    const { balances } = await computeSettlement(tripId);
    // 60/40 of the NEW 2000 total: A owes 1200, paid 2000 → net +800. B owes 800 → net -800.
    assert.equal(balances['A'], 800);
    assert.equal(balances['B'], -800);
  });

  test('member isolation: addExpense rejects a payer who is not a member of this trip', async () => {
    const tripId = await createTrip({ travelers: ['Ayaz', 'Adnan'] }); // Goa — no Tariq
    await assert.rejects(
      () => addExpense(tripId, 'Tariq', 500, 'Should not save', { fundingSource: 'personal' }),
      /not a member/i
    );
  });

  test('member isolation: addExpense rejects a participant who is not a member of this trip', async () => {
    const tripId = await createTrip({ travelers: ['Ayaz', 'Adnan'] });
    await assert.rejects(
      () => addExpense(tripId, 'Ayaz', 500, 'Should not save', { fundingSource: 'personal', participants: ['Ayaz', 'Adnan', 'Tariq'] }),
      /not a member|Tariq/i
    );
    const { balances } = await computeSettlement(tripId);
    assert.equal(balances['Ayaz'], 0); // confirms nothing was actually written
  });

  test('member isolation: a member of a DIFFERENT trip cannot be saved onto this trip, even with the same tripId-shaped call', async () => {
    const goa = await createTrip({ name: 'Goa', travelers: ['Ayaz', 'Adnan'] });
    const dubai = await createTrip({ name: 'Dubai', travelers: ['Ayaz', 'Tariq'] });
    // Tariq is real — just not on THIS (Goa) trip.
    await assert.rejects(() => addExpense(goa, 'Tariq', 100, 'Wrong trip', { fundingSource: 'personal' }));
    // Sanity: the identical call succeeds on the trip Tariq actually belongs to.
    await assert.doesNotReject(() => addExpense(dubai, 'Tariq', 100, 'Right trip', { fundingSource: 'personal' }));
  });

  test('member isolation: updateExpense rejects reassigning payer to a non-member', async () => {
    const tripId = await createTrip({ travelers: ['Ayaz', 'Adnan'] });
    const expenseId = await addExpense(tripId, 'Ayaz', 200, 'Dinner', { fundingSource: 'personal' });
    const result = await updateExpense(tripId, expenseId, { paidBy: 'Tariq' });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'invalid_member');
  });

  test('member isolation: updateExpense rejects adding a non-member participant', async () => {
    const tripId = await createTrip({ travelers: ['Ayaz', 'Adnan'] });
    const expenseId = await addExpense(tripId, 'Ayaz', 200, 'Dinner', { fundingSource: 'personal', participants: ['Ayaz', 'Adnan'] });
    const result = await updateExpense(tripId, expenseId, { participants: ['Ayaz', 'Adnan', 'Tariq'] });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'invalid_member');
  });

  test('editing a custom split amount without updating values is rejected, not silently wrong', async () => {
    const tripId = await createTrip({ travelers: ['A', 'B'] });
    const expenseId = await addExpense(tripId, 'A', 300, 'Cab', {
      fundingSource: 'personal',
      participants: ['A', 'B'],
      splitType: 'custom',
      splitValues: { A: 100, B: 200 },
    });
    const result = await updateExpense(tripId, expenseId, { amount: 500 }); // custom amounts no longer sum to 500
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'invalid_split');
  });
});
