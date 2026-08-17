import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  addExpense, addContribution, recordSettlement, computeSettlement,
  computeBankSettlement, computeFinalBankSettlement, closeTrip, reopenTrip, getDB,
  recordBankSettlementLeg,
} from '../db.js';
import { createTrip } from '../test-utils/helpers.js';

describe('Settlement — personal (person ↔ person)', () => {
  test('2 members, one pays everything, equal split', async () => {
    const tripId = await createTrip({ travelers: ['A', 'B'] });
    await addExpense(tripId, 'A', 1000, 'Dinner', { fundingSource: 'personal' });
    const { balances, transactions } = await computeSettlement(tripId);
    assert.equal(balances['A'], 500);
    assert.equal(balances['B'], -500);
    assert.equal(transactions.length, 1);
    assert.deepEqual(transactions[0], { from: 'B', to: 'A', amount: 500 });
  });

  test('3 members, multiple payers, minimum-transaction settlement', async () => {
    const tripId = await createTrip({ travelers: ['A', 'B', 'C'] });
    await addExpense(tripId, 'A', 300, 'Lunch', { fundingSource: 'personal' });
    await addExpense(tripId, 'B', 300, 'Dinner', { fundingSource: 'personal' });
    // Even split: everyone paid 200 worth in total (900/3), everyone owed 200 → net 0 for
    // A and B, C owes 200. So exactly one transaction: C → whoever fronted more.
    const { balances, transactions } = await computeSettlement(tripId);
    assert.equal(balances['C'], -200);
    assert.ok(transactions.length <= 2, 'should not need more than 2 transactions for 3 people');
    const totalMoved = transactions.reduce((s, t) => s + t.amount, 0);
    assert.equal(+totalMoved.toFixed(2), 200); // exactly the shortfall, nothing extra moved
  });

  test('10 members, mixed payers, settlement nets to zero and uses few transactions', async () => {
    const names = Array.from({ length: 10 }, (_, i) => `P${i}`);
    const tripId = await createTrip({ travelers: names });
    // P0 and P5 each pay a big shared expense; everyone splits equally.
    await addExpense(tripId, 'P0', 1000, 'Hotel', { fundingSource: 'personal' });
    await addExpense(tripId, 'P5', 500, 'Activity', { fundingSource: 'personal' });
    const { balances, transactions } = await computeSettlement(tripId);
    const sum = Object.values(balances).reduce((s, v) => s + v, 0);
    assert.equal(+sum.toFixed(2), 0); // conservation of money — nothing created or destroyed
    // Minimum practical transactions: with N debtors/creditors, greedy matching should
    // never need more transactions than (participants - 1).
    assert.ok(transactions.length <= names.length - 1);
  });

  test('different participants per expense — someone excluded from one expense but not another', async () => {
    const tripId = await createTrip({ travelers: ['A', 'B', 'C'] });
    await addExpense(tripId, 'A', 300, 'Everyone', { fundingSource: 'personal' }); // A,B,C equally
    await addExpense(tripId, 'A', 200, 'Just A and B', { fundingSource: 'personal', participants: ['A', 'B'] });
    const { balances } = await computeSettlement(tripId);
    // C owes only 100 (share of expense 1). A paid 500 total, owed 100+100=200 → net +300.
    // B owes 100+100=200 → net -200. C owes 100 → net -100.
    assert.equal(balances['C'], -100);
    assert.equal(balances['B'], -200);
    assert.equal(balances['A'], 300);
  });

  test('partial settlement: recorded payment nets against outstanding balance, does not zero it out entirely', async () => {
    const tripId = await createTrip({ travelers: ['A', 'B'] });
    await addExpense(tripId, 'A', 1000, 'Dinner', { fundingSource: 'personal' });
    await recordSettlement(tripId, 'B', 'A', 200); // B pays back only part of what they owe
    const { balances, transactions } = await computeSettlement(tripId);
    assert.equal(balances['B'], -300); // -500 + 200
    assert.equal(transactions[0].amount, 300);
  });

  test('complete settlement: recorded payment fully clears the balance, zero transactions remain', async () => {
    const tripId = await createTrip({ travelers: ['A', 'B'] });
    await addExpense(tripId, 'A', 1000, 'Dinner', { fundingSource: 'personal' });
    await recordSettlement(tripId, 'B', 'A', 500);
    const { transactions } = await computeSettlement(tripId);
    assert.equal(transactions.length, 0);
  });
});

