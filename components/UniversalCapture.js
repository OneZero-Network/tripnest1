import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { addExpense, addNote, addItineraryItem } from '../db';
import { pickAndAddDocument } from '../tripExport';
import { PrimaryButton, IconBadge, theme } from './UI';

// The whole point of this button is "don't make the organizer think about which tab to
// open." So each action here is the SHORTEST possible path to a real record — same
// underlying functions every tab uses (addExpense/addNote/addItineraryItem), just without
// navigating anywhere first. "Quick Draft" is the one exception: it deliberately does NOT
// create a real record, it hands off to Drafts, because that's what Drafts is *for* —
// capturing something without deciding its final shape yet.
const ACTIONS = [
  { key: 'expense', label: 'Add Expense', icon: 'expense' },
  { key: 'note', label: 'Add Note', icon: 'note' },
  { key: 'plan', label: 'Add Plan Item', icon: 'itinerary' },
  { key: 'document', label: 'Attach Document', icon: 'document' },
  { key: 'draft', label: 'Quick Draft', icon: 'draft', tone: 'accent' },
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

  const active = ACTIONS.find(a => a.key === activeAction);

  return (
    <>
      <TouchableOpacity style={styles.fab} onPress={() => setOpen(true)} activeOpacity={0.85}>
        <Feather name="plus" size={26} color="#fff" />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={close}>
          <View style={styles.sheet} onStartShouldSetResponder={() => true}>
            <View style={styles.handle} />
            {!activeAction ? (
              <>
                <Text style={styles.title}>Add to trip</Text>
                <Text style={styles.subtitle}>Skip the tabs — capture it straight into the right place.</Text>
                {ACTIONS.map((a) => (
                  <TouchableOpacity key={a.key} style={styles.actionRow} onPress={() => handleActionPress(a.key)}>
                    <IconBadge type={a.icon} size={38} tone={a.tone} />
                    <Text style={styles.actionText}>{a.label}</Text>
                    <Feather name="chevron-right" size={16} color={theme.inkMute} />
                  </TouchableOpacity>
                ))}
              </>
            ) : (
              <>
                <View style={styles.activeHeaderRow}>
                  <IconBadge type={active.icon} size={38} tone={active.tone} />
                  <Text style={styles.title}>{active.label}</Text>
                </View>
                {activeAction === 'expense' && (
                  <TextInput style={styles.input} placeholder="Amount" placeholderTextColor={theme.inkMute} value={amount} onChangeText={setAmount} keyboardType="numeric" autoFocus />
                )}
                <TextInput
                  style={styles.input}
                  placeholder={activeAction === 'expense' ? 'What was it for? (optional)' : activeAction === 'note' ? 'Quick note...' : "What's the plan?"}
                  placeholderTextColor={theme.inkMute}
                  value={text}
                  onChangeText={setText}
                  autoFocus={activeAction !== 'expense'}
                />
                {activeAction === 'expense' && (
                  <Text style={styles.hint}>Payer left as "Unknown" — fix it in the Expenses tab afterward.</Text>
                )}
                <PrimaryButton label="Save" icon="check" onPress={submit} style={{ marginTop: 8 }} />
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
    position: 'absolute', bottom: 20, right: 4, width: 58, height: 58, borderRadius: 29,
    backgroundColor: theme.brandDeep, alignItems: 'center', justifyContent: 'center',
    shadowColor: theme.brand, shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(11,15,20,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: theme.radius.xl, borderTopRightRadius: theme.radius.xl, padding: 20, paddingBottom: 32 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: theme.line, alignSelf: 'center', marginBottom: 16 },
  title: { fontSize: 17, fontWeight: '700', color: theme.ink, letterSpacing: -0.2 },
  subtitle: { fontSize: 12.5, color: theme.inkMute, marginTop: 3, marginBottom: 14 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.bg },
  actionText: { flex: 1, fontSize: 15, fontWeight: '600', color: theme.ink },
  activeHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  input: { backgroundColor: theme.bg, borderRadius: theme.radius.sm, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: theme.line, marginBottom: 10, color: theme.ink },
  hint: { color: theme.inkMute, fontSize: 11.5, marginBottom: 6, marginTop: -4 },
});
