import React, {useState, useCallback, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { addDraft, getDrafts, discardDraft, convertDraft, bucketDraftsByAge } from '../db';
import { PrimaryButton, Chip, EmptyState, SectionHeader, LedgerList, LedgerRow, ConfirmDialog, useTheme } from '../components/UI';

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
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { tripId } = route.params;
  const [drafts, setDrafts] = useState([]);
  const [captureType, setCaptureType] = useState('expense');
  const [quickText, setQuickText] = useState('');
  const [quickAmount, setQuickAmount] = useState('');
  const [pendingDiscard, setPendingDiscard] = useState(null);

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

  const confirmDiscard = async () => {
    if (!pendingDiscard) return;
    await discardDraft(pendingDiscard.id);
    setPendingDiscard(null);
    load();
  };

  const buckets = bucketDraftsByAge(drafts);
  const sections = [
    { key: 'today', label: 'Today', items: buckets.today },
    { key: 'yesterday', label: 'Yesterday', items: buckets.yesterday },
    { key: 'older', label: 'Older', items: buckets.older },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Drafts</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
          <Text style={styles.close}>Close</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.muted}>Unfinished things — not yet a real expense, note, or plan item.</Text>

      <View style={styles.captureCard}>
        <View style={styles.typeRow}>
          {TYPES.map((t) => (
            <Chip key={t.key} label={t.label} active={captureType === t.key} onPress={() => setCaptureType(t.key)} />
          ))}
        </View>
        <TextInput
          style={styles.input}
          placeholder={captureType === 'expense' ? 'What was it for?' : captureType === 'note' ? 'Quick note...' : "What's the plan?"}
          placeholderTextColor={theme.inkMute}
          value={quickText}
          onChangeText={setQuickText}
        />
        {captureType === 'expense' && (
          <TextInput style={styles.input} placeholder="Amount (optional)" placeholderTextColor={theme.inkMute} value={quickAmount} onChangeText={setQuickAmount} keyboardType="numeric" />
        )}
        <PrimaryButton label="Save draft" onPress={submitQuickCapture} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {drafts.length === 0 && (
          <EmptyState
            icon="draft"
            title="Capture something without deciding its shape yet"
            hint="Quick Capture above stays out of the way until you need it — drop in a half-formed expense or note and finish it later."
            optional
          />
        )}
        {sections.map((s) => s.items.length > 0 && (
          <View key={s.key} style={styles.section}>
            <SectionHeader title={s.label} />
            <LedgerList>
              {s.items.map((d, i) => (
                <LedgerRow key={d.id} icon={d.draft_type} isLast={i === s.items.length - 1}>
                  <Text style={styles.draftType}>{TYPES.find(t => t.key === d.draft_type)?.label}</Text>
                  <Text style={styles.draftText}>{draftSummary(d)}</Text>
                  <View style={styles.draftActions}>
                    <TouchableOpacity style={styles.convertBtn} onPress={() => handleConvert(d)}>
                      <Text style={styles.convertBtnText}>Finish</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setPendingDiscard(d)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={styles.discardText}>Discard</Text>
                    </TouchableOpacity>
                  </View>
                </LedgerRow>
              ))}
            </LedgerList>
          </View>
        ))}
      </ScrollView>

      <ConfirmDialog
        visible={!!pendingDiscard}
        title="Discard draft?"
        confirmLabel="Discard"
        destructive
        onConfirm={confirmDiscard}
        onCancel={() => setPendingDiscard(null)}
      />
    </SafeAreaView>
  );
}

const makeStyles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg, padding: theme.space.xl, paddingTop: theme.space.lg },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: theme.type.title, fontWeight: theme.weight.semibold, color: theme.ink },
  closeBtn: { minHeight: theme.a11y.minTouchTarget, justifyContent: 'center' },
  close: { color: theme.brandDeep, fontWeight: theme.weight.semibold },
  muted: { color: theme.inkMute, fontSize: theme.type.caption, marginTop: 4, marginBottom: theme.space.md },
  captureCard: { backgroundColor: theme.surface, borderRadius: theme.radius.lg, padding: theme.space.md, borderWidth: 1, borderColor: theme.line, marginBottom: theme.space.lg },
  typeRow: { flexDirection: 'row', marginBottom: theme.space.sm },
  input: { backgroundColor: theme.bg, borderRadius: theme.radius.sm, paddingHorizontal: 12, minHeight: theme.a11y.minTouchTarget, borderWidth: 1, borderColor: theme.line, marginBottom: theme.space.sm, color: theme.ink },
  section: { marginBottom: theme.space.lg },
  draftType: { fontSize: 10, fontWeight: theme.weight.semibold, color: theme.inkMute, textTransform: 'uppercase' },
  draftText: { color: theme.ink, marginTop: 2, fontSize: theme.type.body },
  draftActions: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md, marginTop: theme.space.sm },
  convertBtn: { backgroundColor: theme.brandWash, paddingVertical: 6, paddingHorizontal: 12, borderRadius: theme.radius.sm },
  convertBtnText: { color: theme.brandDeep, fontWeight: theme.weight.semibold, fontSize: theme.type.caption },
  discardText: { color: theme.danger, fontWeight: theme.weight.semibold, fontSize: theme.type.caption },
});
