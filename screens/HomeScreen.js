import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
// react-native-safe-area-context's SafeAreaView (not the react-native core one, which is
// iOS-only and a no-op on Android — that no-op is exactly why the greeting text was
// rendering underneath the Android status bar).
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { getDB, computeTripData, getDrafts, getDestinationInsights, getConsolidatedOverview, getNotificationFeed, getLifetimeInsights } from '../db';
import { getTripCoverTheme } from '../tripTheme';
import { LinearGradient } from 'expo-linear-gradient';
import { EmptyState, IconBadge, SectionHeader, ErrorState, currencySymbol, Container, useTheme } from '../components/UI';

// HOOK: this is the screen the organizer opens dozens of times per trip, often one-handed,
// often mid-conversation. The design brief calls it "the organizer's trip library," not a
// dashboard — so the hook is the Current Trip card: it answers "where do things stand?"
// (cash left, pending drafts) before the organizer taps anything. That single glanceable
// answer is what brings them back to this screen instead of just remembering things in a
// group chat, which is the real competitor here.
//
// BOTTOM NAV: all five destinations are real. Overview and Trips split the same trip
// data into "what needs my attention" vs. "every trip I have." Notifications is a genuine
// aggregation across every active trip (getNotificationFeed) — pending drafts, outstanding
// settlements, plans due soon — not a placeholder. More holds the How It Works explainer,
// feedback, and Google Drive backup — also real. (This comment used to say Notifications/
// More were deliberately unbuilt placeholders — that was true when it was written and
// stopped being true once those features shipped; left uncorrected, it's exactly the kind
// of stale comment that misleads a reader into thinking real features are stubs.)
const HOME_TABS = [
  { key: 'overview', label: 'Overview', icon: 'home' },
  { key: 'trips', label: 'Trips', icon: 'grid' },
  { key: 'add', label: '', icon: 'plus' },
  { key: 'notifications', label: 'Notifications', icon: 'bell' },
  { key: 'more', label: 'More', icon: 'menu' },
];

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [trips, setTrips] = useState([]);
  const [current, setCurrent] = useState(null);
  const [insights, setInsights] = useState([]);
  const [consolidated, setConsolidated] = useState(null);
  const [lifetime, setLifetime] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [homeTab, setHomeTab] = useState('overview');

  const loadTrips = async () => {
    try {
      const db = await getDB();
      const rows = await db.getAllAsync('SELECT * FROM trips ORDER BY created_at DESC');
      setTrips(rows);

      const activeTrip = rows.find((t) => t.status === 'active');
      if (activeTrip) {
        const { finance, today } = await computeTripData(activeTrip.id);
        const drafts = await getDrafts(activeTrip.id);
        const pendingSettlements = (finance.bankSettlement?.transactions?.length || 0) + (finance.liveForecast?.transactions?.length || 0);
        setCurrent({
          ...activeTrip,
          cashLeft: finance.currentCash,
          totalSpent: finance.totalSpent,
          spentToday: today?.spentToday || 0,
          pendingSettlements,
          pendingDrafts: drafts.length,
          baseCurrency: finance.baseCurrency,
        });
      } else {
        setCurrent(null);
      }
      setInsights(await getDestinationInsights());
      setConsolidated(await getConsolidatedOverview());
      setLifetime(await getLifetimeInsights());
      setRecentActivity((await getNotificationFeed()).slice(0, 3));
      setLoadError(null);
    } catch (err) {
      setLoadError(err?.message || 'Could not load your trips.');
    }
  };

  useFocusEffect(useCallback(() => { loadTrips(); }, []));

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  })();

  const previousTrips = trips.filter((t) => t.status === 'active' && t.id !== current?.id);
  const archivedTrips = trips.filter((t) => t.status === 'closed');

  const openTrip = (t) => navigation.navigate('Trip', { tripId: t.id, tripName: t.name });

  const handleHomeTabPress = (key) => {
    if (key === 'add') { navigation.navigate('CreateTrip'); return; }
    if (key === 'notifications') { navigation.navigate('Notifications'); return; }
    if (key === 'more') { navigation.navigate('More'); return; }
    setHomeTab(key);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <FlatList
        data={[]}
        renderItem={null}
        contentContainerStyle={styles.scrollContent}
        ListHeaderComponent={
          <Container>
            <View style={styles.headerRow}>
              <View>
                <Text style={styles.greeting}>{greeting},</Text>
                <Text style={styles.name}>Organizer</Text>
              </View>
              {trips.length >= 3 && (
                <TouchableOpacity
                  style={styles.searchBtn}
                  onPress={() => navigation.navigate('Search', { tripId: current?.id })}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityLabel="Search"
                  accessibilityRole="button"
                >
                  <Feather name="search" size={19} color={theme.ink} />
                </TouchableOpacity>
              )}
            </View>

            {loadError ? (
              <ErrorState
                title="Couldn't load your trips"
                hint={loadError}
                onRetry={loadTrips}
              />
            ) : homeTab === 'overview' ? (
              <>
                {consolidated && consolidated.activeTripCount > 0 && (
                  <View style={styles.consolidatedCard}>
                    <Text style={styles.consolidatedHeading}>Active Trips: {consolidated.activeTripCount}</Text>
                    <View style={styles.consolidatedStatsRow}>
                      <View style={styles.consolidatedStat}>
                        <Text style={styles.consolidatedValue}>{currencySymbol(consolidated.defaultCurrency)}{Math.round(consolidated.todaySpend).toLocaleString()}</Text>
                        <Text style={styles.consolidatedLabel}>Today's spend</Text>
                      </View>
                      <View style={styles.consolidatedStat}>
                        <Text style={styles.consolidatedValue}>{consolidated.pendingSettlements}</Text>
                        <Text style={styles.consolidatedLabel}>Pending settlements</Text>
                      </View>
                      <View style={styles.consolidatedStat}>
                        <Text style={styles.consolidatedValue}>{consolidated.totalActiveMembers}</Text>
                        <Text style={styles.consolidatedLabel}>Active members</Text>
                      </View>
                    </View>
                    {consolidated.otherCurrencyTrips.length > 0 && (
                      <Text style={styles.consolidatedNote}>
                        Today's spend covers trips in {consolidated.defaultCurrency} only — {consolidated.otherCurrencyTrips.map(t => `${t.name} (${t.base_currency})`).join(', ')} {consolidated.otherCurrencyTrips.length === 1 ? 'uses' : 'use'} a different currency, so amounts aren't mixed together here.
                      </Text>
                    )}
                    {consolidated.activeTripCount > 1 && (
                      <View style={styles.openTripsRow}>
                        {[...consolidated.sameCurrencyTrips, ...consolidated.otherCurrencyTrips].map((t) => (
                          <TouchableOpacity key={t.id} style={styles.openTripChip} onPress={() => openTrip(t)}>
                            <Text style={styles.openTripChipText}>{getTripCoverTheme(t.name).emoji} {t.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                )}

                {recentActivity.length > 0 && (
                  <View style={styles.activityCard}>
                    <Text style={styles.activityHeading}>Needs attention</Text>
                    {recentActivity.map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        style={styles.activityRow}
                        onPress={() => navigation.navigate('Trip', { tripId: item.tripId, tripName: item.tripName })}
                      >
                        <Feather name={item.icon} size={14} color={theme.brandDeep} />
                        <Text style={styles.activityText} numberOfLines={1}>{item.message}</Text>
                        <Feather name="chevron-right" size={14} color={theme.inkMute} />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {current ? (
                  <TouchableOpacity activeOpacity={0.85} onPress={() => openTrip(current)}>
                    <LinearGradient
                      colors={getTripCoverTheme(current.name).colors}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.heroCard}
                    >
                      <Text style={styles.heroWatermark}>{getTripCoverTheme(current.name).emoji}</Text>
                      <View style={styles.heroTopRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.heroLabel}>Current trip</Text>
                          <Text style={styles.heroTitle}>{current.name}</Text>
                        </View>
                        <View style={styles.activePill}><Text style={styles.activePillText}>Active</Text></View>
                      </View>
                      <View style={styles.heroStatsRow}>
                        <View>
                          <Text style={styles.heroStatLabel}>Total spent</Text>
                          <Text style={styles.heroStatValue}>{currencySymbol(current.baseCurrency)}{Math.round(current.totalSpent ?? 0).toLocaleString()}</Text>
                        </View>
                        <View>
                          <Text style={styles.heroStatLabel}>Today</Text>
                          <Text style={styles.heroStatValue}>{currencySymbol(current.baseCurrency)}{Math.round(current.spentToday ?? 0).toLocaleString()}</Text>
                        </View>
                        <View>
                          <Text style={styles.heroStatLabel}>Pending</Text>
                          <Text style={styles.heroStatValue}>{current.pendingSettlements ?? 0}</Text>
                        </View>
                        <View style={styles.heroViewBtn}>
                          <Text style={styles.heroViewText}>View trip</Text>
                          <Feather name="arrow-right" size={14} color="#fff" />
                        </View>
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>
                ) : (
                  <EmptyState
                    icon="trip"
                    title="Create your first trip to get started"
                    hint="Add travelers, log expenses, and everything stays right here, even offline."
                  />
                )}

                {(previousTrips.length > 0 || archivedTrips.length > 0) && (
                  <TouchableOpacity onPress={() => setHomeTab('trips')} style={styles.viewAllRow}>
                    <Text style={styles.viewAllText}>View all trips</Text>
                    <Feather name="chevron-right" size={16} color={theme.brandDeep} />
                  </TouchableOpacity>
                )}

                {/* Lifetime stats across every trip ever created (any status) — distinct
                    from the destination-repeat insights below, which only fire on a
                    2nd+ visit to the same place. This is the simple "how much have I
                    used this app" summary: trip count, people tracked, and total spend
                    per currency (never summed across currencies — a ₹ and a $ total
                    added together would be a real number that means nothing). Only
                    shown once there's at least one trip; the empty state above already
                    covers "you have nothing yet." */}
                {lifetime && lifetime.totalTripCount > 0 && (
                  <View style={styles.lifetimeStatsRow}>
                    <View style={styles.lifetimeStatCard}>
                      <Text style={styles.lifetimeStatValue}>{lifetime.totalTripCount}</Text>
                      <Text style={styles.lifetimeStatLabel}>{lifetime.totalTripCount === 1 ? 'Trip' : 'Trips'}</Text>
                    </View>
                    <View style={styles.lifetimeStatCard}>
                      <Text style={styles.lifetimeStatValue}>{lifetime.totalUniqueTravelers}</Text>
                      <Text style={styles.lifetimeStatLabel}>{lifetime.totalUniqueTravelers === 1 ? 'Person' : 'People'}</Text>
                    </View>
                    {lifetime.spendByCurrency.slice(0, 2).map((s) => (
                      <View key={s.currency} style={styles.lifetimeStatCard}>
                        <Text style={styles.lifetimeStatValue} numberOfLines={1} adjustsFontSizeToFit>
                          {currencySymbol(s.currency)}{Math.round(s.total).toLocaleString()}
                        </Text>
                        <Text style={styles.lifetimeStatLabel}>Spent{lifetime.spendByCurrency.length > 1 ? ` (${s.currency})` : ''}</Text>
                      </View>
                    ))}
                  </View>
                )}
                {lifetime?.topTrip && (
                  <View style={styles.topTripCard}>
                    <Feather name="award" size={16} color={theme.brandDeep} />
                    <Text style={styles.topTripText}>
                      Biggest trip so far: <Text style={{ fontWeight: theme.weight.semibold }}>{lifetime.topTrip.name}</Text> — {currencySymbol(lifetime.topTrip.currency)}{Math.round(lifetime.topTrip.amount).toLocaleString()}
                    </Text>
                  </View>
                )}

                {/* Real insights, not fabricated ones — only appears once a place has
                    actually been visited 2+ times, computed from real trip/expense/
                    traveler data via getDestinationInsights, never invented. */}
                {insights.map((ins) => (
                  <View key={ins.place} style={styles.insightCard}>
                    <Text style={styles.insightEmoji}>{getTripCoverTheme(ins.place).emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.insightTitle}>
                        You've been to {ins.place} {ins.visitCount} times
                      </Text>
                      <Text style={styles.insightBody}>
                        Spent {currencySymbol(ins.baseCurrency)}{Math.round(ins.totalSpent).toLocaleString()} total
                        {ins.topCompanions.length > 0 ? ` · usually with ${ins.topCompanions.join(', ')}` : ''}
                      </Text>
                    </View>
                  </View>
                ))}
              </>
            ) : (
              <>
                {current && <SectionHeader title="Current" />}
                {current && (
                  <View style={[styles.listCard, { marginBottom: theme.space.xxl }]}>
                    <TripRow trip={current} onPress={() => openTrip(current)} isLast />
                  </View>
                )}

                {previousTrips.length > 0 && (
                  <View style={{ marginTop: theme.space.xxl }}>
                    <SectionHeader title="Previous trips" />
                    <View style={styles.listCard}>
                      {previousTrips.map((t, i) => (
                        <TripRow key={t.id} trip={t} onPress={() => openTrip(t)} isLast={i === previousTrips.length - 1} />
                      ))}
                    </View>
                  </View>
                )}

                {archivedTrips.length > 0 && (
                  <View style={{ marginTop: theme.space.xxl }}>
                    <SectionHeader title="Archived trips" />
                    <View style={styles.listCard}>
                      {archivedTrips.map((t, i) => (
                        <TripRow key={t.id} trip={t} onPress={() => openTrip(t)} archived isLast={i === archivedTrips.length - 1} />
                      ))}
                    </View>
                  </View>
                )}

                {!current && previousTrips.length === 0 && archivedTrips.length === 0 && (
                  <EmptyState icon="trip" title="No trips yet" hint="Create your first trip from the + button below." />
                )}
              </>
            )}
          </Container>
        }
      />

      <View style={[styles.bottomNav, { paddingBottom: insets.bottom + 6 }]}>
        {HOME_TABS.map((t) =>
          t.key === 'add' ? (
            <TouchableOpacity key={t.key} style={styles.bottomNavFab} onPress={() => handleHomeTabPress(t.key)} accessibilityLabel="Create trip" accessibilityRole="button">
              <Feather name="plus" size={24} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity key={t.key} style={styles.bottomNavItem} onPress={() => handleHomeTabPress(t.key)} accessibilityLabel={t.label} accessibilityRole="button">
              <Feather name={t.icon} size={20} color={homeTab === t.key ? theme.brandDeep : theme.inkMute} />
              <Text style={[styles.bottomNavLabel, homeTab === t.key && { color: theme.brandDeep, fontWeight: theme.weight.semibold }]}>{t.label}</Text>
            </TouchableOpacity>
          )
        )}
      </View>
    </SafeAreaView>
  );
}

function TripRow({ trip, onPress, archived, isLast }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <TouchableOpacity style={[styles.tripRow, !isLast && styles.tripRowDivider]} onPress={onPress}>
      <IconBadge type="trip" size={36} tone={archived ? 'accent' : 'brand'} />
      <View style={{ flex: 1, marginStart: 12 }}>
        <Text style={styles.tripName}>{trip.name}</Text>
        <Text style={styles.tripMeta}>
          {archived ? 'Archived · ' : ''}Created {new Date(trip.created_at).toLocaleDateString()}
        </Text>
      </View>
      <Feather name="chevron-right" size={18} color={theme.inkMute} />
    </TouchableOpacity>
  );
}

const makeStyles = (theme) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  scrollContent: { padding: theme.space.xl, paddingBottom: 100 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: theme.space.xxl },
  greeting: { fontSize: theme.type.body, color: theme.inkMute },
  name: { fontSize: theme.type.hero, fontWeight: theme.weight.semibold, color: theme.ink, marginTop: 2, letterSpacing: -0.3 },
  searchBtn: { width: theme.a11y.minTouchTarget, height: theme.a11y.minTouchTarget, alignItems: 'center', justifyContent: 'center' },
  heroCard: {
    borderRadius: theme.radius.xl, padding: theme.space.xl, overflow: 'hidden', position: 'relative',
  },
  heroWatermark: { position: 'absolute', end: -6, top: -10, fontSize: 90, opacity: 0.18 },
  heroTopRow: { flexDirection: 'row', alignItems: 'flex-start' },
  activePill: { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  activePillText: { color: '#fff', fontSize: 11, fontWeight: theme.weight.semibold },
  heroLabel: { color: 'rgba(255,255,255,0.7)', fontSize: theme.type.caption, fontWeight: theme.weight.semibold, letterSpacing: 0.6 },
  heroTitle: { color: '#fff', fontSize: theme.type.title, fontWeight: theme.weight.semibold, marginTop: 4, letterSpacing: -0.3 },
  heroStatsRow: { flexDirection: 'row', alignItems: 'center', marginTop: theme.space.lg, gap: theme.space.md },
  heroStatLabel: { color: 'rgba(255,255,255,0.65)', fontSize: theme.type.caption },
  heroStatValue: { color: '#fff', fontSize: theme.type.heading, fontWeight: theme.weight.semibold, marginTop: 2 },
  heroViewBtn: { flexDirection: 'row', alignItems: 'center', marginStart: 'auto', gap: 4, backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: theme.radius.sm },
  heroViewText: { color: '#fff', fontSize: theme.type.caption, fontWeight: theme.weight.semibold },
  viewAllRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: theme.space.xl, minHeight: theme.a11y.minTouchTarget },
  insightCard: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md, backgroundColor: theme.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.line, padding: theme.space.md, marginTop: theme.space.md },
  consolidatedCard: { backgroundColor: theme.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.line, padding: theme.space.lg, marginBottom: theme.space.xl },
  consolidatedHeading: { fontSize: theme.type.heading, fontWeight: theme.weight.semibold, color: theme.ink, marginBottom: theme.space.md },
  consolidatedStatsRow: { flexDirection: 'row', gap: theme.space.sm },
  consolidatedStat: { flex: 1 },
  consolidatedValue: { fontSize: theme.type.title, fontWeight: theme.weight.semibold, color: theme.ink },
  consolidatedLabel: { fontSize: 11, color: theme.inkMute, marginTop: 2 },
  consolidatedNote: { fontSize: 11.5, color: theme.inkMute, marginTop: theme.space.md, lineHeight: 16 },
  activityCard: { backgroundColor: theme.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.line, padding: theme.space.lg, marginBottom: theme.space.xl },
  activityHeading: { fontSize: theme.type.body, fontWeight: theme.weight.semibold, color: theme.ink, marginBottom: theme.space.sm },
  activityRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm, minHeight: theme.a11y.minTouchTarget },
  activityText: { flex: 1, fontSize: theme.type.caption, color: theme.inkSoft },
  openTripsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.xs, marginTop: theme.space.md },
  openTripChip: { backgroundColor: theme.bg, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: theme.line },
  openTripChipText: { fontSize: 12.5, color: theme.ink, fontWeight: theme.weight.medium },
  insightEmoji: { fontSize: 26 },
  insightTitle: { fontSize: theme.type.body, fontWeight: theme.weight.semibold, color: theme.ink },
  insightBody: { fontSize: theme.type.caption, color: theme.inkMute, marginTop: 2, lineHeight: 16 },
  lifetimeStatsRow: { flexDirection: 'row', gap: theme.space.sm, marginTop: theme.space.lg },
  lifetimeStatCard: { flex: 1, backgroundColor: theme.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.line, paddingVertical: theme.space.md, paddingHorizontal: theme.space.sm, alignItems: 'center' },
  lifetimeStatValue: { fontSize: theme.type.title, fontWeight: theme.weight.semibold, color: theme.ink },
  lifetimeStatLabel: { fontSize: theme.type.caption, color: theme.inkMute, marginTop: 2 },
  topTripCard: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm, backgroundColor: theme.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.line, padding: theme.space.md, marginTop: theme.space.md },
  topTripText: { flex: 1, fontSize: theme.type.caption, color: theme.inkSoft },
  viewAllText: { color: theme.brandDeep, fontWeight: theme.weight.semibold, fontSize: theme.type.body },
  listCard: {
    backgroundColor: theme.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.line,
  },
  tripRow: { flexDirection: 'row', alignItems: 'center', padding: theme.space.md },
  tripRowDivider: { borderBottomWidth: 1, borderBottomColor: theme.line },
  tripName: { fontSize: theme.type.body, fontWeight: theme.weight.semibold, color: theme.ink },
  tripMeta: { fontSize: theme.type.caption, color: theme.inkMute, marginTop: 2 },
  bottomNav: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around',
    backgroundColor: theme.surface, borderTopWidth: 1, borderTopColor: theme.line,
    paddingTop: 8, paddingHorizontal: 8,
  },
  bottomNavItem: { alignItems: 'center', flex: 1, minHeight: theme.a11y.minTouchTarget, gap: 2 },
  bottomNavLabel: { fontSize: 10.5, color: theme.inkMute },
  bottomNavFab: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: theme.brandDeep,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
    shadowColor: theme.brandDeep, shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
});
