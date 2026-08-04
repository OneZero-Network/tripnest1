import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Modal, StyleSheet } from 'react-native';
import { addItineraryItem, deleteItineraryItem } from '../db';
import { ListRow, PrimaryButton, EmptyState, theme } from './UI';

export default function CockpitCard({ tripId, today, cashLeft, onChanged }) {
  const [collapsed, setCollapsed] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');

  if (!today) return null;

  const submitSegment = async () => {
    if (!title.trim() || !/^\d{1,2}:\d{2}$/.test(time.trim())) return;
    const [h, m] = time.trim().split(':').map(Number);
    const scheduled = new Date();
    scheduled.setHours(h, m, 0, 0);
    await addItineraryItem(tripId, title.trim(), scheduled.getTime(), location.trim() || null);
    setTitle(''); setTime(''); setLocation('');
    onChanged();
  };

  return (
    <>
      {!collapsed ? (
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Today</Text>
            <TouchableOpacity onPress={() => setCollapsed(true)}><Text style={styles.collapse}>Hide</Text></TouchableOpacity>
          </View>
          <Text style={styles.stat}>Cash left: {cashLeft}</Text>
          <TouchableOpacity onPress={() => setPlanOpen(true)}>
            {today.todaysSegments.length === 0 ? (
              <Text style={styles.muted}>Nothing scheduled for today. Tap to plan →</Text>
            ) : today.todaysSegments.map((s) => (
              <Text key={s.id} style={styles.line}>
                {new Date(s.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} — {s.title}{s.location ? ` @ ${s.location}` : ''}
              </Text>
            ))}
          </TouchableOpacity>
          {today.recentActivity.length > 0 && (
            <>
              <Text style={styles.subheading}>Recent activity</Text>
              {today.recentActivity.slice(0, 3).map((e) => (
                <Text key={e.id} style={styles.lineMuted}>{e.event}</Text>
              ))}
            </>
          )}
        </View>
      ) : (
        <TouchableOpacity style={styles.collapsedBar} onPress={() => setCollapsed(false)}>
          <Text style={styles.collapsedText}>Show Today</Text>
        </TouchableOpacity>
      )}

      <Modal visible={planOpen} animationType="slide" onRequestClose={() => setPlanOpen(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Today's Plan</Text>
            <TouchableOpacity onPress={() => setPlanOpen(false)}><Text style={styles.collapse}>Close</Text></TouchableOpacity>
          </View>
          <TextInput style={styles.input} placeholder="What (e.g. Dudhsagar Waterfalls)" value={title} onChangeText={setTitle} />
          <View style={{ flexDirection: 'row' }}>
            <TextInput style={styles.input} placeholder="Time HH:MM (24h)" value={time} onChangeText={setTime} keyboardType="numbers-and-punctuation" />
            <TextInput style={styles.input} placeholder="Location (optional)" value={location} onChangeText={setLocation} />
          </View>
          <PrimaryButton label="Add" onPress={submitSegment} />
          <FlatList
            data={today.todaysSegments}
            keyExtractor={(i) => i.id}
            renderItem={({ item }) => (
              <ListRow
                actionLabel="Remove"
                onAction={async () => { await deleteItineraryItem(item.id, tripId, item.title); onChanged(); }}
              >
                <Text style={styles.rowText}>
                  {new Date(item.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} — {item.title}{item.location ? ` @ ${item.location}` : ''}
                </Text>
              </ListRow>
            )}
            ListEmptyComponent={<EmptyState text="Nothing planned for today yet." />}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: theme.primary, borderRadius: 14, padding: 14, marginBottom: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  title: { color: '#fff', fontWeight: '700', fontSize: 16 },
  collapse: { color: '#BFE3DF', fontSize: 12, fontWeight: '600' },
  stat: { color: '#fff', fontWeight: '600', marginBottom: 4 },
  muted: { color: '#BFE3DF', fontSize: 12 },
  line: { color: '#fff', marginTop: 4 },
  subheading: { color: '#BFE3DF', marginTop: 10, fontSize: 12, fontWeight: '700' },
  lineMuted: { color: '#BFE3DF', marginTop: 2, fontSize: 12 },
  collapsedBar: { backgroundColor: theme.primaryLight, borderRadius: 10, padding: 8, alignItems: 'center', marginBottom: 12 },
  collapsedText: { color: theme.primary, fontWeight: '600', fontSize: 12 },
  modalContainer: { flex: 1, backgroundColor: theme.bg, padding: 16, paddingTop: 60 },
  input: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: theme.border, marginBottom: 8, flex: 1 },
  rowText: { color: theme.primary, paddingVertical: 8 },
});
