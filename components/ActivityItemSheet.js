import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import {
  getNoteById, getDocumentById, getExpenseById, getExpenseSplits,
  updateNote, deleteNote, togglePinnedNote,
  togglePinnedDocument,
} from '../db';
import { openDocument, deleteDocument } from '../tripExport';
import { BottomSheet, PrimaryButton, SecondaryButton, ConfirmDialog, currencySymbol, useTheme } from './UI';

// Folding Expenses/Notes/Documents into Activity means a feed row needs to actually DO
// something when tapped, not just describe what happened. This sheet is that "something" —
// type-specific detail + the same actions the old standalone tabs had (edit/delete/pin for
// notes and documents; expenses are read-only here, same as everywhere else, because
// financial history is immutable once an expense is recorded — that's not a limitation of
// this sheet, it's a rule the rest of the app already follows).
export default function ActivityItemSheet({ tripId, event, baseCurrency, onClose, onChanged }) {
  const theme = useTheme();
  const [record, setRecord] = useState(null);
  const [splits, setSplits] = useState([]);
  const [editText, setEditText] = useState('');
  const [pendingDelete, setPendingDelete] = useState(false);

  const meta = (() => {
    try { return event?.metadata ? JSON.parse(event.metadata) : null; } catch { return null; }
  })();

  useEffect(() => {
    if (!event || !meta?.id) { setRecord(null); setSplits([]); return; }
    (async () => {
      if (event.type === 'note') setRecord(await getNoteById(meta.id));
      else if (event.type === 'document') setRecord(await getDocumentById(meta.id));
      else if (event.type === 'expense') {
        setRecord(await getExpenseById(meta.id));
        setSplits(await getExpenseSplits(meta.id));
      }
    })();
  }, [event?.id]);

  useEffect(() => {
    if (record?.text != null) setEditText(record.text);
  }, [record]);

  const visible = !!event && !!meta?.id && ['note', 'document', 'expense'].includes(event.type);
  if (!visible) return null;

  const saveNote = async () => {
    if (!editText.trim()) return;
    await updateNote(record.id, tripId, editText.trim());
    onChanged();
    onClose();
  };

  const confirmDeleteNote = async () => {
    setPendingDelete(false);
    await deleteNote(record.id, tripId);
    onChanged();
    onClose();
  };

  const confirmRemoveDoc = async () => {
    setPendingDelete(false);
    await deleteDocument(record.id, record.uri, tripId, record.name);
    onChanged();
    onClose();
  };

  const cs = currencySymbol(baseCurrency);

  return (
    <>
      <BottomSheet visible={visible} onClose={onClose}>
        {!record ? (
          <Text style={styles(theme).muted}>Loading…</Text>
        ) : event.type === 'note' ? (
          <>
            <Text style={styles(theme).title}>Note</Text>
            <TextInput
              style={styles(theme).textArea}
              value={editText}
              onChangeText={setEditText}
              multiline
              placeholder="Note text"
              placeholderTextColor={theme.inkMute}
            />
            <View style={styles(theme).row}>
              <SecondaryButton label={record.pinned_emergency ? 'Unpin from Safe Mode' : 'Pin to Safe Mode'} onPress={async () => { await togglePinnedNote(record.id); onChanged(); onClose(); }} style={{ flex: 1 }} />
            </View>
            <View style={[styles(theme).row, { marginTop: theme.space.sm }]}>
              <PrimaryButton label="Save" onPress={saveNote} style={{ flex: 1, marginEnd: theme.space.sm }} />
              <SecondaryButton label="Delete" onPress={() => setPendingDelete(true)} style={{ flex: 1 }} />
            </View>
          </>
        ) : event.type === 'document' ? (
          <>
            <Text style={styles(theme).title}>{record.name}</Text>
            <View style={[styles(theme).row, { marginTop: theme.space.md }]}>
              <PrimaryButton label="Open" onPress={() => openDocument(record.uri)} style={{ flex: 1, marginEnd: theme.space.sm }} />
              <SecondaryButton label={record.pinned_emergency ? 'Unpin' : 'Pin to Safe Mode'} onPress={async () => { await togglePinnedDocument(record.id); onChanged(); onClose(); }} style={{ flex: 1 }} />
            </View>
            <SecondaryButton label="Remove" onPress={() => setPendingDelete(true)} style={{ marginTop: theme.space.sm }} />
          </>
        ) : event.type === 'expense' ? (
          <>
            <Text style={styles(theme).title}>{record.paid_by} paid {cs}{record.amount}</Text>
            <Text style={styles(theme).muted}>
              {[record.category, record.description, record.funding_source === 'bank' ? 'Trip Bank' : 'Personal'].filter(Boolean).join(' · ')}
            </Text>
            {splits.length > 0 && (
              <Text style={[styles(theme).muted, { marginTop: theme.space.sm }]}>
                Split between: {splits.map((s) => s.traveler_name).join(', ')} ({cs}{splits[0].share_amount} each)
              </Text>
            )}
            <Text style={[styles(theme).muted, { marginTop: theme.space.md }]}>
              Expenses can't be edited once recorded — financial history stays immutable so settlement is always trustworthy.
            </Text>
          </>
        ) : null}
      </BottomSheet>

      <ConfirmDialog
        visible={pendingDelete}
        title={event.type === 'note' ? 'Delete note?' : 'Remove document?'}
        confirmLabel={event.type === 'note' ? 'Delete' : 'Remove'}
        destructive
        onConfirm={event.type === 'note' ? confirmDeleteNote : confirmRemoveDoc}
        onCancel={() => setPendingDelete(false)}
      />
    </>
  );
}

const styles = (theme) => StyleSheet.create({
  title: { fontSize: theme.type.heading, fontWeight: theme.weight.semibold, color: theme.ink, marginBottom: theme.space.sm },
  muted: { color: theme.inkMute, fontSize: theme.type.body, lineHeight: 20 },
  textArea: { backgroundColor: theme.bg, borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.line, padding: theme.space.md, color: theme.ink, minHeight: 90, textAlignVertical: 'top', marginBottom: theme.space.sm },
  row: { flexDirection: 'row' },
});
