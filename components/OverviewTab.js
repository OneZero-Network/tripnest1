import React, { useMemo, useRef, useEffect, useState } from 'react';
import { View, Text, Animated, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { StatHero, Card, SectionHeader, CATEGORY_EMOJI, currencySymbol, useTheme } from './UI';
import { getTripCoverTheme } from '../tripTheme';

const EVENT_ICONS = { expense: 'dollar-sign', note: 'file-text', document: 'paperclip', itinerary: 'calendar', traveler: 'user', trip: 'flag', contribution: 'gift', settlement: 'check-circle' };

// DASHBOARD: per the UX simplification, this is the landing page for every active trip —
// it answers the four questions the founder named and nothing else: how much has been
// spent, how much shared cash remains, who currently owes money, and what just happened.
// Deliberately NOT a fifth place that repeats the full expense list or full settlement
// breakdown — those already have a home (Expenses, Settlement). This is the "at a glance,
// before I decide where to go" screen, not a duplicate of anywhere else.
export default function OverviewTab({ finance, timeline, today, expenses = [], tripName, navigation, onOpenSettlement, onOpenExpenses }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const cs = currencySymbol(finance.baseCurrency);
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  // A small entrance fade for the hero — "cards easing into view," not a functional
  // change, but this is the one place on the screen someone's eye lands first, so it's
  // the one place a subtle motion cue actually earns its keep rather than becoming noise.
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }).start();
  }, [tripName]);

  const toRefund = (finance.bankSettlement?.transactions || []).filter(t => t.from === 'Trip Bank');
  const toPay = [
    ...(finance.bankSettlement?.transactions || []).filter(t => t.from !== 'Trip Bank'),
    ...(finance.liveForecast?.transactions || []),
  ];
  const owesCount = toRefund.length + toPay.length;
  // Trimmed to 3 (was 5) — the review's "command center, no scrolling" note. Fewer rows
  // here means Overview reliably fits one screen without becoming a second Activity feed.
  const recent = timeline.slice(0, 3);
  const isEmpty = expenses.length === 0 && timeline.length <= 1; // <=1 tolerates the "trip created" event

  // The hero adapts to whether this trip even has a Trip Bank — showing "Trip Bank
  // remaining" on a trip with no pooled cash would always read as ₹0 and mean nothing.
  // Simple Mode (no Trip Bank): the one number that matters is what's gone out so far.
  const heroLabel = finance.hasTripBank ? 'Trip Bank' : 'Total spent';
  const heroValue = finance.hasTripBank ? finance.currentCash : finance.personalSpent;

  // Category breakdown — computed from the same expense rows Expenses already has, not a
  // second source of truth. Tapping the hero is the "make the card interactive, not a
  // poster" fix; this is the one piece of detail that's genuinely useful to reveal here
  // rather than sending someone to a different tab for it.
  const byCategory = useMemo(() => {
    const totals = {};
    expenses.forEach((e) => {
      const cat = e.category || 'Other';
      totals[cat] = (totals[cat] || 0) + e.amount * e.fx_rate;
    });
    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  return (
    <View style={styles.section}>
      {tripName && <Text style={styles.tripName}>{getTripCoverTheme(tripName).emoji} {tripName}</Text>}

      {isEmpty ? (
        <Card style={{ padding: theme.space.lg }}>
          <Text style={styles.welcomeTitle}>👋 Welcome to {tripName || 'your trip'}</Text>
          <Text style={styles.welcomeBody}>Start by adding your first expense, or invite your friends from Members.</Text>
        </Card>
      ) : (
        <>
          <TouchableOpacity activeOpacity={0.85} onPress={() => setBreakdownOpen((v) => !v)}>
            <Animated.View style={{ opacity: fade }}>
              <StatHero
                label={heroLabel}
                value={`${cs}${heroValue}`}
              >
                {expenses.length > 0 && (
                  <Text style={styles.heroHint}>{breakdownOpen ? 'Hide breakdown ▴' : 'Tap for breakdown by category ▾'}</Text>
                )}
              </StatHero>
            </Animated.View>
          </TouchableOpacity>

          {breakdownOpen && byCategory.length > 0 && (
            <Card style={{ padding: theme.space.md, marginTop: theme.space.sm }}>
              {byCategory.map(([cat, amt], i) => (
                <View key={cat} style={[styles.categoryRow, i < byCategory.length - 1 && styles.categoryRowDivider]}>
                  <Text style={styles.categoryEmoji}>{CATEGORY_EMOJI[cat] || '🧾'}</Text>
                  <Text style={styles.categoryLabel}>{cat}</Text>
                  <Text style={styles.categoryAmount}>{cs}{amt.toFixed(0)}</Text>
                </View>
              ))}
            </Card>
          )}

          <View style={styles.miniStatsRow}>
            <TouchableOpacity style={styles.miniStat} onPress={onOpenExpenses} activeOpacity={0.7}>
              <Text style={styles.miniStatValue}>{cs}{Math.round(today?.spentToday || 0)}</Text>
              <Text style={styles.miniStatLabel}>Spent today</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.miniStat} onPress={onOpenSettlement} activeOpacity={0.7}>
              <Text style={styles.miniStatValue}>{owesCount}</Text>
              <Text style={styles.miniStatLabel}>Pending settlements</Text>
            </TouchableOpacity>
          </View>

          <Card style={{ padding: theme.space.md, marginTop: theme.space.lg, marginBottom: theme.space.xxl }}>
            <SectionHeader title="Latest activity" />
            {recent.length === 0 ? (
              <Text style={styles.muted}>Nothing yet — add an expense, note, or document to get started.</Text>
            ) : (
              recent.map((e) => (
                <View key={e.id} style={styles.iconLineRow}>
                  <Feather name={EVENT_ICONS[e.type] || 'circle'} size={14} color={theme.brandDeep} />
                  <Text style={styles.line} numberOfLines={1}>{e.event}</Text>
                </View>
              ))
            )}
            {owesCount > 0 && (
              <Text style={styles.moreLink} onPress={onOpenSettlement}>{owesCount} pending settlement{owesCount === 1 ? '' : 's'} — view Settle</Text>
            )}
          </Card>
        </>
      )}
    </View>
  );
}

