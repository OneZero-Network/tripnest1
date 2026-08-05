import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { getDB, renameTraveler, removeTraveler } from '../db';
import { PrimaryButton, EmptyState, Card, ConfirmDialog, currencySymbol, useTheme } from './UI';
import TripBankSettingsSheet from './TripBankSettingsSheet';

// A small fixed palette, picked deterministically per name (not random per render) so a
// traveler's avatar color stays the same every time you open the trip — that consistency
// is what makes avatars actually useful for fast recognition, not just decoration.
const AVATAR_COLORS = ['#0E7C86', '#B4790B', '#5B9CF6', '#C2413A', '#7C5CBF', '#2E9E6B'];
function avatarColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

// MEMBERS: focused only on people, per the UX simplification — no finance forms here.
// Contributions now happen through the Add flow (Universal Capture → Contribution), and
// the detailed settlement math lives in Settle/Advanced. Each person shows two numbers,
// not one: what they've actually paid (contributions + personal expenses), and their net
// settlement position — "Paid ₹288 / Net +₹192" is more legible than a single balance
// number the reader has to reconstruct the story behind.
//
// NOT built here, on purpose rather than by oversight: a "You" badge on one traveler.
// This app has no login or device-owner identity anywhere in the data model — every
// traveler is just a name in a table, with no concept of "which one is using this phone."
// Picking one arbitrarily (e.g. the first added) to label "You" would be a guess dressed
// up as a fact. That's a real feature (device-linked identity) to build deliberately, not
// something to fake here.
export default function TravelersTab({ tripId, travelers, expenses, finance, onChanged }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [newName, setNewName] = useState('');
  const [addingOpen, setAddingOpen] = useState(false);
  const [editing, setEditing] = useState(null); // {id, name}
  const [pendingRemove, setPendingRemove] = useState(null);
  const [blockedRemove, setBlockedRemove] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const addTraveler = async () => {
    if (!newName.trim()) return;
    const db = await getDB();
    const id = String(Date.now()) + Math.random().toString(36).slice(2);
    await db.runAsync('INSERT INTO travelers (id, trip_id, name) VALUES (?, ?, ?)', id, tripId, newName.trim());
    setNewName(''); setAddingOpen(false);
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
    if (!result.ok && result.reason === 'referenced') setBlockedRemove(traveler);
    onChanged();
  };

  const contributedByName = useMemo(() => {
    const totals = {};
    (finance?.contributions || []).forEach((c) => {
      totals[c.traveler] = (totals[c.traveler] || 0) + c.amount * c.fx_rate;
    });
    return totals;
  }, [finance?.contributions]);

  // "Paid" is the real total this person has put toward the trip — contributions to the
  // Trip Bank plus personal expenses they fronted out of pocket. Only personal-funding
  // expenses count here; a bank-funded expense's "paid_by" represents who logged it, not
  // who's personally out that money, since the Trip Bank covered it. This was previously
  // contributions-only, understating anyone who mostly paid personally rather than into
  // a shared pool — a real gap, not a display choice, now fixed.
  const spentByName = useMemo(() => {
    const totals = {};
    (expenses || []).forEach((e) => {
      if (e.funding_source === 'personal') {
        totals[e.paid_by] = (totals[e.paid_by] || 0) + e.amount * e.fx_rate;
      }
    });
    return totals;
  }, [expenses]);

  const paidByName = useMemo(() => {
    const totals = { ...contributedByName };
    Object.entries(spentByName).forEach(([name, amt]) => {
      totals[name] = (totals[name] || 0) + amt;
    });
    return totals;
  }, [contributedByName, spentByName]);

  // Net balance across both the Trip Bank and personal-expense settlements — the one
  // number that answers "is this person ahead or behind" without the reader needing to
  // know those are two separate computations under the hood.
  const netBalance = (name) => {
    const bank = finance?.bankSettlement?.balances?.[name] || 0;
    const personal = finance?.liveForecast?.balances?.[name] || 0;
    return +(bank + personal).toFixed(2);
  };

  const cs = currencySymbol(finance?.baseCurrency || 'INR');

  return (
    <View style={styles.section}>
      {travelers.length > 0 && finance?.hasTripBank !== false && (
        <Card style={{ padding: theme.space.lg, marginBottom: theme.space.md, backgroundColor: theme.brandDeep, borderWidth: 0 }}>
          <View style={styles.poolHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.poolLabel}>TRIP BANK POOL</Text>
              <Text style={styles.poolValue}>{cs}{(finance?.totalReceived || 0).toFixed(0)}</Text>
              <Text style={styles.poolSub}>Contributed by {travelers.length} member{travelers.length === 1 ? '' : 's'}</Text>
            </View>
            <TouchableOpacity onPress={() => setSettingsOpen(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Trip Bank settings" accessibilityRole="button">
              <Feather name="settings" size={18} color="rgba(255,255,255,0.85)" />
            </TouchableOpacity>
          </View>
        </Card>
      )}

      {travelers.length === 0 ? (
        <EmptyState
          icon="traveler"
          title="Add who's coming"
          hint="Travelers are needed before expenses can be split or settled. Add everyone joining this trip."
        />
      ) : (
        <Card>
          {travelers.map((item, i) => {
            const bal = netBalance(item.name);
            return editing?.id === item.id ? (
              <View key={item.id} style={[styles.row, styles.editRow, i < travelers.length - 1 && styles.ledgerDivider]}>
                <TextInput style={styles.input} value={editing.name} onChangeText={(t) => setEditing({ ...editing, name: t })} autoFocus />
                <PrimaryButton label="Save" onPress={saveEdit} style={{ marginStart: theme.space.sm }} />
              </View>
            ) : (
              <View key={item.id} style={[styles.memberRow, i < travelers.length - 1 && styles.ledgerDivider]}>
                <View style={[styles.avatar, { backgroundColor: avatarColor(item.name) }]}>
                  <Text style={styles.avatarText}>{item.name.trim().charAt(0).toUpperCase()}</Text>
                </View>
                <TouchableOpacity style={{ flex: 1 }} onPress={() => setEditing({ id: item.id, name: item.name })}>
                  <Text style={styles.memberName}>{item.name}</Text>
                  <Text style={styles.memberSub}>
                    Paid {cs}{(paidByName[item.name] || 0).toFixed(0)}
                    {spentByName[item.name] > 0 ? ` · Spent ${cs}${spentByName[item.name].toFixed(0)}` : ''}
                  </Text>
                </TouchableOpacity>
                <View style={styles.memberRight}>
                  <Text style={[styles.balanceText, bal < 0 && styles.negative]}>
                    Net {bal >= 0 ? '+' : ''}{cs}{bal}
                  </Text>
                  <Text style={styles.balanceHint}>{bal > 0 ? 'gets back' : bal < 0 ? 'owes' : 'settled'}</Text>
                  <Text style={styles.removeLink} onPress={() => setPendingRemove(item)}>Remove</Text>
                </View>
              </View>
            );
          })}
        </Card>
      )}

      {addingOpen ? (
        <View style={[styles.row, { marginTop: theme.space.md }]}>
          <TextInput style={styles.input} placeholder="Traveler name" placeholderTextColor={theme.inkMute} value={newName} onChangeText={setNewName} autoFocus />
          <PrimaryButton label="Add" onPress={addTraveler} style={{ marginStart: theme.space.sm }} />
        </View>
      ) : (
        <PrimaryButton label="+ Add Member" onPress={() => setAddingOpen(true)} style={{ marginTop: theme.space.md }} />
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
      <TripBankSettingsSheet
        tripId={tripId}
        finance={finance}
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onChanged={onChanged}
      />
    </View>
  );
}

const makeStyles = (theme) => StyleSheet.create({
  section: { flex: 1, paddingBottom: theme.space.xxl },
  row: { flexDirection: 'row' },
  editRow: { padding: theme.space.md },
  ledgerDivider: { borderBottomWidth: 1, borderBottomColor: theme.line },
  input: { backgroundColor: theme.surface, borderRadius: theme.radius.sm, paddingHorizontal: 14, minHeight: theme.a11y.minTouchTarget, borderWidth: 1, borderColor: theme.line, flex: 1, color: theme.ink },
  poolHeaderRow: { flexDirection: 'row', alignItems: 'flex-start' },
  poolLabel: { color: 'rgba(255,255,255,0.75)', fontSize: theme.type.caption, fontWeight: theme.weight.semibold, letterSpacing: 0.5 },
  poolValue: { color: '#fff', fontSize: theme.type.hero, fontWeight: theme.weight.semibold, marginTop: 4 },
  poolSub: { color: 'rgba(255,255,255,0.75)', fontSize: theme.type.caption, marginTop: 4 },
  memberRow: { flexDirection: 'row', alignItems: 'center', padding: theme.space.md },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginEnd: theme.space.md },
  avatarText: { color: '#fff', fontSize: theme.type.body, fontWeight: theme.weight.semibold },
  memberName: { fontSize: theme.type.body, fontWeight: theme.weight.semibold, color: theme.ink },
  memberSub: { fontSize: theme.type.caption, color: theme.inkMute, marginTop: 2 },
  memberRight: { alignItems: 'flex-end' },
  balanceText: { fontSize: theme.type.body, fontWeight: theme.weight.semibold, color: theme.brandDeep },
  negative: { color: theme.danger },
  balanceHint: { fontSize: 10.5, color: theme.inkMute, marginTop: 1 },
  removeLink: { fontSize: 10.5, color: theme.danger, fontWeight: theme.weight.semibold, marginTop: 4 },
});
