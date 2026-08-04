import React, { useState } from 'react';
import { View, Text, TextInput, FlatList, Alert, StyleSheet } from 'react-native';
import { addNote, updateNote, deleteNote } from '../db';
import { ListRow, PrimaryButton, EmptyState, theme } from './UI';

export default function NotesTab({ tripId, notes, onChanged }) {
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(null); // {id, text}

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

  const confirmDelete = (note) => {
    Alert.alert('Delete note?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteNote(note.id, tripId); onChanged(); } },
    ]);
  };

  return (
    <View style={styles.section}>
      <View style={styles.row}>
        <TextInput style={styles.input} placeholder="Add a note" placeholderTextColor={theme.inkMute} value={text} onChangeText={setText} />
        <PrimaryButton label="Save" onPress={submit} style={{ marginLeft: 8 }} />
      </View>
      <FlatList
        data={notes}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          editing?.id === item.id ? (
            <View style={styles.row}>
              <TextInput style={styles.input} value={editing.text} onChangeText={(t) => setEditing({ ...editing, text: t })} autoFocus />
              <PrimaryButton label="Save" onPress={saveEdit} style={{ marginLeft: 8 }} />
            </View>
          ) : (
            <ListRow icon="note" onPress={() => setEditing({ id: item.id, text: item.text })} actionLabel="Delete" onAction={() => confirmDelete(item)}>
              <Text style={styles.listItem}>{item.text}</Text>
            </ListRow>
          )
        )}
        ListEmptyComponent={
          <EmptyState
            icon="note"
            title="No notes yet"
            hint="Wifi passwords, packing reminders, anything worth remembering — jot it down above."
            optional
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { flex: 1 },
  row: { flexDirection: 'row', marginBottom: 8 },
  input: { backgroundColor: '#fff', borderRadius: theme.radius.sm, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: theme.line, flex: 1, color: theme.ink },
  listItem: { fontSize: 14.5, color: theme.ink, lineHeight: 20 },
});