describe('Settlement — Trip Bank (person ↔ pool)', () => {
  test('equal contributions, bank-funded expense splits evenly, nobody owes anything', async () => {
    const tripId = await createTrip({ travelers: ['A', 'B'] });
    await addContribution(tripId, 'A', 500);
    await addContribution(tripId, 'B', 500);
    await addExpense(tripId, 'A', 1000, 'Groceries', { fundingSource: 'bank' });
    const { transactions } = await computeBankSettlement(tripId);
    assert.equal(transactions.length, 0);
  });

  test('unequal contributions with equal bank spend produces a bank-side transaction', async () => {
    const tripId = await createTrip({ travelers: ['A', 'B'] });
    await addContribution(tripId, 'A', 800);
    await addContribution(tripId, 'B', 200);
    await addExpense(tripId, 'A', 1000, 'Groceries', { fundingSource: 'bank' }); // 500 each share
    const { balances } = await computeBankSettlement(tripId);
    assert.equal(balances['A'], 300); // contributed 800, owes 500 → bank owes them 300
    assert.equal(balances['B'], -300); // contributed 200, owes 500 → owes bank 300
  });

  test('mixed personal + bank expenses are tracked completely independently', async () => {
    const tripId = await createTrip({ travelers: ['A', 'B'] });
    await addContribution(tripId, 'A', 500);
    await addContribution(tripId, 'B', 500);
    await addExpense(tripId, 'A', 1000, 'Groceries (bank)', { fundingSource: 'bank' });
    await addExpense(tripId, 'B', 200, 'Cab (personal)', { fundingSource: 'personal' });
    const bank = await computeBankSettlement(tripId);
    const personal = await computeSettlement(tripId);
    assert.equal(bank.transactions.length, 0); // equal contribution, equal bank share
    assert.equal(personal.balances['B'], 100); // B paid 200 personal, owes 100 → net +100
    assert.equal(personal.balances['A'], -100);
  });
});

describe('Settlement — "Mark all as settled" must clear BOTH refunds and payments (Dubai bug regression)', () => {
  test('recording every bank leg — refunds AND top-ups — actually zeroes out the bank settlement, not just the ones owed TO the bank', async () => {
    // Reproduces the reported Dubai shape: over-contributors are owed refunds FROM the
    // bank ("Receive money"), under-contributors owe the bank ("Pay these people").
    // The bug was that "Mark all as settled" only ever recorded the second kind — so
    // refunds sat there forever even after the button said everything was settled.
    const tripId = await createTrip({ travelers: ['Ayaz', 'Tariq', 'Sam'] });
    await addContribution(tripId, 'Ayaz', 900); // over-contributed relative to a 300 share
    await addContribution(tripId, 'Tariq', 150); // under-contributed
    await addContribution(tripId, 'Sam', 150); // under-contributed
    await addExpense(tripId, 'Ayaz', 900, 'Villa', { fundingSource: 'bank' }); // 300 each share

    const before = await computeBankSettlement(tripId);
    const toRefund = before.transactions.filter((t) => t.from === 'Trip Bank');
    const toPay = before.transactions.filter((t) => t.to === 'Trip Bank');
    assert.ok(toRefund.length > 0, 'test setup should produce at least one refund owed');
    assert.ok(toPay.length > 0, 'test setup should produce at least one top-up owed');

    // This is what the FIXED "Mark all as settled" does: record every leg from BOTH
    // lists, not just toPay.
    for (const t of [...toRefund, ...toPay]) {
      await recordBankSettlementLeg(tripId, t.from, t.to, t.amount, 'Trip Bank');
    }

    const after = await computeBankSettlement(tripId);
    assert.equal(after.transactions.length, 0, 'refunds must actually clear, not just top-ups');
  });

  test('recording ONLY toPay (the pre-fix buggy behavior) leaves refunds stuck — documents the exact bug', async () => {
    const tripId = await createTrip({ travelers: ['Ayaz', 'Tariq', 'Sam'] });
    await addContribution(tripId, 'Ayaz', 900);
    await addContribution(tripId, 'Tariq', 150);
    await addContribution(tripId, 'Sam', 150);
    await addExpense(tripId, 'Ayaz', 900, 'Villa', { fundingSource: 'bank' });

    const before = await computeBankSettlement(tripId);
    const toPayOnly = before.transactions.filter((t) => t.to === 'Trip Bank');
    for (const t of toPayOnly) {
      await recordBankSettlementLeg(tripId, t.from, t.to, t.amount, 'Trip Bank');
    }

    const after = await computeBankSettlement(tripId);
    // This is the bug as reported: "toPay" side clears, but a refund is still outstanding.
    assert.ok(after.transactions.some((t) => t.from === 'Trip Bank'), 'this reproduces the reported bug — refund still stuck after settling only toPay');
  });
});

