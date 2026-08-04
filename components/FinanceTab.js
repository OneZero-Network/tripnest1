import React, { useState } from 'react';
import { View, Text, TextInput, Alert, StyleSheet } from 'react-native';
import { addContribution, setContributionPerPerson, closeTrip, reopenTrip } from '../db';
import { PrimaryButton, theme } from './UI';

export default function FinanceTab({ tripId, finance, onChanged }) {
  const [contribTraveler, setContribTraveler] = useState('');
  const [contribAmount, setContribAmount] = useState('');
  const [perPersonInput, setPerPersonInput] = useState('');

  const submitContribution = async () => {
    const amt = parseFloat(contribAmount);
    if (!amt || !contribTraveler) return;
    await addContribution(tripId, contribTraveler, amt);
    setContribAmount(''); setContribTraveler('');
    onChanged();
  };

  const saveFundTarget = async () => {
    const amt = parseFloat(perPersonInput);
    if (!amt) return;
    await setContributionPerPerson(tripId, amt);
    setPerPersonInput('');
    onChanged();
  };

  const confirmCloseTrip = () => {
    Alert.alert('Close trip?', 'This unlocks Final Settlement. You can reopen the trip later if needed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Close Trip', onPress: async () => { await closeTrip(tripId); onChanged(); } },
    ]);
  };

  return (
    <View style={styles.section}>
      <View style={styles.statusRow}>
        <Text style={styles.subheading}>Trip Fund (received)</Text>
        <Text style={[styles.badge, finance.tripStatus === 'closed' ? styles.badgeClosed : styles.badgeActive]}>
          {finance.tripStatus === 'closed' ? 'Closed' : 'Active'}
        </Text>
      </View>
      <Text style={styles.muted}>Equal-split target only for V2 — organizer sets one per-person amount.</Text>
      {finance.fundTarget != null ? (
        <Text style={styles.listItem}>
          Target: {finance.perPerson} × {finance.travelerCount} travelers = {finance.fundTarget}
          {'  '}(Received: {finance.totalReceived} / {finance.fundTarget - finance.totalReceived > 0 ? `${finance.fundTarget - finance.totalReceived} short` : 'fully funded'})
        </Text>
      ) : (
        <Text style={styles.listItem}>No target set yet.</Text>
      )}
      <View style={styles.row}>
        <TextInput style={styles.input} placeholder="Contribution per person" value={perPersonInput} onChangeText={setPerPersonInput} keyboardType="numeric" />
        <PrimaryButton label="Set Target" onPress={saveFundTarget} style={{ marginLeft: 8 }} />
      </View>
      <View style={styles.row}>
        <TextInput style={styles.input} placeholder="Traveler" value={contribTraveler} onChangeText={setContribTraveler} />
        <TextInput style={styles.input} placeholder="Amount" value={contribAmount} onChangeText={setContribAmount} keyboardType="numeric" />
        <PrimaryButton label="Add" onPress={submitContribution} style={{ marginLeft: 8 }} />
      </View>
      {finance.contributions.map((c) => (
        <Text key={c.id} style={styles.listItem}>{c.traveler} contributed {c.amount}</Text>
      ))}

      <Text style={styles.subheading}>Current Cash</Text>
      <Text style={styles.listItem}>Received: {finance.totalReceived}</Text>
      <Text style={styles.listItem}>Spent: {finance.totalSpent}</Text>
      <Text style={[styles.listItem, { fontWeight: '700' }]}>Remaining: {finance.currentCash}</Text>

      <Text style={styles.subheading}>Live Forecast (if trip ended today)</Text>
      {Object.entries(finance.liveForecast.balances).map(([name, bal]) => (
        <Text key={name} style={styles.listItem}>{name}: {bal >= 0 ? '+' : ''}{bal}</Text>
      ))}
      {finance.liveForecast.transactions.length === 0
        ? <Text style={styles.listItem}>All settled up.</Text>
        : finance.liveForecast.transactions.map((t, idx) => (
            <Text key={idx} style={styles.listItem}>{t.from} → {t.to}: {t.amount}</Text>
          ))}

      <Text style={styles.subheading}>Final Settlement</Text>
      {finance.tripStatus === 'closed' ? (
        <>
          {finance.finalSettlement.transactions.length === 0
            ? <Text style={styles.listItem}>All settled up.</Text>
            : finance.finalSettlement.transactions.map((t, idx) => (
                <Text key={idx} style={styles.listItem}>{t.from} → {t.to}: {t.amount}</Text>
              ))}
          <PrimaryButton
            label="Reopen Trip"
            onPress={async () => { await reopenTrip(tripId); onChanged(); }}
            style={{ backgroundColor: theme.primaryLight, marginTop: 10, alignSelf: 'flex-start' }}
          />
        </>
      ) : (
        <>
          <Text style={styles.muted}>Available once the trip is closed.</Text>
          <PrimaryButton label="Close Trip" onPress={confirmCloseTrip} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { flex: 1 },
  row: { flexDirection: 'row', marginBottom: 8 },
  input: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: theme.border, flex: 1 },
  listItem: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.primaryLight, color: theme.primary },
  subheading: { fontWeight: '700', marginTop: 10, marginBottom: 6, color: theme.primary },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  muted: { color: theme.muted, fontSize: 12, marginBottom: 8 },
  badge: { fontSize: 11, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, overflow: 'hidden' },
  badgeActive: { backgroundColor: theme.primaryLight, color: theme.primary },
  badgeClosed: { backgroundColor: theme.primary, color: '#fff' },
});
