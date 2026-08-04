import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet } from 'react-native';
import { addContribution, setContributionPerPerson, setCustodian, recordSettlement, closeTrip, reopenTrip } from '../db';
import { PrimaryButton, Card, StatHero, SectionHeader, ConfirmDialog, currencySymbol, useTheme } from './UI';

// Redesigned around the hero pattern: Current Cash is the one number that answers
// "are we okay financially, right now" — everything else (fund target, forecast, final
// settlement) is demoted into its own clearly-labeled card below, instead of five
// same-weight subheadings stacked in a row, which is what made this screen feel dense.
export default function FinanceTab({ tripId, finance, onChanged }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [contribTraveler, setContribTraveler] = useState('');
  const [contribAmount, setContribAmount] = useState('');
  const [perPersonInput, setPerPersonInput] = useState('');
  const [custodianInput, setCustodianInput] = useState(finance.custodian || '');
  const [pendingSettle, setPendingSettle] = useState(null); // {from, to, amount}
  const [pendingClose, setPendingClose] = useState(false);

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

  const saveCustodian = async () => {
    if (!custodianInput.trim()) return;
    await setCustodian(tripId, custodianInput.trim());
    onChanged();
  };

  const confirmSettle = async () => {
    if (!pendingSettle) return;
    const t = pendingSettle;
    setPendingSettle(null);
    await recordSettlement(tripId, t.from, t.to, t.amount);
    onChanged();
  };

  const confirmCloseTrip = async () => {
    setPendingClose(false);
    await closeTrip(tripId);
    onChanged();
  };

  const fundShort = finance.fundTarget != null ? finance.fundTarget - finance.totalReceived : null;

  return (
    <ScrollView style={styles.section} showsVerticalScrollIndicator={false}>
      <StatHero
        label="Current cash"
        value={`${currencySymbol(finance.baseCurrency)}${finance.currentCash}`}
        sublabel={`Received ${currencySymbol(finance.baseCurrency)}${finance.totalReceived} · Spent ${currencySymbol(finance.baseCurrency)}${finance.totalSpent} · in ${finance.baseCurrency}`}
      >
        <View style={styles.statusPill}>
          <Text style={styles.statusPillText}>{finance.tripStatus === 'closed' ? 'Trip closed' : 'Trip active'}</Text>
        </View>
      </StatHero>

      <Card style={{ padding: theme.space.lg, marginTop: theme.space.lg }}>
        <SectionHeader title="Fund custodian" />
        <Text style={styles.muted}>
          The one person (POC) who actually holds the pooled cash — a name, or "Name — bank/UPI",
          so everyone knows exactly where to send their contribution instead of paying each other ad hoc.
        </Text>
        {finance.custodian ? (
          <Text style={styles.fundLine}>Contributions are consolidated with: {finance.custodian}</Text>
        ) : (
          <Text style={styles.fundLine}>No custodian set yet — contributions are currently just logged, not routed anywhere.</Text>
        )}
        <View style={styles.row}>
          <TextInput
            style={styles.input}
            placeholder='e.g. "Ayaz — SBI a/c 1234" or "Ayaz — UPI"'
            placeholderTextColor={theme.inkMute}
            value={custodianInput}
            onChangeText={setCustodianInput}
          />
          <PrimaryButton label="Set" onPress={saveCustodian} style={{ marginStart: theme.space.sm }} />
        </View>
      </Card>

      <Card style={{ padding: theme.space.lg, marginTop: theme.space.md }}>
        <SectionHeader title="Trip fund" />
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
          <PrimaryButton label="Set" onPress={saveFundTarget} style={{ marginStart: theme.space.sm }} />
        </View>
        <View style={styles.row}>
          <TextInput style={styles.input} placeholder="Traveler" placeholderTextColor={theme.inkMute} value={contribTraveler} onChangeText={setContribTraveler} />
          <TextInput style={styles.input} placeholder="Amount" placeholderTextColor={theme.inkMute} value={contribAmount} onChangeText={setContribAmount} keyboardType="numeric" />
          <PrimaryButton label="Add" onPress={submitContribution} style={{ marginStart: theme.space.sm }} />
        </View>
        {finance.contributions.map((c) => (
          <Text key={c.id} style={styles.listItem}>
            {c.traveler} contributed {c.amount} {c.currency !== finance.baseCurrency ? `${c.currency} (≈ ${(c.amount * c.fx_rate).toFixed(2)} ${finance.baseCurrency})` : ''}{finance.custodian ? ` → held by ${finance.custodian}` : ''}
          </Text>
        ))}
      </Card>

      <Card style={{ padding: theme.space.lg, marginTop: theme.space.md }}>
        <SectionHeader title="Live forecast · if the trip ended today" />
        {Object.entries(finance.liveForecast.balances).map(([name, bal]) => (
          <Text key={name} style={styles.listItem}>{name}: {bal >= 0 ? '+' : ''}{currencySymbol(finance.baseCurrency)}{bal}</Text>
        ))}
        {finance.liveForecast.transactions.length === 0 ? (
          <Text style={styles.listItem}>All settled up.</Text>
        ) : (
          finance.liveForecast.transactions.map((t, idx) => (
            <View key={idx} style={styles.settleRow}>
              <Text style={styles.listItem}>{t.from} → {t.to}: {currencySymbol(finance.baseCurrency)}{t.amount}</Text>
              <Text style={styles.settleAction} onPress={() => setPendingSettle(t)}>Mark settled</Text>
            </View>
          ))
        )}
        {finance.liveForecast.settledTransactions?.length > 0 && (
          <View style={{ marginTop: theme.space.sm }}>
            <Text style={styles.mutedSmall}>Already settled</Text>
            {finance.liveForecast.settledTransactions.map((s) => (
              <Text key={s.id} style={styles.settledLine}>✓ {s.from_traveler} paid {s.to_traveler} {s.amount}</Text>
            ))}
          </View>
        )}
      </Card>

      <Card style={{ padding: theme.space.lg, marginTop: theme.space.md, marginBottom: theme.space.xxl }}>
        <SectionHeader title="Final settlement" />
        {finance.tripStatus === 'closed' ? (
          <>
            {finance.finalSettlement.transactions.length === 0
              ? <Text style={styles.listItem}>All settled up.</Text>
              : finance.finalSettlement.transactions.map((t, idx) => (
                  <View key={idx} style={styles.settleRow}>
                    <Text style={styles.listItem}>{t.from} → {t.to}: {currencySymbol(finance.baseCurrency)}{t.amount}</Text>
                    <Text style={styles.settleAction} onPress={() => setPendingSettle(t)}>Mark settled</Text>
                  </View>
                ))}
            <PrimaryButton
              label="Reopen trip"
              onPress={async () => { await reopenTrip(tripId); onChanged(); }}
              style={{ backgroundColor: theme.brandWash, marginTop: theme.space.sm, alignSelf: 'flex-start' }}
            />
          </>
        ) : (
          <>
            <Text style={styles.muted}>Available once the trip is closed.</Text>
            <PrimaryButton label="Close trip" icon="lock" onPress={() => setPendingClose(true)} style={{ marginTop: theme.space.sm, alignSelf: 'flex-start' }} />
          </>
        )}
      </Card>

      <ConfirmDialog
        visible={!!pendingSettle}
        title="Mark as settled?"
        message={pendingSettle ? `Record that ${pendingSettle.from} paid ${pendingSettle.to} ${pendingSettle.amount}. This removes it from the outstanding list.` : ''}
        confirmLabel="Mark settled"
        onConfirm={confirmSettle}
        onCancel={() => setPendingSettle(null)}
      />
      <ConfirmDialog
        visible={pendingClose}
        title="Close trip?"
        message="This unlocks Final Settlement. You can reopen the trip later if needed."
        confirmLabel="Close trip"
        onConfirm={confirmCloseTrip}
        onCancel={() => setPendingClose(false)}
      />
    </ScrollView>
  );
}

const makeStyles = (theme) => StyleSheet.create({
  section: { flex: 1 },
  row: { flexDirection: 'row', marginTop: theme.space.sm },
  input: { backgroundColor: theme.bg, borderRadius: theme.radius.sm, paddingHorizontal: 14, minHeight: theme.a11y.minTouchTarget, borderWidth: 1, borderColor: theme.line, flex: 1, color: theme.ink },
  listItem: { fontSize: theme.type.body, color: theme.inkSoft, paddingVertical: 6 },
  fundLine: { fontSize: 13.5, color: theme.inkSoft, marginTop: 4 },
  muted: { color: theme.inkMute, fontSize: 12.5 },
  mutedSmall: { color: theme.inkMute, fontSize: 11.5, fontWeight: theme.weight.semibold, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
  statusPill: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, marginTop: theme.space.md },
  statusPillText: { color: '#fff', fontSize: 11.5, fontWeight: theme.weight.semibold },
  settleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  settleAction: { color: theme.brandDeep, fontWeight: theme.weight.semibold, fontSize: 12.5 },
  settledLine: { color: theme.inkMute, fontSize: 13, paddingVertical: 3 },
});
