import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { getDB, logTimelineEvent } from '../db';
import { EmptyState, PrimaryButton, IconBadge, theme } from '../components/UI';

export default function HomeScreen({ navigation }) {
  const [trips, setTrips] = useState([]);
  const [newTripName, setNewTripName] = useState('');

  const loadTrips = async () => {
    const db = await getDB();
    const rows = await db.getAllAsync('SELECT * FROM trips ORDER BY created_at DESC');
    setTrips(rows);
  };

  useFocusEffect(useCallback(() => { loadTrips(); }, []));

  const createTrip = async () => {
    if (!newTripName.trim()) return;
    const db = await getDB();
    const id = String(Date.now());
    await db.runAsync('INSERT INTO trips (id, name, created_at) VALUES (?, ?, ?)', id, newTripName.trim(), Date.now());
    const ts = Date.now();
    await logTimelineEvent({ tripId: id, type: 'trip', title: `Trip created: ${newTripName.trim()}`, timestamp: ts, idSuffix: '_created' });
    setNewTripName('');
    loadTrips();
    navigation.navigate('Trip', { tripId: id, tripName: newTripName.trim() });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>TripNest</Text>
      <Text style={styles.subtitle}>Keep the organizer calm.</Text>

      <View style={styles.newTripRow}>
        <TextInput
          style={styles.input}
          placeholder="New trip name, e.g. Goa Boys Trip"
          placeholderTextColor={theme.inkMute}
          value={newTripName}
          onChangeText={setNewTripName}
        />
        <PrimaryButton label="Create" icon="plus" onPress={createTrip} />
      </View>

      <FlatList
        data={trips}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.tripCard}
            onPress={() => navigation.navigate('Trip', { tripId: item.id, tripName: item.name })}
          >
            <IconBadge type="trip" size={40} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.tripName}>{item.name}</Text>
              <Text style={styles.tripMeta}>Created {new Date(item.created_at).toLocaleDateString()}</Text>
            </View>
            <Feather name="chevron-right" size={18} color={theme.inkMute} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <EmptyState
            icon="trip"
            title="No trips yet"
            hint="Create your first trip above — add travelers, log expenses, and everything stays right here, even offline."
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg, padding: 20, paddingTop: 60 },
  title: { fontSize: 30, fontWeight: '700', color: theme.ink, letterSpacing: -0.5 },
  subtitle: { fontSize: 14.5, color: theme.inkMute, marginTop: 4, marginBottom: 24 },
  newTripRow: { flexDirection: 'row', marginBottom: 24, gap: 8 },
  input: { flex: 1, backgroundColor: '#fff', borderRadius: theme.radius.sm, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: theme.line, color: theme.ink },
  tripCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', padding: 14, borderRadius: theme.radius.lg, marginBottom: 10,
    borderWidth: 1, borderColor: theme.line,
    shadowColor: '#0B0F14', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  tripName: { fontSize: 16.5, fontWeight: '700', color: theme.ink },
  tripMeta: { fontSize: 12, color: theme.inkMute, marginTop: 2 },
});
