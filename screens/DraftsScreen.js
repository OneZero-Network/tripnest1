import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { addDraft, getDrafts, discardDraft, convertDraft, bucketDraftsByAge } from '../db';

const TYPES = [
  { key: 'expense', label: 'Expense' },
  { key: 'note', label: 'Note' },
  { key: 'itinerary', label: 'Plan item' },
];

function draftSummary(draft) {
  const d = draft.partial_data;
  if (draft.draft_type === 'expense') return d.description || d.amount ? `${d.description || 'Expense'}${d.amount ? ` — ${d.amount}` : ''}` : 'Untitled expense draft';
  if (draft.draft_type === 'note') return d.text || 'Empty note draft';
  if (draft.draft_type === 'itinerary') return d.title || 'Untitled plan item';
  return 'Draft';
}

export default function DraftsScreen({ route, navigation }) {
  const { tripId } = route.params;
  const [drafts, setDrafts] = useState([]);
  const [captureType, setCaptureType] = useState('expense');
  const [quickText, setQuickText] = useState('');
  const [quickAmount, setQuickAmount] = useState('');
  const [editingDraft, setEditingDraft] = useState(null);

  const load = async () => setDrafts(await getDrafts(tripId));
  useFocusEffect(useCallback(() => { load(); }, [tripId]));

  const submitQuickCapture = async () => {
    if (!quickText.trim() && !quickAmount.trim()) return;
    let partial;
    if (captureType === 'expense') partial = { description: quickText.trim(), amount: quickAmount.trim() };
    else if (captureType === 'note') partial = { text: quickText.trim() };
    else partial = { title: quickText.trim() };
    await addDraft(tripId, captureType, partial);
    setQuickText(''); setQuickAmount('');
    load();
  };

  const handleConvert = async (draft) => {
    // Incomplete drafts (e.g. expense with no payer) still convert using the same
    // addExpense/addNote/addItineraryItem functions everything else uses — with sensible
    // fallbacks ('Unknown' payer, 0 amount) rather than blocking the organizer here.
    // They can correct the resulting record afterward like any other entry.
    await convertDraft(draft);
    load();
  };

  const confirmDiscard = (draft) => {
    Alert.alert('Discard draft?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: async () => { await discardDraft(draft.id); load(); } },
    ]);
  };

  const buckets = bucketDraftsByAge(drafts);
  const sections = [
    { key: 'today', label: 'Today', items: buckets.today },
    { key: 'yesterday', label: 'Yesterday', items: buckets.yesterday },
    { key: 'older', label: 'Older', items: buckets.older },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Drafts</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.close}>Close</Text></TouchableOpacity>
      </View>
      <Text style={styles.muted}>Unfinished things — not yet a real expense, note, or plan item.</Text>

      <View style={styles.captureCard}>
        <View style={styles.typeRow}>
          {TYPES.map((t) => (
            <TouchableOpacity key={t.key} onPress={() => setCaptureType(t.key)} style={[styles.typeChip, captureType === t.key && styles.typeChipActive]}>
              <Text style={[styles.typeChipText, captureType === t.key && styles.typeChipTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          style={styles.input}
          placeholder={captureType === 'expense' ? 'What was it for?' : captureType === 'note' ? 'Quick note...' : 'What\'s the plan?'}
          value={quickText}
          onChangeText={setQuickText}
        />
        {captureType === 'expense' && (
          <TextInput style={styles.input} placeholder="Amount (optional)" value={quickAmount} onChangeText={setQuickAmount} keyboardType="numeric" />
        )}
        <TouchableOpacity style={styles.captureBtn} onPress={submitQuickCapture}>
          <Text style={styles.captureBtnText}>Save Draft</Text>
        </TouchableOpacity>
      </View>

      <ScrollView>
        {drafts.length === 0 && <Text style={styles.muted}>No drafts. Quick Capture above stays out of the way until you need it.</Text>}
        {sections.map((s) => s.items.length > 0 && (
          <View key={s.key} style={styles.section}>
            <Text style={styles.sectionTitle}>{s.label}</Text>
            {s.items.map((d) => (
              <View key={d.id} style={styles.draftRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.draftType}>{TYPES.find(t => t.key === d.draft_type)?.label}</Text>
                  <Text style={styles.draftText}>{draftSummary(d)}</Text>
                </View>
                <TouchableOpacity style={styles.convertBtn} onPress={() => handleConvert(d)}>
                  <Text style={styles.convertBtnText}>Finish</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => confirmDiscard(d)}>
                  <Text style={styles.discardText}>Discard</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4FAF9', padding: 16, paddingTop: 60 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: '#0F5C56' },
  close: { color: '#0F5C56', fontWeight: '600' },
  muted: { color: '#8FA8A5', fontSize: 12, marginTop: 4, marginBottom: 12 },
  captureCard: { backgroundColor: '#fff', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#E1F0EE', marginBottom: 16 },
  typeRow: { flexDirection: 'row', marginBottom: 8 },
  typeChip: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 16, backgroundColor: '#E1F0EE', marginRight: 6 },
  typeChipActive: { backgroundColor: '#0F5C56' },
  typeChipText: { color: '#0F5C56', fontSize: 12, fontWeight: '600' },
  typeChipTextActive: { color: '#fff' },
  input: { backgroundColor: '#F4FAF9', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: '#E1F0EE', marginBottom: 8 },
  captureBtn: { backgroundColor: '#0F5C56', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  captureBtnText: { color: '#fff', fontWeight: '700' },
  section: { marginBottom: 16 },
  sectionTitle: { fontWeight: '700', color: '#0F5C56', marginBottom: 8 },
  draftRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#E1F0EE' },
  draftType: { fontSize: 10, fontWeight: '700', color: '#6B8E89', textTransform: 'uppercase' },
  draftText: { color: '#0F5C56', marginTop: 2 },
  convertBtn: { backgroundColor: '#E1F0EE', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12, marginRight: 8 },
  convertBtnText: { color: '#0F5C56', fontWeight: '700', fontSize: 12 },
  discardText: { color: '#B23B3B', fontWeight: '600', fontSize: 12 },
});
