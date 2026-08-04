import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getDB, logTimelineEvent } from '../db';

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
          placeholder="New trip name"
          value={newTripName}
          onChangeText={setNewTripName}
        />
        <TouchableOpacity style={styles.addBtn} onPress={createTrip}>
          <Text style={styles.addBtnText}>Create</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={trips}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.tripCard}
            onPress={() => navigation.navigate('Trip', { tripId: item.id, tripName: item.name })}
          >
            <Text style={styles.tripName}>{item.name}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No trips yet. Create your first one above.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4FAF9', padding: 20, paddingTop: 60 },
  title: { fontSize: 28, fontWeight: '700', color: '#0F5C56' },
  subtitle: { fontSize: 14, color: '#4C7A75', marginBottom: 20 },
  newTripRow: { flexDirection: 'row', marginBottom: 20 },
  input: { flex: 1, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: '#CFE8E4' },
  addBtn: { backgroundColor: '#0F5C56', marginLeft: 8, paddingHorizontal: 16, justifyContent: 'center', borderRadius: 10 },
  addBtnText: { color: '#fff', fontWeight: '600' },
  tripCard: { backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#E1F0EE' },
  tripName: { fontSize: 17, fontWeight: '600', color: '#0F5C56' },
  empty: { color: '#8FA8A5', textAlign: 'center', marginTop: 40 },
});
