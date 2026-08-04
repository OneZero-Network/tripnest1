import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { addExpense } from '../db';
import { PrimaryButton, EmptyState, LedgerList, LedgerRow, Chip, theme } from './UI';

const COMMON_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'THB'];

export default function ExpensesTab({ tripId, expenses, baseCurrency = 'INR', onChanged }) {
  const [payer, setPayer] = useState('');
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const [currency, setCurrency] = useState(baseCurrency);
  const [fxRate, setFxRate] = useState('');
  const [showCurrency, setShowCurrency] = useState(false);

  const isForeign = currency !== baseCurrency;

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!amt || !payer) return;
    if (isForeign && !parseFloat(fxRate)) return; // rate required once a foreign currency is picked
    await addExpense(tripId, payer, amt, desc || 'Expense', {
      currency,
      fxRate: isForeign ? parseFloat(fxRate) : 1,
    });
    setAmount(''); setDesc(''); setPayer(''); setFxRate('');
    onChanged();
  };

  return (
    <View style={styles.section}>
      <TextInput style={styles.input} placeholder="Who paid?" placeholderTextColor={theme.inkMute} value={payer} onChangeText={setPayer} />
      <View style={styles.amountRow}>
        <TextInput style={[styles.input, { flex: 1 }]} placeholder="Amount" placeholderTextColor={theme.inkMute} value={amount} onChangeText={setAmount} keyboardType="numeric" />
        <Text
          style={styles.currencyToggle}
          onPress={() => setShowCurrency((v) => !v)}
        >
          {currency} {showCurrency ? '▴' : '▾'}
        </Text>
      </View>
      {showCurrency && (
        <View style={styles.currencyPicker}>
          {COMMON_CURRENCIES.map((c) => (
            <Chip key={c} label={c} active={currency === c} onPress={() => setCurrency(c)} />
          ))}
        </View>
      )}
      {isForeign && (
        <TextInput
          style={styles.input}
          placeholder={`Exchange rate — 1 ${currency} = ? ${baseCurrency}`}
          placeholderTextColor={theme.inkMute}
          value={fxRate}
          onChangeText={setFxRate}
          keyboardType="numeric"
        />
      )}
      <TextInput style={styles.input} placeholder="Description" placeholderTextColor={theme.inkMute} value={desc} onChangeText={setDesc} />
      <PrimaryButton label="Add expense" icon="plus" onPress={submit} style={{ marginBottom: theme.space.md }} />

      {expenses.length === 0 ? (
        <EmptyState
          icon="expense"
          title="Start by logging who paid for the first expense"
          hint="Who paid, how much, for what — that's all it takes. Settlement is calculated automatically."
        />
      ) : (
        <LedgerList>
          {expenses.map((item, i) => (
            <LedgerRow key={item.id} icon="expense" isLast={i === expenses.length - 1}>
              <Text style={styles.rowTitle}>
                {item.paid_by} paid {item.amount} {item.currency !== baseCurrency ? item.currency : ''}
                {item.currency !== baseCurrency ? ` (≈ ${(item.amount * item.fx_rate).toFixed(2)} ${baseCurrency})` : ''}
              </Text>
              <Text style={styles.rowSub}>{item.description}</Text>
            </LedgerRow>
          ))}
        </LedgerList>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { flex: 1 },
  input: { backgroundColor: theme.surface, borderRadius: theme.radius.sm, paddingHorizontal: 14, minHeight: theme.a11y.minTouchTarget, borderWidth: 1, borderColor: theme.line, marginBottom: theme.space.sm, color: theme.ink },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
  currencyToggle: { fontSize: theme.type.body, fontWeight: theme.weight.semibold, color: theme.brandDeep, paddingHorizontal: 4, marginBottom: theme.space.sm },
  currencyPicker: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: theme.space.sm },
  rowTitle: { fontSize: theme.type.body, fontWeight: theme.weight.semibold, color: theme.ink },
  rowSub: { fontSize: theme.type.caption, color: theme.inkMute, marginTop: 2 },
});
