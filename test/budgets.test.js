import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { addExpense, setCategoryBudget, getCategoryBudgets, getCategoryBudgetStatus } from '../db.js';
import { createTrip } from '../test-utils/helpers.js';

describe('Category budgets', () => {
  test('setting a budget persists and is retrievable', async () => {
    const tripId = await createTrip({ travelers: ['A'] });
    await setCategoryBudget(tripId, 'Food', 5000);
    const budgets = await getCategoryBudgets(tripId);
    assert.equal(budgets.length, 1);
    assert.equal(budgets[0].category, 'Food');
    assert.equal(budgets[0].amount, 5000);
  });

  test('setting a budget twice for the same category updates it, not duplicates it', async () => {
    const tripId = await createTrip({ travelers: ['A'] });
    await setCategoryBudget(tripId, 'Food', 5000);
    await setCategoryBudget(tripId, 'Food', 7000);
    const budgets = await getCategoryBudgets(tripId);
    assert.equal(budgets.length, 1);
    assert.equal(budgets[0].amount, 7000);
  });

  test('setting amount to 0 or less clears the budget rather than storing a meaningless limit', async () => {
    const tripId = await createTrip({ travelers: ['A'] });
    await setCategoryBudget(tripId, 'Food', 5000);
    await setCategoryBudget(tripId, 'Food', 0);
    const budgets = await getCategoryBudgets(tripId);
    assert.equal(budgets.length, 0);
  });

  test('status: under budget is not flagged as over', async () => {
    const tripId = await createTrip({ travelers: ['A'] });
    await setCategoryBudget(tripId, 'Food', 5000);
    await addExpense(tripId, 'A', 2000, 'Lunch', { fundingSource: 'personal', category: 'Food' });
    const status = await getCategoryBudgetStatus(tripId);
    const food = status.find((s) => s.category === 'Food');
    assert.equal(food.spent, 2000);
    assert.equal(food.budget, 5000);
    assert.equal(food.remaining, 3000);
    assert.equal(food.isOver, false);
  });

  test('status: spend exceeding budget is flagged over, with a negative remaining', async () => {
    const tripId = await createTrip({ travelers: ['A'] });
    await setCategoryBudget(tripId, 'Food', 1000);
    await addExpense(tripId, 'A', 700, 'Lunch', { fundingSource: 'personal', category: 'Food' });
    await addExpense(tripId, 'A', 600, 'Dinner', { fundingSource: 'personal', category: 'Food' });
    const status = await getCategoryBudgetStatus(tripId);
    const food = status.find((s) => s.category === 'Food');
    assert.equal(food.spent, 1300);
    assert.equal(food.remaining, -300);
    assert.equal(food.isOver, true);
  });

  test('status includes categories with spend but no budget set (budget: null, isOver: false)', async () => {
    const tripId = await createTrip({ travelers: ['A'] });
    await addExpense(tripId, 'A', 500, 'Cab', { fundingSource: 'personal', category: 'Transport' });
    const status = await getCategoryBudgetStatus(tripId);
    const transport = status.find((s) => s.category === 'Transport');
    assert.ok(transport);
    assert.equal(transport.budget, null);
    assert.equal(transport.isOver, false);
    assert.equal(transport.remaining, null);
  });

  test('status includes a budgeted category with zero spend so far', async () => {
    const tripId = await createTrip({ travelers: ['A'] });
    await setCategoryBudget(tripId, 'Shopping', 2000);
    const status = await getCategoryBudgetStatus(tripId);
    const shopping = status.find((s) => s.category === 'Shopping');
    assert.equal(shopping.spent, 0);
    assert.equal(shopping.remaining, 2000);
    assert.equal(shopping.isOver, false);
  });

  test('budgets are scoped per trip — same category name on a different trip is independent', async () => {
    const tripA = await createTrip({ travelers: ['A'] });
    const tripB = await createTrip({ travelers: ['B'] });
    await setCategoryBudget(tripA, 'Food', 1000);
    await setCategoryBudget(tripB, 'Food', 9000);
    const statusA = await getCategoryBudgetStatus(tripA);
    const statusB = await getCategoryBudgetStatus(tripB);
    assert.equal(statusA.find((s) => s.category === 'Food').budget, 1000);
    assert.equal(statusB.find((s) => s.category === 'Food').budget, 9000);
  });
});
