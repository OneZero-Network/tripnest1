import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Modal, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { addItineraryItem, deleteItineraryItem } from '../db';
import { ListRow, PrimaryButton, EmptyState, StatHero, IconBadge, theme } from './UI';

// Redesigned on the "one number answers the main question" pattern: Cash left is the
// hero (biggest, most confident thing on the card), today's plan is a secondary tappable
// strip beneath it, recent activity is compressed to a small icon-led list. Previously
// every line here had equal visual weight — this is the fix for that.
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

  const cashIsNegative = cashLeft < 0;

  return (
    <>
      {!collapsed ? (
        <StatHero
          label="Cash left"
          value={String(cashLeft)}
          sublabel={cashIsNegative ? 'More has gone out than has come in so far' : 'Across all recorded contributions and spend'}
        >
          <TouchableOpacity onPress={() => setCollapsed(true)} style={styles.hideBtn}>
            <Feather name="chevron-up" size={16} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.planStrip} onPress={() => setPlanOpen(true)}>
            <Feather name="calendar" size={15} color="rgba(255,255,255,0.85)" />
            {today.todaysSegments.length === 0 ? (
              <Text style={styles.planStripText}>Nothing planned today — tap to add</Text>
            ) : (
              <Text style={styles.planStripText} numberOfLines={1}>
                {new Date(today.todaysSegments[0].scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} — {today.todaysSegments[0].title}
                {today.todaysSegments.length > 1 ? ` +${today.todaysSegments.length - 1} more` : ''}
              </Text>
            )}
            <Feather name="chevron-right" size={15} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>

          {today.recentActivity.length > 0 && (
            <View style={{ marginTop: 14 }}>
              <Text style={styles.recentLabel}>Recent activity</Text>
              {today.recentActivity.slice(0, 3).map((e) => (
                <Text key={e.id} style={styles.recentLine} numberOfLines={1}>· {e.event}</Text>
              ))}
            </View>
          )}
        </StatHero>
      ) : (
        <TouchableOpacity style={styles.collapsedBar} onPress={() => setCollapsed(false)}>
          <IconBadge type="check" size={22} />
          <Text style={styles.collapsedText}>Cash left: {cashLeft} · tap for today</Text>
        </TouchableOpacity>
      )}

      <Modal visible={planOpen} animationType="slide" onRequestClose={() => setPlanOpen(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeaderRow}>
            <Text style={styles.modalTitle}>Today's Plan</Text>
            <TouchableOpacity onPress={() => setPlanOpen(false)}><Text style={styles.close}>Close</Text></TouchableOpacity>
          </View>
          <TextInput style={styles.input} placeholder="What (e.g. Dudhsagar Waterfalls)" placeholderTextColor={theme.inkMute} value={title} onChangeText={setTitle} />
          <View style={{ flexDirection: 'row' }}>
            <TextInput style={styles.input} placeholder="Time HH:MM (24h)" placeholderTextColor={theme.inkMute} value={time} onChangeText={setTime} keyboardType="numbers-and-punctuation" />
            <TextInput style={styles.input} placeholder="Location (optional)" placeholderTextColor={theme.inkMute} value={location} onChangeText={setLocation} />
          </View>
          <PrimaryButton label="Add to plan" icon="plus" onPress={submitSegment} style={{ marginBottom: 12 }} />
          <FlatList
            data={today.todaysSegments}
            keyExtractor={(i) => i.id}
            renderItem={({ item }) => (
              <ListRow
                icon="itinerary"
                actionLabel="Remove"
                onAction={async () => { await deleteItineraryItem(item.id, tripId, item.title); onChanged(); }}
              >
                <Text style={styles.rowTitle}>{item.title}</Text>
                <Text style={styles.rowSub}>
                  {new Date(item.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{item.location ? ` · ${item.location}` : ''}
                </Text>
              </ListRow>
            )}
            ListEmptyComponent={
              <EmptyState
                icon="itinerary"
                title="Nothing planned for today"
                hint="Add a time and a place, and it'll show up on your Today card automatically."
                optional
              />
            }
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  hideBtn: { position: 'absolute', top: -8, right: -8, padding: 8 },
  planStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 14, padding: 12, marginTop: 18,
  },
  planStripText: { flex: 1, color: '#fff', fontSize: 13.5, fontWeight: '600' },
  recentLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  recentLine: { color: 'rgba(255,255,255,0.85)', fontSize: 12.5, marginTop: 3 },
  collapsedBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: theme.brandWash, borderRadius: theme.radius.md, padding: 12, marginBottom: 12,
  },
  collapsedText: { color: theme.brandDeep, fontWeight: '700', fontSize: 13 },
  modalContainer: { flex: 1, backgroundColor: theme.bg, padding: 20, paddingTop: 60 },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: theme.type.title, fontWeight: '700', color: theme.ink, letterSpacing: -0.3 },
  close: { color: theme.brandDeep, fontWeight: '700' },
  input: { backgroundColor: '#fff', borderRadius: theme.radius.sm, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: theme.line, marginBottom: 10, flex: 1, color: theme.ink },
  rowTitle: { color: theme.ink, fontWeight: '600', fontSize: 14.5 },
  rowSub: { color: theme.inkMute, fontSize: 12, marginTop: 2 },
});
