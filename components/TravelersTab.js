import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { getDB, renameTraveler, removeTraveler } from '../db';
import { PrimaryButton, EmptyState, LedgerList, LedgerRow, ConfirmDialog, theme } from './UI';

export default function TravelersTab({ tripId, travelers, onChanged }) {
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState(null); // {id, name}
  const [pendingRemove, setPendingRemove] = useState(null);
  const [blockedRemove, setBlockedRemove] = useState(null); // traveler that couldn't be removed

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

  const confirmRemove = async () => {
    if (!pendingRemove) return;
    const traveler = pendingRemove;
    setPendingRemove(null);
    const result = await removeTraveler(traveler.id, tripId);
    if (!result.ok && result.reason === 'referenced') {
      setBlockedRemove(traveler);
    }
    onChanged();
  };

  return (
    <View style={styles.section}>
      <View style={styles.row}>
        <TextInput style={styles.input} placeholder="Traveler name" placeholderTextColor={theme.inkMute} value={newName} onChangeText={setNewName} />
        <PrimaryButton label="Add" onPress={addTraveler} style={{ marginStart: theme.space.sm }} />
      </View>

      {travelers.length === 0 ? (
        <EmptyState
          icon="traveler"
          title="Add who's coming"
          hint="Travelers are needed before expenses can be split or settled. Add everyone joining this trip."
        />
      ) : (
        <LedgerList>
          {travelers.map((item, i) =>
            editing?.id === item.id ? (
              <View key={item.id} style={[styles.row, styles.editRow, i < travelers.length - 1 && styles.ledgerDivider]}>
                <TextInput style={styles.input} value={editing.name} onChangeText={(t) => setEditing({ ...editing, name: t })} autoFocus />
                <PrimaryButton label="Save" onPress={saveEdit} style={{ marginStart: theme.space.sm }} />
              </View>
            ) : (
              <LedgerRow
                key={item.id}
                icon="traveler"
                onPress={() => setEditing({ id: item.id, name: item.name })}
                actionLabel="Remove"
                onAction={() => setPendingRemove(item)}
                isLast={i === travelers.length - 1}
              >
                <Text style={styles.listItem}>{item.name}</Text>
              </LedgerRow>
            )
          )}
        </LedgerList>
      )}

      <ConfirmDialog
        visible={!!pendingRemove}
        title="Remove traveler?"
        message={pendingRemove ? `Remove ${pendingRemove.name}?` : ''}
        confirmLabel="Remove"
        destructive
        onConfirm={confirmRemove}
        onCancel={() => setPendingRemove(null)}
      />
      <ConfirmDialog
        visible={!!blockedRemove}
        title="Cannot remove"
        message={blockedRemove ? `${blockedRemove.name} has expenses on record. Financial history is immutable, so travelers referenced by an expense can't be removed.` : ''}
        confirmLabel="Got it"
        cancelLabel="Close"
        onConfirm={() => setBlockedRemove(null)}
        onCancel={() => setBlockedRemove(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { flex: 1 },
  row: { flexDirection: 'row', marginBottom: theme.space.sm },
  editRow: { padding: theme.space.md, marginBottom: 0 },
  ledgerDivider: { borderBottomWidth: 1, borderBottomColor: theme.line },
  input: { backgroundColor: theme.surface, borderRadius: theme.radius.sm, paddingHorizontal: 14, minHeight: theme.a11y.minTouchTarget, borderWidth: 1, borderColor: theme.line, flex: 1, color: theme.ink },
  listItem: { fontSize: theme.type.body, fontWeight: theme.weight.semibold, color: theme.ink },
});
