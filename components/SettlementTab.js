import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { recordSettlement, recordBankSettlementLeg, closeTrip } from '../db';
import { StatHero, Card, LedgerList, LedgerRow, PrimaryButton, ConfirmDialog, SuccessToast, currencySymbol, useTheme } from './UI';

// SIMPLIFIED SETTLEMENT: the founder's own words — "Users shouldn't learn accounting to
// split trip expenses." This screen deliberately does NOT show balances, doesn't say
// "Trip Bank Settlement" or "Live Settlement," and doesn't distinguish bank-vs-personal
// math for the reader — that distinction exists so the ENGINE gets the math right, not
// so the user has to understand it. Both settlement computations (bankSettlement,
// liveForecast) get merged here into exactly two plain buckets:
//   "Receive money"   (was "People to refund")     — money owed TO a traveler (always from the Trip Bank)
//   "Pay these people" (was "People who need to pay") — money a traveler owes, whether that's topping up the bank
//                              or paying another traveler back directly. The user doesn't
//                              need to know which; the underlying transaction already does.
export default function SettlementTab({ tripId, finance, navigation, onOpenAdvanced, onChanged }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [pendingSettle, setPendingSettle] = useState(null); // {from, to, amount}
  const [pendingSettleAll, setPendingSettleAll] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [pendingFinish, setPendingFinish] = useState(false);
  const cs = currencySymbol(finance.baseCurrency);

  // Once a trip is closed, "Trip Bank" stops being an intermediary someone can actually
  // pay into — finalBankSettlement already converted any remaining shortfall/surplus into
  // direct payments between real people (or to the custodian by name, if one was set),
  // per the reconciliation of the founding three-outcome model with the fact that a
  // closed trip has no one left to physically hand cash to. While the trip is still
  // active, the live hub model is correct and unchanged: paying into the pool mid-trip is
  // a real action with a real custodian on the other end.
  const bankTransactions = finance.tripStatus === 'closed' && finance.finalBankSettlement
    ? finance.finalBankSettlement.transactions
    : (finance.bankSettlement?.transactions || []);
  const bankName = finance.custodian || 'Trip Bank';
  const toRefund = bankTransactions.filter(t => t.from === bankName || t.from === 'Trip Bank');
  const toPay = [
    ...bankTransactions.filter(t => t.from !== bankName && t.from !== 'Trip Bank'),
    ...(finance.liveForecast?.transactions || []),
  ];

  const settleOne = async (t) => {
    // A refund FROM the Trip Bank, or a top-up TO the Trip Bank, isn't a traveler-to-
    // Bank legs (top-up or refund) are now recorded as real contribution rows via
    // recordBankSettlementLeg, so this fixes the "still says pending after everyone's
    // paid" bug — the bank balance actually nets to zero afterward instead of being
    // recomputed identically on the next load. Peer-to-peer legs keep using
    // recordSettlement, unchanged.
    if (t.from !== bankName && t.to !== bankName) {
      await recordSettlement(tripId, t.from, t.to, t.amount);
    } else {
      await recordBankSettlementLeg(tripId, t.from, t.to, t.amount, bankName);
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
    // BUG FIXED: this loop previously only iterated `toPay`, never `toRefund` — so
    // "Mark all as settled" recorded every personal/top-up payment but silently left
    // every Trip Bank REFUND (money owed back to a traveler, shown under "Receive
    // money") completely untouched. That's exactly the reported Dubai contradiction:
    // "Everyone is settled" under Pay These People (because that list correctly emptied)
    // while Receive Money kept showing $643 / $95 forever, because nothing had ever
    // actually recorded those refunds as paid. Settling "all" has to mean all of it.
    for (const t of [...toRefund, ...toPay]) {
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

      {finance.travelerCount === 1 ? (
        <Card style={{ padding: theme.space.lg, marginTop: theme.space.lg }}>
          <Text style={styles.heading}>✅ No settlement required</Text>
          <Text style={styles.muted}>It's just you on this trip — there's no one to split costs with.</Text>
        </Card>
      ) : (
      <>
      {finance.liveForecast?.orphanedPayers?.length > 0 && (
        <View style={styles.warningBanner}>
          <Feather name="alert-triangle" size={14} color={theme.warn} />
          <Text style={styles.warningText}>
            {finance.liveForecast.orphanedPayers.map(o => `${o.name} paid ${cs}${o.amount}`).join(', ')} — not a current traveler on this trip, so that money isn't reflected in anyone's balance. Add them as a traveler, or fix the payer on that expense.
          </Text>
        </View>
      )}

      <Card style={{ padding: theme.space.lg, marginTop: theme.space.lg }}>
        <Text style={styles.heading}>Receive money</Text>
        {toRefund.length > 0 && (
          <Text style={[styles.muted, { marginBottom: theme.space.sm }]}>
            Still sitting in the shared pool, owed back to them — not yet paid out.
          </Text>
        )}
        {toRefund.length === 0 ? (
          <Text style={styles.muted}>✅ Everyone is settled.</Text>
        ) : (
          <LedgerList>
            {toRefund.map((t, i) => (
              <LedgerRow key={i} icon="refund" isLast={i === toRefund.length - 1}>
                <Text style={styles.line}>Return to {t.to}</Text>
                <Text style={styles.amount}>{cs}{t.amount}</Text>
              </LedgerRow>
            ))}
          </LedgerList>
        )}
      </Card>

      <Card style={{ padding: theme.space.lg, marginTop: theme.space.md, marginBottom: theme.space.md }}>
        <Text style={styles.heading}>Pay these people</Text>
        {toPay.length === 0 ? (
          <Text style={styles.muted}>✅ Everyone is settled.</Text>
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
                <Text style={styles.line}>{t.to === bankName ? `${t.from} tops up pool` : `${t.from} → ${t.to}`}</Text>
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

      {/* Nothing pending and the trip is still Active — this is the "solo trip / fully
          settled trip stays open forever with no way to end it" gap. Surfacing Finish
          Trip right here, exactly where the person can see there's nothing left to do,
          beats making them go find it under a settings gear icon. */}
      {toRefund.length + toPay.length === 0 && finance.tripStatus === 'active' && (
        <PrimaryButton
          label="Finish Trip"
          icon="check-circle"
          onPress={() => setPendingFinish(true)}
          style={{ marginBottom: theme.space.md }}
        />
      )}

      {onOpenAdvanced && (
        <Text style={styles.advancedLink} onPress={onOpenAdvanced}>View detailed breakdown →</Text>
      )}
      </>
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
        message="This records every outstanding payment and refund as complete — Trip Bank refunds, top-ups, and person-to-person payments. Only confirm once the actual money has genuinely moved; this doesn't move it for you."
        confirmLabel="Mark all settled"
        onConfirm={confirmSettleAll}
        onCancel={() => setPendingSettleAll(false)}
      />
      <ConfirmDialog
        visible={pendingFinish}
        title="Finish this trip?"
        message="Marks the trip as complete. You can still view everything afterward — this just moves it out of Active."
        confirmLabel="Finish Trip"
        onConfirm={async () => {
          setPendingFinish(false);
          // closeTrip now re-checks for outstanding balances itself (not just this
          // screen's button visibility), so a stale screen — e.g. someone else added an
          // expense between this screen loading and this tap — can't slip a trip closed
          // while money is still owed. ok:false here means the data changed underneath
          // us; just refresh so the up-to-date pending list shows instead of closing.
          const result = await closeTrip(tripId);
          if (!result.ok) { onChanged(); return; }
          onChanged();
        }}
        onCancel={() => setPendingFinish(false)}
      />
    </View>
  );
}

const makeStyles = (theme) => StyleSheet.create({
  // Extra bottom padding: the FAB is a fixed, absolutely-positioned element outside this
  // scroll content, so without room reserved for it here, "Mark all as settled" — the one
  // button on this screen you really don't want a mis-tap on — sits directly under it.
  section: { flex: 1, paddingBottom: 88 },
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
