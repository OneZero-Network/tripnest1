import React, {useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { groupTimelineForReplay } from '../db';
import { Chip, EmptyState, IconBadge, CATEGORY_EMOJI, currencySymbol, formatMoney, useTheme } from './UI';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'expense', label: 'Expenses' },
  { key: 'contribution', label: 'Contributions' },
  { key: 'exchange', label: 'Exchanges' },
  { key: 'note', label: 'Notes' },
  { key: 'document', label: 'Docs' },
];

// "Today" / "Yesterday" reads like a diary; a full weekday-month-day date reads like an
// audit log — the exact distinction this review is making. Falls back to a short date
// for anything older than that, since "3 Tuesdays ago" isn't actually more readable.
function relativeDayLabel(date) {
  const now = new Date();
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

export default function TimelineTab({ timeline, baseCurrency = 'INR', onOpenItem }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [filter, setFilter] = useState('all');
  const cs = currencySymbol(baseCurrency);

  const filtered = timeline.filter((e) => {
    if (filter === 'all') return true;
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
          title="🍔 Log your first expense to start this trip's story"
          hint="Once you add expenses, notes, or documents, they'll show up here as a day-by-day travel diary."
        />
      ) : (
        // No inner ScrollView here — this renders inside TripScreen's single outer
        // ScrollView. A nested vertical ScrollView here was a real gesture-conflict bug,
        // not a style choice, and is now fixed rather than carried forward.
        days.map((day) => (
          <View key={day.dayKey} style={styles.dayGroup}>
            <Text style={styles.dayHeading}>{relativeDayLabel(day.date)}</Text>
            {day.blocks.map((block, bi) => {
              const blockTime = new Date(block.anchorTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              return (
                <View key={bi} style={styles.activityBlock}>
                  {block.events.map((ev) => {
                    const openable = onOpenItem && ['expense', 'note', 'document', 'contribution', 'exchange'].includes(ev.type) && ev.metadata;
                    const Row = openable ? TouchableOpacity : View;
                    let meta = null;
                    try { meta = ev.metadata ? JSON.parse(ev.metadata) : null; } catch {}

                    // Structured, diary-style rows for the two event types that carry
                    // enough metadata to render richly (category, payer, amount / a real
                    // filename) — everything else keeps the plain one-line sentence,
                    // which is fine for rarer events like "Trip created."
                    if (ev.type === 'expense' && meta?.edited) {
                      const fmt = (v) => (meta.field === 'amount' ? `${cs}${v}` : v ?? '—');
                      return (
                        <Row key={ev.id} style={styles.diaryRow} onPress={openable ? () => onOpenItem(ev) : undefined}>
                          <Text style={styles.diaryEmoji}>✏️</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.diaryTitle}>Edited {meta.category || 'expense'}</Text>
                            <Text style={styles.diarySub}>{fmt(meta.oldValue)} → {fmt(meta.newValue)}</Text>
                          </View>
                          <Text style={styles.diaryTime}>{blockTime}</Text>
                        </Row>
                      );
                    }
                    if (ev.type === 'expense' && meta?.category) {
                      return (
                        <Row key={ev.id} style={styles.diaryRow} onPress={openable ? () => onOpenItem(ev) : undefined}>
                          <Text style={styles.diaryEmoji}>{CATEGORY_EMOJI[meta.category] || '🧾'}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.diaryTitle}>{meta.category}</Text>
                            <Text style={styles.diarySub}>{meta.paidBy} paid {currencySymbol(meta.currency || baseCurrency)}{formatMoney(meta.amount)}{meta.currency !== baseCurrency ? ` ${meta.currency}` : ''}{meta.fundingSource === 'bank' ? ' · Trip Bank' : meta.fundingSource === 'personal' ? ' · Personal' : ''}</Text>
                          </View>
                          <Text style={styles.diaryTime}>{blockTime}</Text>
                        </Row>
                      );
                    }
                    if (ev.type === 'document' && meta?.name) {
                      return (
                        <Row key={ev.id} style={styles.diaryRow} onPress={openable ? () => onOpenItem(ev) : undefined}>
                          <Text style={styles.diaryEmoji}>📷</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.diaryTitle}>{meta.name}</Text>
                          </View>
                          <Text style={styles.diaryTime}>{blockTime}</Text>
                        </Row>
                      );
                    }
                    return (
                      <Row key={ev.id} style={styles.blockLineRow} onPress={openable ? () => onOpenItem(ev) : undefined}>
                        <IconBadge type={ev.type} size={28} />
                        <Text style={styles.blockLine}>{ev.event}</Text>
                        <Text style={styles.diaryTimeMuted}>{blockTime}</Text>
                        {openable && <Feather name="chevron-right" size={14} color={theme.inkMute} />}
                      </Row>
                    );
                  })}
                </View>
              );
            })}
          </View>
        ))
      )}
    </View>
  );
}

const makeStyles = (theme) => StyleSheet.create({
  section: { flex: 1, paddingBottom: 88 }, // clears the floating action button, same fix as SettlementTab
  filterRow: { flexGrow: 0, marginBottom: theme.space.md },
  dayGroup: { marginBottom: theme.space.lg },
  dayHeading: { fontWeight: theme.weight.semibold, fontSize: theme.type.heading, color: theme.ink, marginBottom: theme.space.sm, borderBottomWidth: 1, borderBottomColor: theme.line, paddingBottom: 6, letterSpacing: -0.2 },
  activityBlock: { marginBottom: theme.space.xs },
  blockLineRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md, paddingVertical: theme.space.sm },
  blockLine: { fontSize: theme.type.body, color: theme.inkSoft, flex: 1 },
  diaryRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md, paddingVertical: theme.space.sm },
  diaryEmoji: { fontSize: 22 },
  diaryTitle: { fontSize: theme.type.body, fontWeight: theme.weight.semibold, color: theme.ink },
  diarySub: { fontSize: theme.type.caption, color: theme.inkMute, marginTop: 1 },
  diaryTime: { fontSize: 11, color: theme.inkMute },
  diaryTimeMuted: { fontSize: 11, color: theme.inkMute, marginStart: 'auto' },
});
