import React, { useState } from 'react';
import { View, Text, TextInput, FlatList, StyleSheet } from 'react-native';
import { addExpense } from '../db';
import { PrimaryButton, EmptyState, theme } from './UI';

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
      <TextInput style={styles.input} placeholder="Who paid?" value={payer} onChangeText={setPayer} />
      <TextInput style={styles.input} placeholder="Amount" value={amount} onChangeText={setAmount} keyboardType="numeric" />
      <TextInput style={styles.input} placeholder="Description" value={desc} onChangeText={setDesc} />
      <PrimaryButton label="Add Expense" onPress={submit} style={{ marginBottom: 8 }} />
      <FlatList
        data={expenses}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <Text style={styles.listItem}>💰 {item.paid_by} paid {item.amount} — {item.description}</Text>
        )}
        ListEmptyComponent={<EmptyState text="No expenses recorded yet." />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { flex: 1 },
  input: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: theme.border, marginBottom: 8 },
  listItem: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.primaryLight, color: theme.primary },
});
