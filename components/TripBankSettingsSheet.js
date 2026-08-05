import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { setContributionPerPerson, setCustodian, closeTrip, reopenTrip } from '../db';
import { BottomSheet, PrimaryButton, SecondaryButton, ConfirmDialog, currencySymbol, useTheme } from './UI';

// Trip Bank setup (who holds the cash, what the per-person target is) and trip lifecycle
// (close/reopen) used to live inside Advanced as input forms mixed in with a read-only
// breakdown — that's exactly the "still has forms mixed into the detailed view" gap.
// Pulled out into its own sheet, reachable from the Trip Bank Pool card on Members, so
// Advanced can be what it's actually supposed to be: numbers, not data entry.
export default function TripBankSettingsSheet({ tripId, finance, visible, onClose, onChanged }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [custodianInput, setCustodianInput] = useState(finance.custodian || '');
  const [perPersonInput, setPerPersonInput] = useState('');
  const [pendingClose, setPendingClose] = useState(false);
  const cs = currencySymbol(finance.baseCurrency);
  const fundShort = finance.fundTarget != null ? finance.fundTarget - finance.totalReceived : null;

  const saveCustodian = async () => {
    if (!custodianInput.trim()) return;
    await setCustodian(tripId, custodianInput.trim());
    onChanged();
  };

  const saveFundTarget = async () => {
    const amt = parseFloat(perPersonInput);
    if (!amt) return;
    await setContributionPerPerson(tripId, amt);
    setPerPersonInput('');
    onChanged();
  };

  const confirmCloseTrip = async () => {
    setPendingClose(false);
    await closeTrip(tripId);
    onChanged();
    onClose();
  };

  return (
    <>
      <BottomSheet visible={visible} onClose={onClose}>
        <Text style={styles.title}>Trip Bank setup</Text>

        <Text style={styles.label}>Custodian — who actually holds the pooled cash</Text>
        {finance.custodian ? (
          <Text style={styles.value}>Currently: {finance.custodian}</Text>
        ) : (
          <Text style={styles.mutedValue}>Not set — contributions are logged but not routed anywhere yet.</Text>
        )}
        <View style={styles.row}>
          <TextInput style={styles.input} placeholder='e.g. "Ayaz — UPI"' placeholderTextColor={theme.inkMute} value={custodianInput} onChangeText={setCustodianInput} />
          <PrimaryButton label="Set" onPress={saveCustodian} style={{ marginStart: theme.space.sm }} />
        </View>

        <Text style={[styles.label, { marginTop: theme.space.lg }]}>Contribution target per person</Text>
        {finance.fundTarget != null ? (
          <Text style={styles.value}>
            {cs}{finance.fundTarget} target ({cs}{finance.perPerson} × {finance.travelerCount}) — {fundShort > 0 ? `${cs}${fundShort} short` : 'fully funded'}
          </Text>
        ) : (
          <Text style={styles.mutedValue}>Not set.</Text>
        )}
        <View style={styles.row}>
          <TextInput style={styles.input} placeholder="Amount per person" placeholderTextColor={theme.inkMute} value={perPersonInput} onChangeText={setPerPersonInput} keyboardType="numeric" />
          <PrimaryButton label="Set" onPress={saveFundTarget} style={{ marginStart: theme.space.sm }} />
        </View>

        <View style={styles.divider} />

        {finance.tripStatus === 'closed' ? (
          <SecondaryButton label="Reopen trip" onPress={async () => { await reopenTrip(tripId); onChanged(); onClose(); }} />
        ) : (
          <SecondaryButton label="Close trip" onPress={() => setPendingClose(true)} />
        )}
      </BottomSheet>

      <ConfirmDialog
        visible={pendingClose}
        title="Close trip?"
        message="This unlocks Final Settlement. You can reopen the trip later if needed."
        confirmLabel="Close trip"
        onConfirm={confirmCloseTrip}
        onCancel={() => setPendingClose(false)}
      />
    </>
  );
}

const makeStyles = (theme) => StyleSheet.create({
  title: { fontSize: theme.type.heading, fontWeight: theme.weight.semibold, color: theme.ink, marginBottom: theme.space.md },
  label: { fontSize: theme.type.label, fontWeight: theme.weight.semibold, color: theme.inkMute, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: theme.space.xs },
  value: { fontSize: theme.type.body, color: theme.inkSoft, marginBottom: theme.space.sm },
  mutedValue: { fontSize: theme.type.body, color: theme.inkMute, marginBottom: theme.space.sm },
  row: { flexDirection: 'row' },
  input: { backgroundColor: theme.bg, borderRadius: theme.radius.sm, paddingHorizontal: 14, minHeight: theme.a11y.minTouchTarget, borderWidth: 1, borderColor: theme.line, flex: 1, color: theme.ink },
  divider: { height: 1, backgroundColor: theme.line, marginVertical: theme.space.lg },
});
