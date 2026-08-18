import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LedgerList, LedgerRow, EmptyState, currencySymbol, formatMoney, CATEGORY_EMOJI, useTheme } from './UI';

// EXPENSES: answers exactly one question — "what was spent" — separate from Activity's
// broader "what happened" (which also covers notes, documents, contributions, events).
// Deliberately no entry form here: recording an expense happens through Add (Universal
// Capture), which already has the full form (payer, funding source, category, currency,
// split). Duplicating that form here would be the exact "same information, two homes"
// problem this review called out — this tab is a lens onto the same expense records,
// not a second place to create them.
export default function ExpensesTab({ expenses, baseCurrency, onOpenItem }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const cs = currencySymbol(baseCurrency);
  const total = expenses.reduce((s, e) => s + e.amount * e.fx_rate, 0);

  return (
    <View style={styles.section}>
      {expenses.length > 0 && (
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total spent</Text>
          <Text style={styles.totalValue}>{cs}{total.toFixed(0)}</Text>
        </View>
      )}

      {expenses.length === 0 ? (
        <EmptyState
          icon="expense"
          title="🍔 Log your first expense to start tracking this trip"
          hint='Tap the + button and choose "Add Expense."'
        />
      ) : (
        <LedgerList>
          {expenses.map((item, i) => (
            <LedgerRow
              key={item.id}
              isLast={i === expenses.length - 1}
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
    </View>
  );
}

const makeStyles = (theme) => StyleSheet.create({
  section: { flex: 1, paddingBottom: 88 }, // clears the floating action button, same fix as SettlementTab
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: theme.space.md },
  totalLabel: { fontSize: theme.type.body, color: theme.inkMute },
  totalValue: { fontSize: theme.type.heading, fontWeight: theme.weight.semibold, color: theme.ink },
  rowMain: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: theme.space.sm },
  emoji: { fontSize: 22 },
  rowTitle: { fontSize: theme.type.body, fontWeight: theme.weight.semibold, color: theme.ink },
  rowSub: { fontSize: theme.type.caption, color: theme.inkMute, marginTop: 2 },
  rowAmount: { fontSize: theme.type.body, fontWeight: theme.weight.semibold, color: theme.ink },
});
