import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Card, SectionHeader, currencySymbol, useTheme } from './UI';

// ADVANCED: pure read-only breakdown, on purpose — no input forms here anymore. Trip Bank
// setup (custodian, fund target) and trip lifecycle (close/reopen) moved to the settings
// sheet reachable from Members' Trip Bank Pool card; contributions are added through Add;
// settlements are marked paid on the Settlement tab. This screen answers one question:
// "show me every number the engine used," for the person who wants to verify the math —
// not a second place to enter data.
export default function FinanceTab({ tripId, finance, onChanged }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const cs = currencySymbol(finance.baseCurrency);

  const netBalance = (name) => {
    const bank = finance.bankSettlement?.balances?.[name] || 0;
    const personal = finance.liveForecast?.balances?.[name] || 0;
    return +(bank + personal).toFixed(2);
  };
  const allNames = Array.from(new Set([
    ...Object.keys(finance.bankSettlement?.balances || {}),
    ...Object.keys(finance.liveForecast?.balances || {}),
  ]));

  return (
    <ScrollView style={styles.section} showsVerticalScrollIndicator={false}>
      <Card style={{ padding: theme.space.lg, marginTop: theme.space.sm }}>
        <SectionHeader title="Detailed breakdown" />
        <Row label="Contributions" value={`${cs}${finance.totalReceived}`} />
        <Row label="From Trip Bank" value={`${cs}${finance.bankSpent}`} />
        <Row label="Personal expenses" value={`${cs}${finance.personalSpent}`} />
        <Row label="Total spent" value={`${cs}${finance.totalSpent}`} />
        <Row label="Trip Bank balance" value={`${cs}${finance.currentCash}`} last />
      </Card>

      <Card style={{ padding: theme.space.lg, marginTop: theme.space.md, marginBottom: theme.space.md }}>
        <SectionHeader title="Live balance by member" />
        {allNames.length === 0 ? (
          <Text style={styles.muted}>No travelers yet.</Text>
        ) : (
          allNames.map((name) => (
            <Row key={name} label={name} value={`${netBalance(name) >= 0 ? '+' : ''}${cs}${netBalance(name)}`} valueColor={netBalance(name) < 0 ? theme.danger : theme.brandDeep} />
          ))
        )}
      </Card>

      <Text style={styles.footerNote}>This is the detailed view for transparency. For everyday use, check Settlement.</Text>
    </ScrollView>
  );

  function Row({ label, value, last, valueColor }) {
    return (
      <View style={[styles.row, !last && styles.rowDivider]}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={[styles.rowValue, valueColor && { color: valueColor }]}>{value}</Text>
      </View>
    );
  }
}

const makeStyles = (theme) => StyleSheet.create({
  section: { flex: 1, paddingBottom: 88 }, // clears the floating action button, same fix as SettlementTab
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: theme.space.sm },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: theme.line },
  rowLabel: { fontSize: theme.type.body, color: theme.inkSoft },
  rowValue: { fontSize: theme.type.body, fontWeight: theme.weight.semibold, color: theme.ink },
  muted: { color: theme.inkMute, fontSize: theme.type.body },
  footerNote: { fontSize: theme.type.caption, color: theme.inkMute, textAlign: 'center', marginBottom: theme.space.xxl, lineHeight: 17 },
});
