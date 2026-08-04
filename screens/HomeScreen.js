import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
// react-native-safe-area-context's SafeAreaView (not the react-native core one, which is
// iOS-only and a no-op on Android — that no-op is exactly why the greeting text was
// rendering underneath the Android status bar).
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { getDB, computeTripData, getDrafts } from '../db';
import { EmptyState, IconBadge, SectionHeader, ErrorState, currencySymbol, Container, useTheme } from '../components/UI';

// HOOK: this is the screen the organizer opens dozens of times per trip, often one-handed,
// often mid-conversation. The design brief calls it "the organizer's trip library," not a
// dashboard — so the hook is the Current Trip card: it answers "where do things stand?"
// (cash left, pending drafts) before the organizer taps anything. That single glanceable
// answer is what brings them back to this screen instead of just remembering things in a
// group chat, which is the real competitor here.
//
// DESIGN SYSTEM PASS: Current Trip stays a card (a genuinely bounded, singular object —
// the one thing this screen is about). Previous/Archived trips are no longer individual
// bordered+shadowed cards — they're one hairline-divided list, the same "ledger" pattern
// used for expenses/timeline, because a trip list is repeated records, not a set of
// independent bounded objects. No shadows anywhere on this screen.
export default function HomeScreen({ navigation }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [trips, setTrips] = useState([]);
  const [current, setCurrent] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const loadTrips = async () => {
    try {
      const db = await getDB();
      const rows = await db.getAllAsync('SELECT * FROM trips ORDER BY created_at DESC');
      setTrips(rows);

      const activeTrip = rows.find((t) => t.status === 'active');
      if (activeTrip) {
        const { finance } = await computeTripData(activeTrip.id);
        const drafts = await getDrafts(activeTrip.id);
        setCurrent({ ...activeTrip, cashLeft: finance.currentCash, pendingDrafts: drafts.length, baseCurrency: finance.baseCurrency });
      } else {
        setCurrent(null);
      }
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

  return (
    <SafeAreaView style={styles.safe}>
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
              <TouchableOpacity
                style={styles.searchBtn}
                onPress={() => navigation.navigate('Search', { tripId: current?.id })}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="Search"
                accessibilityRole="button"
              >
                <Feather name="search" size={19} color={theme.ink} />
              </TouchableOpacity>
            </View>

            {loadError ? (
              <ErrorState
                title="Couldn't load your trips"
                hint={loadError}
                onRetry={loadTrips}
              />
            ) : (
              <>
                {current ? (
                  <TouchableOpacity activeOpacity={0.85} onPress={() => openTrip(current)} style={styles.heroCard}>
                    <Text style={styles.heroLabel}>Current trip</Text>
                    <Text style={styles.heroTitle}>{current.name}</Text>
                    <View style={styles.heroStatsRow}>
                      <View>
                        <Text style={styles.heroStatLabel}>Cash left</Text>
                        <Text style={styles.heroStatValue}>{currencySymbol(current.baseCurrency)}{Math.round(current.cashLeft ?? 0).toLocaleString()}</Text>
                      </View>
                      <View>
                        <Text style={styles.heroStatLabel}>Pending drafts</Text>
                        <Text style={styles.heroStatValue}>{current.pendingDrafts}</Text>
                      </View>
                      <View style={styles.heroViewBtn}>
                        <Text style={styles.heroViewText}>View trip</Text>
                        <Feather name="arrow-right" size={14} color="#fff" />
                      </View>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <EmptyState
                    icon="trip"
                    title="Create your first trip to get started"
                    hint="Add travelers, log expenses, and everything stays right here, even offline."
                  />
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
              </>
            )}
          </Container>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('CreateTrip')} accessibilityLabel="Create trip" accessibilityRole="button">
        <Feather name="plus" size={26} color="#fff" />
      </TouchableOpacity>
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
  scrollContent: { padding: theme.space.xl, paddingBottom: 120 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: theme.space.xxl },
  greeting: { fontSize: theme.type.body, color: theme.inkMute },
  name: { fontSize: theme.type.hero, fontWeight: theme.weight.semibold, color: theme.ink, marginTop: 2, letterSpacing: -0.3 },
  searchBtn: { width: theme.a11y.minTouchTarget, height: theme.a11y.minTouchTarget, alignItems: 'center', justifyContent: 'center' },
  heroCard: {
    backgroundColor: theme.brandDeep, borderRadius: theme.radius.xl, padding: theme.space.xl,
  },
  heroLabel: { color: 'rgba(255,255,255,0.7)', fontSize: theme.type.caption, fontWeight: theme.weight.semibold, letterSpacing: 0.6 },
  heroTitle: { color: '#fff', fontSize: theme.type.title, fontWeight: theme.weight.semibold, marginTop: 4, letterSpacing: -0.3 },
  heroStatsRow: { flexDirection: 'row', alignItems: 'center', marginTop: theme.space.lg, gap: theme.space.xl },
  heroStatLabel: { color: 'rgba(255,255,255,0.65)', fontSize: theme.type.caption },
  heroStatValue: { color: '#fff', fontSize: theme.type.heading, fontWeight: theme.weight.semibold, marginTop: 2 },
  heroViewBtn: { flexDirection: 'row', alignItems: 'center', marginStart: 'auto', gap: 4, backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: theme.radius.sm },
  heroViewText: { color: '#fff', fontSize: theme.type.caption, fontWeight: theme.weight.semibold },
  listCard: {
    backgroundColor: theme.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.line,
  },
  tripRow: { flexDirection: 'row', alignItems: 'center', padding: theme.space.md },
  tripRowDivider: { borderBottomWidth: 1, borderBottomColor: theme.line },
  tripName: { fontSize: theme.type.body, fontWeight: theme.weight.semibold, color: theme.ink },
  tripMeta: { fontSize: theme.type.caption, color: theme.inkMute, marginTop: 2 },
  fab: {
    position: 'absolute', end: 20, bottom: 28, width: 58, height: 58, borderRadius: 29,
    backgroundColor: theme.brandDeep, alignItems: 'center', justifyContent: 'center',
    shadowColor: theme.brandDeep, shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
});
