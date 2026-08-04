import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { groupTimelineForReplay } from '../db';
import { Chip, EmptyState, theme } from './UI';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'expense', label: 'Expenses' },
  { key: 'note', label: 'Notes' },
  { key: 'document', label: 'Documents' },
  { key: 'trip_events', label: 'Trip Events' },
];
const ICONS = { expense: '💰', note: '📝', document: '📄', itinerary: '🗓️', traveler: '👤', trip: '🚩', contribution: '💵' };

export default function TimelineTab({ timeline }) {
  const [filter, setFilter] = useState('all');

  const filtered = timeline.filter((e) => {
    if (filter === 'all') return true;
    if (filter === 'trip_events') return !['expense', 'note', 'document'].includes(e.type);
    return e.type === filter;
  });
  const days = groupTimelineForReplay(filtered);

  return (
    <View style={styles.section}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
        {FILTERS.map((f) => (
          <Chip key={f.key} label={f.label} active={filter === f.key} onPress={() => setFilter(f.key)} />
        ))}
      </ScrollView>

      {days.length === 0 ? (
        <EmptyState text="Nothing here yet." />
      ) : (
        <ScrollView>
          {days.map((day) => (
            <View key={day.dayKey} style={styles.dayGroup}>
              <Text style={styles.dayHeading}>
                {day.date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
              </Text>
              {day.blocks.map((block, bi) => (
                <View key={bi} style={styles.activityBlock}>
                  <Text style={styles.blockTime}>
                    {new Date(block.anchorTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  {block.events.map((ev) => (
                    <Text key={ev.id} style={styles.blockLine}>{ICONS[ev.type] || '•'} {ev.event}</Text>
                  ))}
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { flex: 1 },
  filterRow: { flexGrow: 0, marginBottom: 10 },
  dayGroup: { marginBottom: 18 },
  dayHeading: { fontWeight: '700', fontSize: 15, color: theme.primary, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: theme.border, paddingBottom: 4 },
  activityBlock: { marginBottom: 10, paddingLeft: 4 },
  blockTime: { fontSize: 11, fontWeight: '700', color: '#6B8E89', marginBottom: 2 },
  blockLine: { fontSize: 14, color: theme.primary, paddingVertical: 2 },
});
