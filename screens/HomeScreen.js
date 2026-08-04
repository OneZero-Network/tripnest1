import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { getDB, computeTripData, getDrafts } from '../db';
import { EmptyState, IconBadge, SectionHeader, theme } from '../components/UI';

// HOOK: this is the screen the organizer opens dozens of times per trip, often one-handed,
// often mid-conversation. The design brief calls it "the organizer's trip library," not a
// dashboard — so the hook is the Current Trip card: it answers "where do things stand?"
// (cash left, pending drafts) before the organizer taps anything. That single glanceable
// answer is what brings them back to this screen instead of just remembering things in a
// group chat, which is the real competitor here.
export default function HomeScreen({ navigation }) {
  const [trips, setTrips] = useState([]);
  const [current, setCurrent] = useState(null);

  const loadTrips = async () => {
    const db = await getDB();
    const rows = await db.getAllAsync('SELECT * FROM trips ORDER BY created_at DESC');
    setTrips(rows);

    const activeTrip = rows.find((t) => t.status === 'active');
    if (activeTrip) {
      const { finance } = await computeTripData(activeTrip.id);
      const drafts = await getDrafts(activeTrip.id);
      setCurrent({ ...activeTrip, cashLeft: finance.currentCash, pendingDrafts: drafts.length });
    } else {
      setCurrent(null);
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
          <View>
            <View style={styles.headerRow}>
              <View>
                <Text style={styles.greeting}>{greeting},</Text>
                <Text style={styles.name}>Organizer 👋</Text>
              </View>
              <TouchableOpacity style={styles.searchBtn} onPress={() => navigation.navigate('Search', { tripId: current?.id })}>
                <Feather name="search" size={19} color={theme.brandDeep} />
              </TouchableOpacity>
            </View>

            {current ? (
              <TouchableOpacity activeOpacity={0.9} onPress={() => openTrip(current)} style={styles.heroCard}>
                <Text style={styles.heroLabel}>CURRENT TRIP</Text>
                <Text style={styles.heroTitle}>{current.name}</Text>
                <View style={styles.heroStatsRow}>
                  <View>
                    <Text style={styles.heroStatLabel}>Cash Left</Text>
                    <Text style={styles.heroStatValue}>₹{Math.round(current.cashLeft ?? 0).toLocaleString()}</Text>
                  </View>
                  <View>
                    <Text style={styles.heroStatLabel}>Pending Drafts</Text>
                    <Text style={styles.heroStatValue}>{current.pendingDrafts}</Text>
                  </View>
                  <View style={styles.heroViewBtn}>
                    <Text style={styles.heroViewText}>View Trip</Text>
                    <Feather name="arrow-right" size={14} color="#fff" />
                  </View>
                </View>
              </TouchableOpacity>
            ) : (
              <EmptyState
                icon="trip"
                title="No active trip yet"
                hint="Create your first trip below — add travelers, log expenses, and everything stays right here, even offline."
              />
            )}

            {previousTrips.length > 0 && (
              <View style={{ marginTop: 26 }}>
                <SectionHeader title="Previous Trips" />
                {previousTrips.map((t) => (
                  <TripRow key={t.id} trip={t} onPress={() => openTrip(t)} />
                ))}
              </View>
            )}

            {archivedTrips.length > 0 && (
              <View style={{ marginTop: 26 }}>
                <SectionHeader title="Archived Trips" />
                {archivedTrips.map((t) => (
                  <TripRow key={t.id} trip={t} onPress={() => openTrip(t)} archived />
                ))}
              </View>
            )}
          </View>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('CreateTrip')}>
        <Feather name="plus" size={26} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

function TripRow({ trip, onPress, archived }) {
  return (
    <TouchableOpacity style={styles.tripCard} onPress={onPress}>
      <IconBadge type="trip" size={40} tone={archived ? 'accent' : 'brand'} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.tripName}>{trip.name}</Text>
        <Text style={styles.tripMeta}>
          {archived ? 'Archived · ' : ''}Created {new Date(trip.created_at).toLocaleDateString()}
        </Text>
      </View>
      <Feather name="chevron-right" size={18} color={theme.inkMute} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  scrollContent: { padding: 20, paddingBottom: 120 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 },
  greeting: { fontSize: 15, color: theme.inkMute },
  name: { fontSize: 24, fontWeight: '700', color: theme.ink, marginTop: 2, letterSpacing: -0.3 },
  searchBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.brandWash, alignItems: 'center', justifyContent: 'center' },
  heroCard: {
    backgroundColor: theme.brandDeep, borderRadius: theme.radius.xl, padding: 20,
    shadowColor: theme.brand, shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 4,
  },
  heroLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11.5, fontWeight: '700', letterSpacing: 0.6 },
  heroTitle: { color: '#fff', fontSize: 22, fontWeight: '700', marginTop: 4, letterSpacing: -0.3 },
  heroStatsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 18, gap: 22 },
  heroStatLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 11.5 },
  heroStatValue: { color: '#fff', fontSize: 17, fontWeight: '700', marginTop: 2 },
  heroViewBtn: { flexDirection: 'row', alignItems: 'center', marginLeft: 'auto', gap: 4, backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },
  heroViewText: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
  tripCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', padding: 14, borderRadius: theme.radius.lg, marginBottom: 10,
    borderWidth: 1, borderColor: theme.line,
    shadowColor: '#0B0F14', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  tripName: { fontSize: 16, fontWeight: '700', color: theme.ink },
  tripMeta: { fontSize: 12, color: theme.inkMute, marginTop: 2 },
  fab: {
    position: 'absolute', right: 20, bottom: 28, width: 58, height: 58, borderRadius: 29,
    backgroundColor: theme.brandDeep, alignItems: 'center', justifyContent: 'center',
    shadowColor: theme.brand, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
});
