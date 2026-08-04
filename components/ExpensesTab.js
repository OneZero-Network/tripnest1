import React, { useState } from 'react';
import { View, Text, TextInput, FlatList, StyleSheet } from 'react-native';
import { addExpense } from '../db';
import { PrimaryButton, EmptyState, ListRow, theme } from './UI';

export default function ExpensesTab({ tripId, expenses, onChanged }) {
  const [payer, setPayer] = useState('');
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!amt || !payer) return;
    await addExpense(tripId, payer, amt, desc || 'Expense');
    setAmount(''); setDesc(''); setPayer('');
    onChanged();
  };

  return (
    <View style={styles.section}>
      <TextInput style={styles.input} placeholder="Who paid?" placeholderTextColor={theme.inkMute} value={payer} onChangeText={setPayer} />
      <TextInput style={styles.input} placeholder="Amount" placeholderTextColor={theme.inkMute} value={amount} onChangeText={setAmount} keyboardType="numeric" />
      <TextInput style={styles.input} placeholder="Description" placeholderTextColor={theme.inkMute} value={desc} onChangeText={setDesc} />
      <PrimaryButton label="Add Expense" icon="plus" onPress={submit} style={{ marginBottom: 12 }} />
      <FlatList
        data={expenses}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <ListRow icon="expense">
            <Text style={styles.rowTitle}>{item.paid_by} paid {item.amount}</Text>
            <Text style={styles.rowSub}>{item.description}</Text>
          </ListRow>
        )}
        ListEmptyComponent={
          <EmptyState
            icon="expense"
            title="Log your first expense"
            hint="Who paid, how much, for what — that's all it takes. Settlement is calculated automatically."
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { flex: 1 },
  input: { backgroundColor: '#fff', borderRadius: theme.radius.sm, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: theme.line, marginBottom: 10, color: theme.ink },
  rowTitle: { fontSize: 14.5, fontWeight: '600', color: theme.ink },
  rowSub: { fontSize: 12.5, color: theme.inkMute, marginTop: 2 },
});
