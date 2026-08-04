import React, { useState } from 'react';
import { View, Text, TextInput, FlatList, Alert, StyleSheet } from 'react-native';
import { getDB, renameTraveler, removeTraveler } from '../db';
import { ListRow, PrimaryButton, EmptyState, theme } from './UI';

export default function TravelersTab({ tripId, travelers, onChanged }) {
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState(null); // {id, name}

  const addTraveler = async () => {
    if (!newName.trim()) return;
    const db = await getDB();
    const id = String(Date.now()) + Math.random().toString(36).slice(2);
    await db.runAsync('INSERT INTO travelers (id, trip_id, name) VALUES (?, ?, ?)', id, tripId, newName.trim());
    setNewName('');
    onChanged();
  };

  const saveEdit = async () => {
    if (!editing || !editing.name.trim()) return;
    await renameTraveler(editing.id, tripId, editing.name.trim());
    setEditing(null);
    onChanged();
  };

  const confirmRemove = (traveler) => {
    Alert.alert('Remove traveler?', `Remove ${traveler.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          const result = await removeTraveler(traveler.id, tripId);
          if (!result.ok && result.reason === 'referenced') {
            Alert.alert('Cannot remove', `${traveler.name} has expenses on record. Financial history is immutable, so travelers referenced by an expense can't be removed.`);
          }
          onChanged();
        }
      },
    ]);
  };

  return (
    <View style={styles.section}>
      <View style={styles.row}>
        <TextInput style={styles.input} placeholder="Traveler name" value={newName} onChangeText={setNewName} />
        <PrimaryButton label="Add" onPress={addTraveler} style={{ marginLeft: 8 }} />
      </View>
      <FlatList
        data={travelers}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          editing?.id === item.id ? (
            <View style={styles.row}>
              <TextInput style={styles.input} value={editing.name} onChangeText={(t) => setEditing({ ...editing, name: t })} autoFocus />
              <PrimaryButton label="Save" onPress={saveEdit} style={{ marginLeft: 8 }} />
            </View>
          ) : (
            <ListRow onPress={() => setEditing({ id: item.id, name: item.name })} actionLabel="Remove" onAction={() => confirmRemove(item)}>
              <Text style={styles.listItem}>👤 {item.name}</Text>
            </ListRow>
          )
        )}
        ListEmptyComponent={<EmptyState text="No travelers yet." />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { flex: 1 },
  row: { flexDirection: 'row', marginBottom: 8 },
  input: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: theme.border, flex: 1 },
  listItem: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.primaryLight, color: theme.primary },
});
