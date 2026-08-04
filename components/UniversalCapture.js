import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { addExpense, addNote, addItineraryItem } from '../db';
import { pickAndAddDocument } from '../tripExport';
import { PrimaryButton, theme } from './UI';

// The whole point of this button is "don't make the organizer think about which tab to
// open." So each action here is the SHORTEST possible path to a real record — same
// underlying functions every tab uses (addExpense/addNote/addItineraryItem), just without
// navigating anywhere first. "Quick Draft" is the one exception: it deliberately does NOT
// create a real record, it hands off to Drafts, because that's what Drafts is *for* —
// capturing something without deciding its final shape yet.
const ACTIONS = [
  { key: 'expense', label: '💰 Add Expense' },
  { key: 'note', label: '📝 Add Note' },
  { key: 'plan', label: '🗓️ Add Plan Item' },
  { key: 'document', label: '📄 Attach Document' },
  { key: 'draft', label: '📥 Quick Draft' },
];

export default function UniversalCapture({ tripId, navigation, onChanged }) {
  const [open, setOpen] = useState(false);
  const [activeAction, setActiveAction] = useState(null);
  const [text, setText] = useState('');
  const [amount, setAmount] = useState('');

  const reset = () => { setActiveAction(null); setText(''); setAmount(''); };
  const close = () => { setOpen(false); reset(); };

  const handleActionPress = async (key) => {
    if (key === 'document') {
      setOpen(false);
      await pickAndAddDocument(tripId);
      onChanged();
      return;
    }
    if (key === 'draft') {
      setOpen(false);
      navigation.navigate('Drafts', { tripId });
      return;
    }
    setActiveAction(key);
  };

  const submit = async () => {
    if (activeAction === 'expense') {
      const amt = parseFloat(amount);
      if (!amt) return;
      await addExpense(tripId, 'Unknown', amt, text.trim() || 'Expense');
    } else if (activeAction === 'note') {
      if (!text.trim()) return;
      await addNote(tripId, text.trim());
    } else if (activeAction === 'plan') {
      if (!text.trim()) return;
      await addItineraryItem(tripId, text.trim(), Date.now(), null);
    }
    onChanged();
    close();
  };

  return (
    <>
      <TouchableOpacity style={styles.fab} onPress={() => setOpen(true)}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={close}>
          <View style={styles.sheet} onStartShouldSetResponder={() => true}>
            {!activeAction ? (
              <>
                <Text style={styles.title}>Add to trip</Text>
                {ACTIONS.map((a) => (
                  <TouchableOpacity key={a.key} style={styles.actionRow} onPress={() => handleActionPress(a.key)}>
                    <Text style={styles.actionText}>{a.label}</Text>
                  </TouchableOpacity>
                ))}
              </>
            ) : (
              <>
                <Text style={styles.title}>{ACTIONS.find(a => a.key === activeAction)?.label}</Text>
                {activeAction === 'expense' && (
                  <TextInput style={styles.input} placeholder="Amount" value={amount} onChangeText={setAmount} keyboardType="numeric" autoFocus />
                )}
                <TextInput
                  style={styles.input}
                  placeholder={activeAction === 'expense' ? 'What was it for? (optional)' : activeAction === 'note' ? 'Quick note...' : "What's the plan?"}
                  value={text}
                  onChangeText={setText}
                  autoFocus={activeAction !== 'expense'}
                />
                {activeAction === 'expense' && (
                  <Text style={styles.hint}>Payer left as "Unknown" — fix it in the Expenses tab afterward.</Text>
                )}
                <PrimaryButton label="Save" onPress={submit} style={{ marginTop: 8 }} />
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28,
    backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  fabText: { color: '#fff', fontSize: 28, fontWeight: '400', marginTop: -2 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
  title: { fontSize: 16, fontWeight: '700', color: theme.primary, marginBottom: 12 },
  actionRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.primaryLight },
  actionText: { fontSize: 15, color: theme.primary },
  input: { backgroundColor: theme.bg, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: theme.border, marginBottom: 8 },
  hint: { color: theme.muted, fontSize: 11, marginBottom: 4 },
});
