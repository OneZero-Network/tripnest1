import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { groupTimelineForReplay } from '../db';
import { Chip, EmptyState, theme } from './UI';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'expense', label: 'Expenses' },
  { key: 'note', label: 'Notes' },
  { key: 'document', label: 'Documents' },
  { key: 'trip_events', label: 'Trip events' },
];
// Same Feather icon language as IconBadge elsewhere — this list used to use a separate
// emoji map, which is exactly the inconsistency the engineering review flagged.
const ICONS = { expense: 'dollar-sign', note: 'file-text', document: 'paperclip', itinerary: 'calendar', traveler: 'user', trip: 'flag', contribution: 'gift', settlement: 'check-circle' };

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
        <EmptyState
          icon="expense"
          title="Log an expense or note to start the trip history"
          hint="Once you add expenses, notes, or documents, they'll show up here as a day-by-day trip history."
        />
      ) : (
        // No inner ScrollView here — this renders inside TripScreen's single outer
        // ScrollView. A nested vertical ScrollView here was a real gesture-conflict bug,
        // not a style choice, and is now fixed rather than carried forward.
        days.map((day) => (
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
                  <View key={ev.id} style={styles.blockLineRow}>
                    <Feather name={ICONS[ev.type] || 'circle'} size={13} color={theme.brandDeep} style={{ marginTop: 2 }} />
                    <Text style={styles.blockLine}>{ev.event}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { flex: 1 },
  filterRow: { flexGrow: 0, marginBottom: theme.space.md },
  dayGroup: { marginBottom: theme.space.lg },
  dayHeading: { fontWeight: theme.weight.semibold, fontSize: theme.type.heading, color: theme.ink, marginBottom: theme.space.sm, borderBottomWidth: 1, borderBottomColor: theme.line, paddingBottom: 6, letterSpacing: -0.2 },
  activityBlock: { marginBottom: theme.space.md, paddingStart: 2 },
  blockTime: { fontSize: theme.type.caption, fontWeight: theme.weight.semibold, color: theme.inkMute, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  blockLineRow: { flexDirection: 'row', gap: 8, paddingVertical: 3 },
  blockLine: { fontSize: theme.type.body, color: theme.inkSoft, flex: 1 },
});