describe('Settlement — final bank settlement at closure (mixed debtors/creditors)', () => {
  test('at closure, a shortfall and a surplus are matched Person→Person, not routed through the bank', async () => {
    const tripId = await createTrip({ travelers: ['A', 'B', 'C'] });
    // A over-contributed relative to their share, B and C under-contributed — a real
    // "someone paid the shortfall, someone else needs a refund" situation, exactly the
    // case computeFinalBankSettlement exists for.
    await addContribution(tripId, 'A', 900);
    await addContribution(tripId, 'B', 300);
    await addContribution(tripId, 'C', 300);
    await addExpense(tripId, 'A', 1500, 'Villa', { fundingSource: 'bank' }); // 500 each share
    const live = await computeBankSettlement(tripId);
    // Live (mid-trip): A is owed 400 by the bank, B and C each owe the bank 200.
    assert.equal(live.balances['A'], 400);
    assert.equal(live.balances['B'], -200);
    assert.equal(live.balances['C'], -200);

    const final = await computeFinalBankSettlement(tripId);
    // At closure, no custodian named — debtors settle directly against the creditor
    // (real person → real person), not "pay the wallet." Exactly covers the 400 owed to
    // A using B's 200 + C's 200, leaving nothing routed through "Trip Bank" at all.
    assert.ok(!final.transactions.some((t) => t.from === 'Trip Bank' || t.to === 'Trip Bank'),
      'a fully-matched settlement should not still involve "Trip Bank" as a party');
    const toA = final.transactions.filter((t) => t.to === 'A').reduce((s, t) => s + t.amount, 0);
    assert.equal(toA, 400);
    const fromB = final.transactions.filter((t) => t.from === 'B').reduce((s, t) => s + t.amount, 0);
    const fromC = final.transactions.filter((t) => t.from === 'C').reduce((s, t) => s + t.amount, 0);
    assert.equal(fromB, 200);
    assert.equal(fromC, 200);
  });

  test('a genuine unmatched surplus at closure is routed to the named custodian, not left dangling', async () => {
    const tripId = await createTrip({ travelers: ['A', 'B'] });
    await addContribution(tripId, 'A', 1000);
    await addContribution(tripId, 'B', 1000);
    await addExpense(tripId, 'A', 1000, 'Groceries', { fundingSource: 'bank' }); // 500 each share
    const db = await getDB();
    await db.runAsync('UPDATE trips SET custodian = ? WHERE id = ?', 'Custodian Name', tripId);
    const final = await computeFinalBankSettlement(tripId);
    // Both A and B are owed 500 back — real leftover cash, nobody owes anybody, so there's
    // no debtor to match against. This is a genuine surplus and must come from the named
    // custodian rather than being silently dropped or left attributed to abstract "Trip Bank".
    assert.equal(final.transactions.length, 2);
    assert.ok(final.transactions.every((t) => t.from === 'Custodian Name'));
    assert.ok(!final.transactions.some((t) => t.from === 'Trip Bank' || t.to === 'Trip Bank'));
    const total = final.transactions.reduce((s, t) => s + t.amount, 0);
    assert.equal(total, 1000);
  });
});

describe('Settlement — lifecycle interaction', () => {
  test('reopened trip recomputes settlement fresh against current data, not stale numbers', async () => {
    const tripId = await createTrip({ travelers: ['A', 'B'] });
    await addExpense(tripId, 'A', 500, 'Dinner', { fundingSource: 'personal' });
    await recordSettlement(tripId, 'B', 'A', 250);
    const closeResult = await closeTrip(tripId);
    assert.equal(closeResult.ok, true);
    await reopenTrip(tripId);
    await addExpense(tripId, 'A', 500, 'Second dinner', { fundingSource: 'personal' });
    const { balances } = await computeSettlement(tripId);
    // First dinner: B owed 250, paid 250 → 0. Second dinner: B owes another 250.
    assert.equal(balances['B'], -250);
  });

  test('closed trip: computeSettlement still returns correct numbers (read-only, not frozen wrong)', async () => {
    const tripId = await createTrip({ travelers: ['A', 'B'] });
    await addExpense(tripId, 'A', 500, 'Dinner', { fundingSource: 'personal' });
    await recordSettlement(tripId, 'B', 'A', 250);
    await closeTrip(tripId);
    const { transactions } = await computeSettlement(tripId);
    assert.equal(transactions.length, 0);
  });
});
