import React, {useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { addNote, updateNote, deleteNote, togglePinnedNote } from '../db';
import { PrimaryButton, EmptyState, LedgerList, LedgerRow, ConfirmDialog, useTheme } from './UI';

export default function NotesTab({ tripId, notes, onChanged }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(null); // {id, text}
  const [pendingDelete, setPendingDelete] = useState(null);

  const submit = async () => {
    if (!text.trim()) return;
    await addNote(tripId, text.trim());
    setText('');
    onChanged();
  };

  const saveEdit = async () => {
    if (!editing || !editing.text.trim()) return;
    await updateNote(editing.id, tripId, editing.text.trim());
    setEditing(null);
    onChanged();
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    await deleteNote(pendingDelete.id, tripId);
    setPendingDelete(null);
    onChanged();
  };

  return (
    <View style={styles.section}>
      <View style={styles.row}>
        <TextInput style={styles.input} placeholder="Add a note" placeholderTextColor={theme.inkMute} value={text} onChangeText={setText} />
        <PrimaryButton label="Save" onPress={submit} style={{ marginStart: theme.space.sm }} />
      </View>

      {notes.length === 0 ? (
        <EmptyState
          icon="note"
          title="Jot down the first thing worth remembering"
          hint="Wifi passwords, packing reminders, anything worth remembering — jot it down above."
          optional
        />
      ) : (
        <LedgerList>
          {notes.map((item, i) =>
            editing?.id === item.id ? (
              <View key={item.id} style={[styles.row, styles.editRow, i < notes.length - 1 && styles.ledgerDivider]}>
                <TextInput style={styles.input} value={editing.text} onChangeText={(t) => setEditing({ ...editing, text: t })} autoFocus />
                <PrimaryButton label="Save" onPress={saveEdit} style={{ marginStart: theme.space.sm }} />
              </View>
            ) : (
              <LedgerRow
                key={item.id}
                icon="note"
                onPress={() => setEditing({ id: item.id, text: item.text })}
                actionLabel="Delete"
                onAction={() => setPendingDelete(item)}
                isLast={i === notes.length - 1}
              >
                <Text style={styles.listItem}>{item.text}</Text>
                <TouchableOpacity
                  style={styles.pinBtn}
                  onPress={() => { togglePinnedNote(item.id); onChanged(); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Feather name="shield" size={12} color={item.pinned_emergency ? theme.danger : theme.inkMute} />
                  <Text style={[styles.pinText, item.pinned_emergency && { color: theme.danger }]}>
                    {item.pinned_emergency ? 'In Safe Mode' : 'Pin to Safe Mode'}
                  </Text>
                </TouchableOpacity>
              </LedgerRow>
            )
          )}
        </LedgerList>
      )}

      <ConfirmDialog
        visible={!!pendingDelete}
        title="Delete note?"
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </View>
  );
}

const makeStyles = (theme) => StyleSheet.create({
  section: { flex: 1 },
  row: { flexDirection: 'row', marginBottom: theme.space.sm },
  editRow: { padding: theme.space.md, marginBottom: 0 },
  ledgerDivider: { borderBottomWidth: 1, borderBottomColor: theme.line },
  input: { backgroundColor: theme.surface, borderRadius: theme.radius.sm, paddingHorizontal: 14, minHeight: theme.a11y.minTouchTarget, borderWidth: 1, borderColor: theme.line, flex: 1, color: theme.ink },
  listItem: { fontSize: theme.type.body, color: theme.ink, lineHeight: 20 },
  pinBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  pinText: { fontSize: 11, color: theme.inkMute, fontWeight: theme.weight.semibold },
});
