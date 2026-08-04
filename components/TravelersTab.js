import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { getDB, renameTraveler, removeTraveler, addContribution } from '../db';
import { PrimaryButton, EmptyState, LedgerList, LedgerRow, Card, SectionHeader, ConfirmDialog, SuccessToast, currencySymbol, useTheme } from './UI';

export default function TravelersTab({ tripId, travelers, finance, onChanged }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState(null); // {id, name}
  const [pendingRemove, setPendingRemove] = useState(null);
  const [blockedRemove, setBlockedRemove] = useState(null); // traveler that couldn't be removed
  const [topUpFor, setTopUpFor] = useState(null); // traveler name currently topping up
  const [topUpAmount, setTopUpAmount] = useState('');
  const [savedAt, setSavedAt] = useState(null);

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

  const submitTopUp = async () => {
    const amt = parseFloat(topUpAmount);
    if (!amt || !topUpFor) return;
    await addContribution(tripId, topUpFor, amt);
    setTopUpFor(null); setTopUpAmount('');
    setSavedAt(Date.now());
    onChanged();
  };

  // Per-traveler contribution total — same contributions data Finance already computes,
  // just re-summed here so the Travelers tab can answer "who's put money in" without
  // sending the organizer over to Finance for something this immediate.
  const contributedByName = useMemo(() => {
    const totals = {};
    (finance?.contributions || []).forEach((c) => {
      totals[c.traveler] = (totals[c.traveler] || 0) + c.amount * c.fx_rate;
    });
    return totals;
  }, [finance?.contributions]);

  const cs = currencySymbol(finance?.baseCurrency || 'INR');

  return (
    <View style={styles.section}>
      <SuccessToast trigger={savedAt} message="Contribution added" />

      {travelers.length > 0 && (
        <Card style={{ padding: theme.space.lg, marginBottom: theme.space.md }}>
          <SectionHeader title="Trip Bank pool" />
          {travelers.map((t) => (
            <View key={t.id} style={styles.poolRow}>
              <Text style={styles.poolName}>{t.name} gave {cs}{(contributedByName[t.name] || 0).toFixed(0)}</Text>
              {topUpFor === t.name ? (
                <View style={styles.topUpRow}>
                  <TextInput
                    style={styles.topUpInput}
                    placeholder="Amount"
                    placeholderTextColor={theme.inkMute}
                    value={topUpAmount}
                    onChangeText={setTopUpAmount}
                    keyboardType="numeric"
                    autoFocus
                  />
                  <PrimaryButton label="Add" onPress={submitTopUp} style={{ marginStart: theme.space.xs }} />
                </View>
              ) : (
                <Text style={styles.topUpLink} onPress={() => { setTopUpFor(t.name); setTopUpAmount(''); }}>Top up</Text>
              )}
            </View>
          ))}
          <Text style={styles.poolTotal}>Trip Bank total: {cs}{(finance?.totalReceived || 0).toFixed(0)}</Text>
        </Card>
      )}

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

const makeStyles = (theme) => StyleSheet.create({
  section: { flex: 1 },
  row: { flexDirection: 'row', marginBottom: theme.space.sm },
  editRow: { padding: theme.space.md, marginBottom: 0 },
  ledgerDivider: { borderBottomWidth: 1, borderBottomColor: theme.line },
  input: { backgroundColor: theme.surface, borderRadius: theme.radius.sm, paddingHorizontal: 14, minHeight: theme.a11y.minTouchTarget, borderWidth: 1, borderColor: theme.line, flex: 1, color: theme.ink },
  listItem: { fontSize: theme.type.body, fontWeight: theme.weight.semibold, color: theme.ink },
  poolRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: theme.space.xs },
  poolName: { fontSize: theme.type.body, color: theme.inkSoft },
  topUpLink: { fontSize: theme.type.caption, fontWeight: theme.weight.semibold, color: theme.brandDeep },
  topUpRow: { flexDirection: 'row', alignItems: 'center' },
  topUpInput: { backgroundColor: theme.bg, borderRadius: theme.radius.sm, paddingHorizontal: 10, minHeight: 36, width: 80, borderWidth: 1, borderColor: theme.line, color: theme.ink, fontSize: theme.type.caption },
  poolTotal: { fontSize: theme.type.body, fontWeight: theme.weight.semibold, color: theme.ink, marginTop: theme.space.sm, borderTopWidth: 1, borderTopColor: theme.line, paddingTop: theme.space.sm },
});
