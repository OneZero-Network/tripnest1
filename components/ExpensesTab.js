import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { addExpense } from '../db';
import { PrimaryButton, EmptyState, LedgerList, LedgerRow, Chip, SuccessToast, useTheme } from './UI';

const COMMON_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'THB'];
const CATEGORIES = ['Food', 'Transport', 'Stay', 'Shopping', 'Other'];

export default function ExpensesTab({ tripId, expenses, travelers = [], baseCurrency = 'INR', onChanged }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [payer, setPayer] = useState(null);
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const [category, setCategory] = useState(null);
  const [customCategory, setCustomCategory] = useState('');
  const [fundingSource, setFundingSource] = useState('personal');
  const [currency, setCurrency] = useState(baseCurrency);
  const [fxRate, setFxRate] = useState('');
  const [showCurrency, setShowCurrency] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  const isForeign = currency !== baseCurrency;

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!amt || !payer) return;
    if (isForeign && !parseFloat(fxRate)) return; // rate required once a foreign currency is picked
    const finalCategory = category === 'Other' ? (customCategory.trim() || 'Other') : category;
    await addExpense(tripId, payer, amt, desc || finalCategory || 'Expense', {
      currency,
      fxRate: isForeign ? parseFloat(fxRate) : 1,
      category: finalCategory,
      fundingSource,
    });
    setAmount(''); setDesc(''); setPayer(null); setFxRate(''); setCategory(null); setCustomCategory('');
    setSavedAt(Date.now());
    onChanged();
  };

  return (
    <View style={styles.section}>
      <SuccessToast trigger={savedAt} message="Expense added" />
      {travelers.length === 0 ? (
        <Text style={styles.noTravelersHint}>Add travelers first — expenses are only recorded against real trip travelers, never free text.</Text>
      ) : (
        <>
          <Text style={styles.fieldLabel}>Who paid?</Text>
          <View style={styles.payerRow}>
            {travelers.map((t) => (
              <Chip key={t.id} label={t.name} active={payer === t.name} onPress={() => setPayer(t.name)} />
            ))}
          </View>
        </>
      )}

      <Text style={styles.fieldLabel}>Paid from</Text>
      <View style={styles.payerRow}>
        <Chip label="Personal (settle 1:1)" active={fundingSource === 'personal'} onPress={() => setFundingSource('personal')} />
        <Chip label="Trip Bank" active={fundingSource === 'bank'} onPress={() => setFundingSource('bank')} />
      </View>

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

      <Text style={styles.fieldLabel}>Category</Text>
      <View style={styles.payerRow}>
        {CATEGORIES.map((c) => (
          <Chip key={c} label={c} active={category === c} onPress={() => setCategory(c)} />
        ))}
      </View>
      {category === 'Other' && (
        <TextInput
          style={styles.input}
          placeholder="What kind of expense?"
          placeholderTextColor={theme.inkMute}
          value={customCategory}
          onChangeText={setCustomCategory}
        />
      )}

      <TextInput style={styles.input} placeholder="Description (optional)" placeholderTextColor={theme.inkMute} value={desc} onChangeText={setDesc} />
      <PrimaryButton
        label="Add expense"
        icon="plus"
        onPress={submit}
        style={{ marginBottom: theme.space.md, opacity: travelers.length === 0 ? 0.5 : 1 }}
      />

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
              <Text style={styles.rowSub}>
                {item.category ? `${item.category} · ` : ''}{item.description}{' · '}
                {item.funding_source === 'bank' ? 'Trip Bank' : 'Personal'}
              </Text>
            </LedgerRow>
          ))}
        </LedgerList>
      )}
    </View>
  );
}

const makeStyles = (theme) => StyleSheet.create({
  section: { flex: 1 },
  input: { backgroundColor: theme.surface, borderRadius: theme.radius.sm, paddingHorizontal: 14, minHeight: theme.a11y.minTouchTarget, borderWidth: 1, borderColor: theme.line, marginBottom: theme.space.sm, color: theme.ink },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
  currencyToggle: { fontSize: theme.type.body, fontWeight: theme.weight.semibold, color: theme.brandDeep, paddingHorizontal: 4, marginBottom: theme.space.sm },
  currencyPicker: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: theme.space.sm },
  rowTitle: { fontSize: theme.type.body, fontWeight: theme.weight.semibold, color: theme.ink },
  rowSub: { fontSize: theme.type.caption, color: theme.inkMute, marginTop: 2 },
  fieldLabel: { fontSize: theme.type.label, fontWeight: theme.weight.semibold, color: theme.inkMute, marginBottom: theme.space.xs, marginTop: theme.space.sm, textTransform: 'uppercase', letterSpacing: 0.4 },
  payerRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: theme.space.sm },
  noTravelersHint: { fontSize: theme.type.caption, color: theme.inkMute, lineHeight: 18, marginBottom: theme.space.md },
});
