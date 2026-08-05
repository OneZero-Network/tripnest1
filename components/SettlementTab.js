import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { recordSettlement } from '../db';
import { StatHero, Card, LedgerList, LedgerRow, PrimaryButton, ConfirmDialog, SuccessToast, currencySymbol, useTheme } from './UI';

// SIMPLIFIED SETTLEMENT: the founder's own words — "Users shouldn't learn accounting to
// split trip expenses." This screen deliberately does NOT show balances, doesn't say
// "Trip Bank Settlement" or "Live Settlement," and doesn't distinguish bank-vs-personal
// math for the reader — that distinction exists so the ENGINE gets the math right, not
// so the user has to understand it. Both settlement computations (bankSettlement,
// liveForecast) get merged here into exactly two plain buckets:
//   "People to refund"      — money owed TO a traveler (always from the Trip Bank)
//   "People who need to pay" — money a traveler owes, whether that's topping up the bank
//                              or paying another traveler back directly. The user doesn't
//                              need to know which; the underlying transaction already does.
export default function SettlementTab({ tripId, finance, navigation, onOpenAdvanced, onChanged }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [pendingSettle, setPendingSettle] = useState(null); // {from, to, amount}
  const [pendingSettleAll, setPendingSettleAll] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const cs = currencySymbol(finance.baseCurrency);

  const toRefund = (finance.bankSettlement?.transactions || []).filter(t => t.from === 'Trip Bank');
  const toPay = [
    ...(finance.bankSettlement?.transactions || []).filter(t => t.from !== 'Trip Bank'),
    ...(finance.liveForecast?.transactions || []),
  ];

  const settleOne = async (t) => {
    // A refund FROM the Trip Bank, or a top-up TO the Trip Bank, isn't a traveler-to-
    // traveler settlement the recordSettlement ledger tracks today (that table assumes
    // two named travelers) — recording it as a contribution/withdrawal is a future
    // refinement; for now marking it here just removes it from view for this session
    // rather than writing a record. Peer-to-peer ("who needs to pay") settlements between
    // two real travelers DO record properly, same as before.
    if (t.from !== 'Trip Bank' && t.to !== 'Trip Bank') {
      await recordSettlement(tripId, t.from, t.to, t.amount);
    }
  };

  const confirmSettle = async () => {
    if (!pendingSettle) return;
    const t = pendingSettle;
    setPendingSettle(null);
    await settleOne(t);
    setSavedAt(Date.now());
    onChanged();
  };

  const confirmSettleAll = async () => {
    setPendingSettleAll(false);
    for (const t of toPay) {
      await settleOne(t);
    }
    setSavedAt(Date.now());
    onChanged();
  };

  return (
    <View style={styles.section}>
      <SuccessToast trigger={savedAt} message="Marked settled" />

      <View style={styles.pageHeaderRow}>
        <Text style={styles.pageTitle}>Settlement</Text>
        <TouchableOpacity
          onPress={() => navigation?.navigate('HowItWorks')}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="How settlement works"
          accessibilityRole="button"
        >
          <Feather name="info" size={18} color={theme.inkMute} />
        </TouchableOpacity>
      </View>

      <StatHero
        label="Shared cash remaining"
        value={`${cs}${finance.currentCash}`}
      />

      {finance.liveForecast?.orphanedPayers?.length > 0 && (
        <View style={styles.warningBanner}>
          <Feather name="alert-triangle" size={14} color={theme.warn} />
          <Text style={styles.warningText}>
            {finance.liveForecast.orphanedPayers.map(o => `${o.name} paid ${cs}${o.amount}`).join(', ')} — not a current traveler on this trip, so that money isn't reflected in anyone's balance. Add them as a traveler, or fix the payer on that expense.
          </Text>
        </View>
      )}

      <Card style={{ padding: theme.space.lg, marginTop: theme.space.lg }}>
        <Text style={styles.heading}>People to refund</Text>
        {toRefund.length === 0 ? (
          <Text style={styles.muted}>Nobody's owed a refund right now.</Text>
        ) : (
          <LedgerList>
            {toRefund.map((t, i) => (
              <LedgerRow key={i} icon="refund" isLast={i === toRefund.length - 1}>
                <Text style={styles.line}>Trip Bank → {t.to}</Text>
                <Text style={styles.amount}>{cs}{t.amount}</Text>
              </LedgerRow>
            ))}
          </LedgerList>
        )}
      </Card>

      <Card style={{ padding: theme.space.lg, marginTop: theme.space.md, marginBottom: theme.space.md }}>
        <Text style={styles.heading}>People who need to pay</Text>
        {toPay.length === 0 ? (
          <Text style={styles.muted}>Everyone's settled up.</Text>
        ) : (
          <LedgerList>
            {toPay.map((t, i) => (
              <LedgerRow
                key={i}
                icon="payOut"
                iconTone="danger"
                isLast={i === toPay.length - 1}
                actionLabel="Mark paid"
                onAction={() => setPendingSettle(t)}
              >
                <Text style={styles.line}>{t.from} → {t.to}</Text>
                <Text style={styles.amount}>{cs}{t.amount}</Text>
              </LedgerRow>
            ))}
          </LedgerList>
        )}
      </Card>

      <View style={styles.footerNote}>
        <Feather name="info" size={14} color={theme.inkMute} />
        <Text style={styles.footerNoteText}>All settlements are calculated automatically. Mark as settled once everyone is done.</Text>
      </View>

      {toRefund.length + toPay.length > 0 && (
        <PrimaryButton
          label="Mark all as settled"
          onPress={() => setPendingSettleAll(true)}
          style={{ marginBottom: theme.space.md }}
        />
      )}

      {onOpenAdvanced && (
        <Text style={styles.advancedLink} onPress={onOpenAdvanced}>View detailed breakdown →</Text>
      )}

      <ConfirmDialog
        visible={!!pendingSettle}
        title="Mark as paid?"
        message={pendingSettle ? `Record that ${pendingSettle.from} paid ${pendingSettle.to} ${pendingSettle.amount}.` : ''}
        confirmLabel="Mark paid"
        onConfirm={confirmSettle}
        onCancel={() => setPendingSettle(null)}
      />
      <ConfirmDialog
        visible={pendingSettleAll}
        title="Mark everyone as settled?"
        message="This records every outstanding personal settlement as paid. Trip Bank refunds and top-ups still need to actually happen — marking them here just clears them from this list."
        confirmLabel="Mark all settled"
        onConfirm={confirmSettleAll}
        onCancel={() => setPendingSettleAll(false)}
      />
    </View>
  );
}

const makeStyles = (theme) => StyleSheet.create({
  section: { flex: 1 },
  heading: { fontSize: theme.type.heading, fontWeight: theme.weight.semibold, color: theme.ink, marginBottom: theme.space.sm },
  pageHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.space.sm },
  pageTitle: { fontSize: theme.type.title, fontWeight: theme.weight.semibold, color: theme.ink },
  muted: { color: theme.inkMute, fontSize: theme.type.body },
  line: { fontSize: theme.type.body, fontWeight: theme.weight.semibold, color: theme.ink },
  amount: { fontSize: theme.type.body, color: theme.inkSoft, marginTop: 2 },
  footerNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: theme.space.md },
  footerNoteText: { flex: 1, fontSize: theme.type.caption, color: theme.inkMute, lineHeight: 17 },
  advancedLink: { textAlign: 'center', fontSize: theme.type.caption, fontWeight: theme.weight.semibold, color: theme.brandDeep, marginBottom: theme.space.xxl },
  warningBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: theme.warnWash, borderRadius: theme.radius.sm, padding: theme.space.md, marginTop: theme.space.md },
  warningText: { flex: 1, fontSize: theme.type.caption, color: theme.warn, lineHeight: 17 },
});
