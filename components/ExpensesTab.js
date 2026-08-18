import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LedgerList, LedgerRow, EmptyState, Chip, BottomSheet, PrimaryButton, currencySymbol, formatMoney, CATEGORY_EMOJI, useTheme } from './UI';
import { getCategoryBudgetStatus, setCategoryBudget } from '../db';

// EXPENSES: answers exactly one question — "what was spent" — separate from Activity's
// broader "what happened" (which also covers notes, documents, contributions, events).
// Deliberately no entry form here: recording an expense happens through Add (Universal
// Capture), which already has the full form (payer, funding source, category, currency,
// split). Duplicating that form here would be the exact "same information, two homes"
// problem this review called out — this tab is a lens onto the same expense records,
// not a second place to create them.
//
// SEARCH/FILTER: this trip's own expenses can grow into the dozens for a longer trip,
// and "what did I spend on food" or "what did Adnan pay for" are real, common questions
// that previously had no answer except scrolling and eyeballing. Filtering happens
// entirely client-side against the `expenses` prop already in memory — no new queries,
// no new state to keep in sync with the rest of the trip.
export default function ExpensesTab({ tripId, expenses, baseCurrency, onOpenItem }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const cs = currencySymbol(baseCurrency);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(null); // null = all categories
  const [budgetStatus, setBudgetStatus] = useState([]);
  const [budgetsOpen, setBudgetsOpen] = useState(false);
  const [budgetDrafts, setBudgetDrafts] = useState({}); // { category: '5000' } while editing

  const loadBudgets = async () => {
    if (!tripId) return;
    setBudgetStatus(await getCategoryBudgetStatus(tripId));
  };

  // Reloads whenever the expense list changes (a new expense in a budgeted category
  // should update its status immediately, not just when the budgets sheet is reopened)
  // and once on mount.
  useEffect(() => { loadBudgets(); }, [tripId, expenses]);

  const openBudgetsSheet = () => {
    const drafts = {};
    budgetStatus.forEach((b) => { if (b.budget != null) drafts[b.category] = String(b.budget); });
    // Seed every known category (from CATEGORY_EMOJI, not just ones already spent-on or
    // budgeted) so a budget can be set BEFORE the first expense in that category exists —
    // "warn me before I overspend on Shopping" only works if Shopping doesn't need to
    // already have spend against it to show up here.
    Object.keys(CATEGORY_EMOJI).forEach((c) => { if (!(c in drafts)) drafts[c] = budgetStatus.find((b) => b.category === c)?.budget != null ? String(budgetStatus.find((b) => b.category === c).budget) : ''; });
    setBudgetDrafts(drafts);
    setBudgetsOpen(true);
  };

  const saveBudgets = async () => {
    await Promise.all(
      Object.entries(budgetDrafts).map(([category, value]) => setCategoryBudget(tripId, category, parseFloat(value) || 0))
    );
    setBudgetsOpen(false);
    await loadBudgets();
  };

  const overBudgetCategories = useMemo(() => new Set(budgetStatus.filter((b) => b.isOver).map((b) => b.category)), [budgetStatus]);

  const categories = useMemo(() => {
    const set = new Set();
    (expenses || []).forEach((e) => { if (e.category) set.add(e.category); });
    return Array.from(set).sort();
  }, [expenses]);

  const filteredExpenses = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (expenses || []).filter((e) => {
      if (categoryFilter && e.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        (e.category || '').toLowerCase().includes(q) ||
        (e.description || '').toLowerCase().includes(q) ||
        (e.paid_by || '').toLowerCase().includes(q)
      );
    });
  }, [expenses, query, categoryFilter]);

  const isFiltering = query.trim().length > 0 || categoryFilter !== null;
  // The header total always reflects the FILTERED set when a filter is active — "what
  // did I spend on Food" should answer with the Food total, not the trip's grand total
  // sitting confusingly above a filtered list that doesn't add up to it.
  const total = filteredExpenses.reduce((s, e) => s + e.amount * e.fx_rate, 0);

  return (
    <View style={styles.section}>
      {expenses.length > 0 && (
        <>
          <View style={styles.searchRow}>
            <Feather name="search" size={16} color={theme.inkMute} style={{ marginEnd: theme.space.xs }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search description, category, or who paid"
              placeholderTextColor={theme.inkMute}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
            />
            {query.length > 0 && (
              <Feather
                name="x-circle"
                size={16}
                color={theme.inkMute}
                onPress={() => setQuery('')}
                suppressHighlighting
              />
            )}
          </View>

          {categories.length > 1 && (
            <View style={styles.chipRow}>
              <Chip label="All" active={categoryFilter === null} onPress={() => setCategoryFilter(null)} />
              {categories.map((c) => (
                <Chip
                  key={c}
                  label={`${overBudgetCategories.has(c) ? '⚠️ ' : ''}${CATEGORY_EMOJI[c] || '🧾'} ${c}`}
                  active={categoryFilter === c}
                  onPress={() => setCategoryFilter(categoryFilter === c ? null : c)}
                />
              ))}
            </View>
          )}

          {overBudgetCategories.size > 0 && (
            <View style={styles.warningBanner}>
              <Feather name="alert-triangle" size={14} color={theme.danger} />
              <Text style={styles.warningText}>
                Over budget on {Array.from(overBudgetCategories).join(', ')}
              </Text>
            </View>
          )}

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{isFiltering ? 'Matching' : 'Total spent'}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
              <Text style={styles.totalValue}>{cs}{total.toFixed(0)}</Text>
              <Feather name="target" size={16} color={theme.inkMute} onPress={openBudgetsSheet} suppressHighlighting accessibilityLabel="Set category budgets" />
            </View>
          </View>
        </>
      )}

      {expenses.length === 0 ? (
        <>
          <EmptyState
            icon="expense"
            title="🍔 Log your first expense to start tracking this trip"
            hint='Tap the + button and choose "Add Expense."'
          />
          <Text style={styles.setBudgetsLink} onPress={openBudgetsSheet}>Set category budgets →</Text>
        </>
      ) : filteredExpenses.length === 0 ? (
        <EmptyState
          icon="expense"
          title="No matching expenses"
          hint="Try a different search term or clear the category filter."
        />
      ) : (
        <LedgerList>
          {filteredExpenses.map((item, i) => (
            <LedgerRow
              key={item.id}
              isLast={i === filteredExpenses.length - 1}
              onPress={onOpenItem ? () => onOpenItem({ id: `expense_${item.id}`, type: 'expense', metadata: JSON.stringify({ id: item.id }) }) : undefined}
            >
              <View style={styles.rowMain}>
                <Text style={styles.emoji}>{CATEGORY_EMOJI[item.category] || '🧾'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{item.category || 'Expense'}</Text>
                  <Text style={styles.rowSub}>
                    Paid by {item.paid_by}{item.description ? ` · ${item.description}` : ''} · {item.funding_source === 'bank' ? 'Trip Bank' : 'Personal'}
                  </Text>
                </View>
                <Text style={styles.rowAmount}>{currencySymbol(item.currency || baseCurrency)}{formatMoney(item.amount)}{item.currency !== baseCurrency ? ` ${item.currency}` : ''}</Text>
              </View>
            </LedgerRow>
          ))}
        </LedgerList>
      )}

      <BottomSheet visible={budgetsOpen} onClose={() => setBudgetsOpen(false)}>
        <Text style={styles.budgetSheetTitle}>Category budgets</Text>
        <Text style={styles.budgetSheetHint}>Set a limit per category — leave blank for no limit. You'll see a warning here once a category goes over.</Text>
        {Object.keys(CATEGORY_EMOJI).map((c) => (
          <View key={c} style={styles.budgetRow}>
            <Text style={styles.budgetRowLabel}>{CATEGORY_EMOJI[c]} {c}</Text>
            <View style={styles.budgetInputWrap}>
              <Text style={styles.budgetInputPrefix}>{cs}</Text>
              <TextInput
                style={styles.budgetInput}
                placeholder="No limit"
                placeholderTextColor={theme.inkMute}
                keyboardType="numeric"
                value={budgetDrafts[c] || ''}
                onChangeText={(v) => setBudgetDrafts((prev) => ({ ...prev, [c]: v }))}
              />
            </View>
          </View>
        ))}
        <PrimaryButton label="Save budgets" onPress={saveBudgets} style={{ marginTop: theme.space.lg }} />
      </BottomSheet>
    </View>
  );
}

const makeStyles = (theme) => StyleSheet.create({
  section: { flex: 1, paddingBottom: 88 }, // clears the floating action button, same fix as SettlementTab
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.line, paddingHorizontal: 12, minHeight: theme.a11y.minTouchTarget, marginBottom: theme.space.sm },
  searchInput: { flex: 1, color: theme.ink, fontSize: theme.type.body, paddingVertical: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.xs, marginBottom: theme.space.sm },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: theme.space.md },
  totalLabel: { fontSize: theme.type.body, color: theme.inkMute },
  totalValue: { fontSize: theme.type.heading, fontWeight: theme.weight.semibold, color: theme.ink },
  rowMain: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: theme.space.sm },
  emoji: { fontSize: 22 },
  rowTitle: { fontSize: theme.type.body, fontWeight: theme.weight.semibold, color: theme.ink },
  rowSub: { fontSize: theme.type.caption, color: theme.inkMute, marginTop: 2 },
  rowAmount: { fontSize: theme.type.body, fontWeight: theme.weight.semibold, color: theme.ink },
  warningBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.dangerWash || 'rgba(220,80,80,0.12)', borderRadius: theme.radius.sm, padding: theme.space.sm, marginBottom: theme.space.sm },
  warningText: { color: theme.danger, fontSize: theme.type.caption, fontWeight: theme.weight.semibold, flex: 1 },
  setBudgetsLink: { color: theme.brandDeep, fontSize: theme.type.caption, fontWeight: theme.weight.semibold, textAlign: 'center', marginTop: theme.space.md },
  budgetSheetTitle: { fontSize: theme.type.heading, fontWeight: theme.weight.semibold, color: theme.ink, marginBottom: theme.space.xs },
  budgetSheetHint: { fontSize: theme.type.caption, color: theme.inkMute, marginBottom: theme.space.lg },
  budgetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: theme.space.sm, borderBottomWidth: 1, borderBottomColor: theme.line },
  budgetRowLabel: { fontSize: theme.type.body, color: theme.ink },
  budgetInputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.line, paddingHorizontal: 10 },
  budgetInputPrefix: { color: theme.inkMute, fontSize: theme.type.body, marginEnd: 2 },
  budgetInput: { width: 90, color: theme.ink, fontSize: theme.type.body, textAlign: 'right', paddingVertical: 6 },
});
