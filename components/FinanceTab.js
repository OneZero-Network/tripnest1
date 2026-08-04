import React, { useState } from 'react';
import { View, Text, TextInput, Alert, ScrollView, StyleSheet } from 'react-native';
import { addContribution, setContributionPerPerson, closeTrip, reopenTrip } from '../db';
import { PrimaryButton, Card, StatHero, SectionHeader, theme } from './UI';

// Redesigned around the hero pattern: Current Cash is the one number that answers
// "are we okay financially, right now" — everything else (fund target, forecast, final
// settlement) is demoted into its own clearly-labeled card below, instead of five
// same-weight subheadings stacked in a row, which is what made this screen feel dense.
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

  const fundShort = finance.fundTarget != null ? finance.fundTarget - finance.totalReceived : null;

  return (
    <ScrollView style={styles.section} showsVerticalScrollIndicator={false}>
      <StatHero
        label="Current cash"
        value={String(finance.currentCash)}
        sublabel={`Received ${finance.totalReceived} · Spent ${finance.totalSpent}`}
      >
        <View style={styles.statusPill}>
          <Text style={styles.statusPillText}>{finance.tripStatus === 'closed' ? 'Trip closed' : 'Trip active'}</Text>
        </View>
      </StatHero>

      <Card style={{ padding: 16, marginTop: 16 }}>
        <SectionHeader title="Trip Fund" />
        <Text style={styles.muted}>Equal-split target — organizer sets one per-person amount.</Text>
        {finance.fundTarget != null ? (
          <Text style={styles.fundLine}>
            Target {finance.fundTarget} ({finance.perPerson} × {finance.travelerCount}) —{' '}
            {fundShort > 0 ? `${fundShort} short` : 'fully funded'}
          </Text>
        ) : (
          <Text style={styles.fundLine}>No target set yet.</Text>
        )}
        <View style={styles.row}>
          <TextInput style={styles.input} placeholder="Contribution per person" placeholderTextColor={theme.inkMute} value={perPersonInput} onChangeText={setPerPersonInput} keyboardType="numeric" />
          <PrimaryButton label="Set" onPress={saveFundTarget} style={{ marginLeft: 8 }} />
        </View>
        <View style={styles.row}>
          <TextInput style={styles.input} placeholder="Traveler" placeholderTextColor={theme.inkMute} value={contribTraveler} onChangeText={setContribTraveler} />
          <TextInput style={styles.input} placeholder="Amount" placeholderTextColor={theme.inkMute} value={contribAmount} onChangeText={setContribAmount} keyboardType="numeric" />
          <PrimaryButton label="Add" onPress={submitContribution} style={{ marginLeft: 8 }} />
        </View>
        {finance.contributions.map((c) => (
          <Text key={c.id} style={styles.listItem}>{c.traveler} contributed {c.amount}</Text>
        ))}
      </Card>

      <Card style={{ padding: 16, marginTop: 12 }}>
        <SectionHeader title="Live Forecast · if the trip ended today" />
        {Object.entries(finance.liveForecast.balances).map(([name, bal]) => (
          <Text key={name} style={styles.listItem}>{name}: {bal >= 0 ? '+' : ''}{bal}</Text>
        ))}
        {finance.liveForecast.transactions.length === 0
          ? <Text style={styles.listItem}>All settled up.</Text>
          : finance.liveForecast.transactions.map((t, idx) => (
              <Text key={idx} style={styles.listItem}>{t.from} → {t.to}: {t.amount}</Text>
            ))}
      </Card>

      <Card style={{ padding: 16, marginTop: 12, marginBottom: 24 }}>
        <SectionHeader title="Final Settlement" />
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
              style={{ backgroundColor: theme.brandWash, marginTop: 10, alignSelf: 'flex-start' }}
            />
          </>
        ) : (
          <>
            <Text style={styles.muted}>Available once the trip is closed.</Text>
            <PrimaryButton label="Close Trip" icon="lock" onPress={confirmCloseTrip} style={{ marginTop: 8, alignSelf: 'flex-start' }} />
          </>
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  section: { flex: 1 },
  row: { flexDirection: 'row', marginTop: 10 },
  input: { backgroundColor: theme.bg, borderRadius: theme.radius.sm, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, borderColor: theme.line, flex: 1, color: theme.ink },
  listItem: { fontSize: 14, color: theme.inkSoft, paddingVertical: 6 },
  fundLine: { fontSize: 13.5, color: theme.inkSoft, marginTop: 4 },
  muted: { color: theme.inkMute, fontSize: 12.5 },
  statusPill: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, marginTop: 14 },
  statusPillText: { color: '#fff', fontSize: 11.5, fontWeight: '700' },
});
