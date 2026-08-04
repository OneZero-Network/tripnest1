import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet } from 'react-native';
import { addContribution, setContributionPerPerson, setCustodian, recordSettlement, closeTrip, reopenTrip } from '../db';
import { PrimaryButton, Card, StatHero, SectionHeader, ConfirmDialog, SuccessToast, currencySymbol, useTheme } from './UI';

// GUIDED WORKFLOW: this used to be five same-weight cards with no order to them — you
// landed on "Fund Custodian" before you'd even seen what's been spent. Restructured to
// follow the actual lifecycle an organizer lives through: where things stand right now →
// how the shared pot is set up → what's come in → what's gone out → what's still owed →
// who-owes-whom today → the final number once the trip's closed. Same underlying data
// and functions throughout — this is a presentation reorganization, not new math.
export default function FinanceTab({ tripId, finance, onChanged }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [contribTraveler, setContribTraveler] = useState('');
  const [contribAmount, setContribAmount] = useState('');
  const [perPersonInput, setPerPersonInput] = useState('');
  const [custodianInput, setCustodianInput] = useState(finance.custodian || '');
  const [pendingSettle, setPendingSettle] = useState(null); // {from, to, amount}
  const [pendingClose, setPendingClose] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  const submitContribution = async () => {
    const amt = parseFloat(contribAmount);
    if (!amt || !contribTraveler) return;
    await addContribution(tripId, contribTraveler, amt);
    setContribAmount(''); setContribTraveler('');
    setSavedAt(Date.now());
    onChanged();
  };

  const saveFundTarget = async () => {
    const amt = parseFloat(perPersonInput);
    if (!amt) return;
    await setContributionPerPerson(tripId, amt);
    setPerPersonInput('');
    setSavedAt(Date.now());
    onChanged();
  };

  const saveCustodian = async () => {
    if (!custodianInput.trim()) return;
    await setCustodian(tripId, custodianInput.trim());
    setSavedAt(Date.now());
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

  const cs = currencySymbol(finance.baseCurrency);
  const fundShort = finance.fundTarget != null ? finance.fundTarget - finance.totalReceived : null;

  return (
    <ScrollView style={styles.section} showsVerticalScrollIndicator={false}>
      <SuccessToast trigger={savedAt} message="Saved" />

      {/* 1. CURRENT BALANCE — the Trip Bank's own cash position: contributions in, minus
          only what's been spent FROM the bank. Personal expenses don't touch this number
          anymore — that's the fix for "balance is -300 and nobody knows why," which was
          the old model conflating bank spend with personal IOUs into one bucket. */}
      <StatHero
        label="Trip Bank balance"
        value={`${cs}${finance.currentCash}`}
        sublabel={`${cs}${finance.totalReceived} in · ${cs}${finance.bankSpent} spent from bank · ${finance.baseCurrency}`}
      >
        <View style={styles.statusPill}>
          <Text style={styles.statusPillText}>{finance.tripStatus === 'closed' ? 'Trip closed' : 'Trip active'}</Text>
        </View>
      </StatHero>

      {/* 2. TRIP FUND STATUS — how the shared pot is set up: who holds it, what the target is */}
      <Card style={{ padding: theme.space.lg, marginTop: theme.space.lg }}>
        <SectionHeader title="2 · Trip fund status" />
        <Text style={styles.muted}>
          Custodian: the one person who actually holds the pooled cash, so contributions have somewhere real to go.
        </Text>
        {finance.custodian ? (
          <Text style={styles.fundLine}>Held by {finance.custodian}</Text>
        ) : (
          <Text style={styles.fundLine}>No custodian set — contributions are logged but not routed anywhere yet.</Text>
        )}
        <View style={styles.row}>
          <TextInput
            style={styles.input}
            placeholder='e.g. "Ayaz — UPI"'
            placeholderTextColor={theme.inkMute}
            value={custodianInput}
            onChangeText={setCustodianInput}
          />
          <PrimaryButton label="Set" onPress={saveCustodian} style={{ marginStart: theme.space.sm }} />
        </View>

        <Text style={[styles.muted, { marginTop: theme.space.md }]}>Target: equal-split per-person amount.</Text>
        {finance.fundTarget != null ? (
          <Text style={styles.fundLine}>
            {cs}{finance.fundTarget} target ({cs}{finance.perPerson} × {finance.travelerCount}) — {fundShort > 0 ? `${cs}${fundShort} short` : 'fully funded'}
          </Text>
        ) : (
          <Text style={styles.fundLine}>No target set.</Text>
        )}
        <View style={styles.row}>
          <TextInput style={styles.input} placeholder="Contribution per person" placeholderTextColor={theme.inkMute} value={perPersonInput} onChangeText={setPerPersonInput} keyboardType="numeric" />
          <PrimaryButton label="Set" onPress={saveFundTarget} style={{ marginStart: theme.space.sm }} />
        </View>
      </Card>

      {/* 3. CONTRIBUTIONS RECEIVED — what's actually come in against that target */}
      <Card style={{ padding: theme.space.lg, marginTop: theme.space.md }}>
        <SectionHeader title="3 · Contributions received" />
        <View style={styles.row}>
          <TextInput style={styles.input} placeholder="Traveler" placeholderTextColor={theme.inkMute} value={contribTraveler} onChangeText={setContribTraveler} />
          <TextInput style={styles.input} placeholder="Amount" placeholderTextColor={theme.inkMute} value={contribAmount} onChangeText={setContribAmount} keyboardType="numeric" />
          <PrimaryButton label="Add" onPress={submitContribution} style={{ marginStart: theme.space.sm }} />
        </View>
        {finance.contributions.length === 0 ? (
          <Text style={styles.muted}>Nothing received yet.</Text>
        ) : (
          finance.contributions.map((c) => (
            <Text key={c.id} style={styles.listItem}>
              {c.traveler} contributed {cs}{c.amount} {c.currency !== finance.baseCurrency ? `${c.currency} (≈ ${cs}${(c.amount * c.fx_rate).toFixed(2)})` : ''}{finance.custodian ? ` → ${finance.custodian}` : ''}
            </Text>
          ))
        )}
        <Text style={styles.totalLine}>Total received: {cs}{finance.totalReceived}</Text>
      </Card>

      {/* 4. EXPENSES PAID — what's gone out, split by source since that's the whole point
          of the model: bank-funded spend affects the Trip Bank balance above; personal
          spend is a separate peer-to-peer matter settled in step 7. Full itemized list
          lives in the Expenses tab on purpose — duplicating it here would just be the
          same list twice. */}
      <Card style={{ padding: theme.space.lg, marginTop: theme.space.md }}>
        <SectionHeader title="4 · Expenses paid" />
        <Text style={styles.totalLine}>From Trip Bank: {cs}{finance.bankSpent}</Text>
        <Text style={styles.totalLine}>Paid personally: {cs}{finance.personalSpent}</Text>
        <Text style={styles.muted}>Full itemized list is in the Expenses tab.</Text>
      </Card>

      {/* 5. OUTSTANDING AMOUNT — the gap between what the fund target asks for and what's
          actually landed, made its own explicit checkpoint instead of a buried sub-line. */}
      <Card style={{ padding: theme.space.lg, marginTop: theme.space.md }}>
        <SectionHeader title="5 · Outstanding amount" />
        {finance.fundTarget == null ? (
          <Text style={styles.muted}>No fund target set, so there's nothing to measure against yet.</Text>
        ) : fundShort > 0 ? (
          <Text style={styles.fundLine}>{cs}{fundShort} still needed to reach the {cs}{finance.fundTarget} target.</Text>
        ) : (
          <Text style={styles.fundLine}>Fund target fully met.</Text>
        )}
      </Card>

      {/* 6. TRIP BANK SETTLEMENT — Trip Bank → Person (refund unused pool cash) or
          Person → Trip Bank (top up a shortfall). Independent of step 7's peer-to-peer
          settlement — this is money owed to/from the shared pool, not between travelers. */}
      <Card style={{ padding: theme.space.lg, marginTop: theme.space.md }}>
        <SectionHeader title="6 · Trip Bank settlement" />
        {Object.entries(finance.bankSettlement.balances).map(([name, bal]) => (
          <Text key={name} style={styles.listItem}>{name}: {bal >= 0 ? '+' : ''}{cs}{bal}</Text>
        ))}
        {finance.bankSettlement.transactions.length === 0 ? (
          <Text style={styles.listItem}>Nothing to settle with the Trip Bank.</Text>
        ) : (
          finance.bankSettlement.transactions.map((t, idx) => (
            <Text key={idx} style={styles.listItem}>
              {t.from === 'Trip Bank' ? `Trip Bank → ${t.to}` : `${t.from} → Trip Bank`}: {cs}{t.amount}
              {t.from === 'Trip Bank' ? ' (refund owed)' : ' (top-up owed)'}
            </Text>
          ))
        )}
      </Card>

      {/* 7. LIVE SETTLEMENT — who-owes-whom among travelers for personal expenses only,
          same computeSettlement math as before, now correctly scoped away from bank spend */}
      <Card style={{ padding: theme.space.lg, marginTop: theme.space.md }}>
        <SectionHeader title="7 · Live settlement · personal expenses, if the trip ended today" />
        {finance.liveForecast.orphanedPayers?.length > 0 && (
          <View style={styles.warningBanner}>
            <Text style={styles.warningText}>
              {finance.liveForecast.orphanedPayers.map(o => `${o.name} paid ${cs}${o.amount}`).join(', ')} — not a traveler on this trip, so this money isn't reflected in anyone's balance below. Add them as a traveler, or fix the payer on that expense.
            </Text>
          </View>
        )}
        {Object.entries(finance.liveForecast.balances).map(([name, bal]) => (
          <Text key={name} style={styles.listItem}>{name}: {bal >= 0 ? '+' : ''}{cs}{bal}</Text>
        ))}
        {finance.liveForecast.transactions.length === 0 ? (
          <Text style={styles.listItem}>
            {finance.liveForecast.orphanedPayers?.length > 0 ? 'Nothing to settle among current travelers — see the note above.' : 'All settled up.'}
          </Text>
        ) : (
          finance.liveForecast.transactions.map((t, idx) => (
            <View key={idx} style={styles.settleRow}>
              <Text style={styles.listItem}>{t.from} → {t.to}: {cs}{t.amount}</Text>
              <Text style={styles.settleAction} onPress={() => setPendingSettle(t)}>Mark settled</Text>
            </View>
          ))
        )}
        {finance.liveForecast.settledTransactions?.length > 0 && (
          <View style={{ marginTop: theme.space.sm }}>
            <Text style={styles.mutedSmall}>Already settled</Text>
            {finance.liveForecast.settledTransactions.map((s) => (
              <Text key={s.id} style={styles.settledLine}>✓ {s.from_traveler} paid {s.to_traveler} {cs}{s.amount}</Text>
            ))}
          </View>
        )}
      </Card>

      {/* 8. FINAL SETTLEMENT — the closing step, only reachable once the trip is closed */}
      <Card style={{ padding: theme.space.lg, marginTop: theme.space.md, marginBottom: theme.space.xxl }}>
        <SectionHeader title="8 · Final settlement" />
        {finance.tripStatus === 'closed' ? (
          <>
            {finance.finalSettlement.orphanedPayers?.length > 0 && (
              <View style={styles.warningBanner}>
                <Text style={styles.warningText}>
                  {finance.finalSettlement.orphanedPayers.map(o => `${o.name} paid ${cs}${o.amount}`).join(', ')} — not a traveler on this trip; that money isn't reflected below.
                </Text>
              </View>
            )}
            {finance.finalSettlement.transactions.length === 0
              ? <Text style={styles.listItem}>All settled up.</Text>
              : finance.finalSettlement.transactions.map((t, idx) => (
                  <View key={idx} style={styles.settleRow}>
                    <Text style={styles.listItem}>{t.from} → {t.to}: {cs}{t.amount}</Text>
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
            <Text style={styles.muted}>Available once the trip is closed — this is the last step, not one to jump to early.</Text>
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
  totalLine: { fontSize: theme.type.body, fontWeight: theme.weight.semibold, color: theme.ink, marginTop: theme.space.sm },
  fundLine: { fontSize: 13.5, color: theme.inkSoft, marginTop: 4 },
  muted: { color: theme.inkMute, fontSize: 12.5 },
  mutedSmall: { color: theme.inkMute, fontSize: 11.5, fontWeight: theme.weight.semibold, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
  statusPill: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, marginTop: theme.space.md },
  statusPillText: { color: '#fff', fontSize: 11.5, fontWeight: theme.weight.semibold },
  settleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  settleAction: { color: theme.brandDeep, fontWeight: theme.weight.semibold, fontSize: 12.5 },
  settledLine: { color: theme.inkMute, fontSize: 13, paddingVertical: 3 },
  warningBanner: { backgroundColor: theme.warnWash, borderRadius: theme.radius.sm, padding: theme.space.md, marginBottom: theme.space.md },
  warningText: { color: theme.warn, fontSize: theme.type.caption, lineHeight: 18 },
});
