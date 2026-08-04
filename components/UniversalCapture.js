import React, {useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { addExpense, addNote, addItineraryItem } from '../db';
import { pickAndAddDocument } from '../tripExport';
import { PrimaryButton, IconBadge, BottomSheet, useTheme } from './UI';

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
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
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
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + theme.space.lg }]}
        onPress={() => setOpen(true)}
        activeOpacity={0.85}
        accessibilityLabel="Add to trip"
        accessibilityRole="button"
      >
        <Feather name="plus" size={26} color="#fff" />
      </TouchableOpacity>

      <BottomSheet visible={open} onClose={close}>
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
            <PrimaryButton label="Save" icon="check" onPress={submit} style={{ marginTop: theme.space.sm }} />
          </>
        )}
      </BottomSheet>
    </>
  );
}

const makeStyles = (theme) => StyleSheet.create({
  fab: {
    position: 'absolute', end: theme.space.lg, width: 52, height: 52, borderRadius: 26,
    backgroundColor: theme.brandDeep, alignItems: 'center', justifyContent: 'center',
    shadowColor: theme.brandDeep, shadowOpacity: 0.16, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  title: { fontSize: theme.type.heading, fontWeight: theme.weight.semibold, color: theme.ink, letterSpacing: -0.2 },
  subtitle: { fontSize: theme.type.caption, color: theme.inkMute, marginTop: 3, marginBottom: theme.space.md },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md, paddingVertical: theme.space.md, borderBottomWidth: 1, borderBottomColor: theme.bg, minHeight: theme.a11y.minTouchTarget },
  actionText: { flex: 1, fontSize: theme.type.body, fontWeight: theme.weight.semibold, color: theme.ink },
  activeHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md, marginBottom: theme.space.lg },
  input: { backgroundColor: theme.bg, borderRadius: theme.radius.sm, paddingHorizontal: 14, minHeight: theme.a11y.minTouchTarget, borderWidth: 1, borderColor: theme.line, marginBottom: theme.space.sm, color: theme.ink },
  hint: { color: theme.inkMute, fontSize: 11.5, marginBottom: 6, marginTop: -4 },
});