const makeStyles = (theme) => StyleSheet.create({
  section: { flex: 1 },
  tripName: { fontSize: theme.type.title, fontWeight: theme.weight.semibold, color: theme.ink, marginBottom: theme.space.sm, letterSpacing: -0.3 },
  welcomeTitle: { fontSize: theme.type.heading, fontWeight: theme.weight.semibold, color: theme.ink },
  welcomeBody: { fontSize: theme.type.body, color: theme.inkMute, marginTop: theme.space.xs, lineHeight: 20 },
  heroHint: { color: 'rgba(255,255,255,0.7)', fontSize: theme.type.caption, marginTop: theme.space.sm },
  categoryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: theme.space.sm, gap: theme.space.sm },
  categoryRowDivider: { borderBottomWidth: 1, borderBottomColor: theme.line },
  categoryEmoji: { fontSize: 18 },
  categoryLabel: { flex: 1, fontSize: theme.type.body, color: theme.ink },
  categoryAmount: { fontSize: theme.type.body, fontWeight: theme.weight.semibold, color: theme.ink },
  miniStatsRow: { flexDirection: 'row', gap: theme.space.sm, marginTop: theme.space.sm },
  miniStat: { flex: 1, backgroundColor: theme.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.line, padding: theme.space.sm, minHeight: theme.a11y.minTouchTarget },
  miniStatValue: { fontSize: theme.type.heading, fontWeight: theme.weight.semibold, color: theme.ink },
  miniStatLabel: { fontSize: theme.type.caption, color: theme.inkMute, marginTop: 2 },
  muted: { color: theme.inkMute, fontSize: theme.type.body },
  line: { fontSize: theme.type.body, color: theme.inkSoft, flex: 1 },
  iconLineRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm, paddingVertical: 4 },
  moreLink: { fontSize: theme.type.caption, fontWeight: theme.weight.semibold, color: theme.brandDeep, marginTop: theme.space.sm },
});
