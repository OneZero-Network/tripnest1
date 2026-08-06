import React, {useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { addItineraryItem, deleteItineraryItem } from '../db';
import { PrimaryButton, EmptyState, LedgerList, LedgerRow, StatHero, IconBadge, currencySymbol, useTheme } from './UI';

// Redesigned on the "one number answers the main question" pattern: Cash left is the
// hero (biggest, most confident thing on the card), today's plan is a secondary tappable
// strip beneath it, recent activity is compressed to a small icon-led list. Previously
// every line here had equal visual weight — this is the fix for that.
// Contextual hero: same StatHero component, different meaning depending on where the
// organizer actually is in the trip lifecycle — approved direction from the design review
// ("one reusable component, multiple meanings"). Deliberately limited to states we can
// honestly derive from real data (time of day, draft count, trip status). A "Travel / next
// destination" state was explicitly requested but isn't included: there's no flight/hotel/
// location-transition data in the schema to derive "currently in transit" from, and faking
// it off itinerary items would be a guess dressed as a feature.
function resolveHeroContext({ tripStatus, cashLeft, pendingDraftsCount, hour, currency }) {
  if (tripStatus === 'closed') {
    return { key: 'finished', label: 'Trip closed', value: 'Settlement ready', sublabel: 'Open Finance to see the final who-owes-whom.' };
  }
  if (hour < 12) {
    return { key: 'morning', label: "Today's plan", value: null, sublabel: null }; // value rendered from todaysSegments below
  }
  if (hour >= 18 && pendingDraftsCount > 0) {
    return { key: 'night', label: 'Pending drafts', value: String(pendingDraftsCount), sublabel: pendingDraftsCount === 1 ? 'One capture waiting to be finished' : 'Waiting to be turned into real records' };
  }
  // Negative cash is a shortfall, not a debt to display as "-₹200" — that reads as a
  // broken number to a non-accountant. "Needs ₹200" says the same fact as an action.
  if (cashLeft < 0) {
    return { key: 'midday', label: 'Shared cash', value: `Needs ${currencySymbol(currency)}${Math.abs(cashLeft)}`, sublabel: 'More has gone out than has come in so far' };
  }
  return { key: 'midday', label: 'Cash left', value: `${currencySymbol(currency)}${cashLeft}`, sublabel: 'Across all recorded contributions and spend' };
}

export default function CockpitCard({ tripId, today, cashLeft, tripStatus = 'active', pendingDraftsCount = 0, baseCurrency = 'INR', onChanged }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  // Defaults to collapsed: the hero was showing at full size every time the organizer
  // switched tabs, which is exactly the "same big card blocking the content I actually
  // want" complaint. It's still one tap away — nothing lost, just not forced on every view.
  const [collapsed, setCollapsed] = useState(true);
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

  const ctx = resolveHeroContext({ tripStatus, cashLeft, pendingDraftsCount, hour: new Date().getHours(), currency: baseCurrency });
  const heroValue = ctx.key === 'morning'
    ? (today.todaysSegments.length === 0 ? 'Nothing yet' : String(today.todaysSegments.length))
    : ctx.value;
  const heroSublabel = ctx.key === 'morning'
    ? (today.todaysSegments.length === 0 ? 'Nothing planned for today yet' : `${today.todaysSegments.length} thing${today.todaysSegments.length === 1 ? '' : 's'} planned today`)
    : ctx.sublabel;

  return (
    <>
      {!collapsed ? (
        <StatHero
          style={{ marginBottom: theme.space.lg }}
          label={ctx.label}
          value={heroValue}
          sublabel={heroSublabel}
        >
          <TouchableOpacity onPress={() => setCollapsed(true)} style={styles.hideBtn} accessibilityLabel="Collapse today card" accessibilityRole="button">
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
        <TouchableOpacity style={[styles.collapsedBar, { marginBottom: theme.space.lg }]} onPress={() => setCollapsed(false)}>
          <IconBadge type="check" size={22} />
          <Text style={styles.collapsedText}>{ctx.label}: {heroValue} · tap for breakdown</Text>
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
          <PrimaryButton label="Add to plan" icon="plus" onPress={submitSegment} style={{ marginBottom: theme.space.md }} />
          {today.todaysSegments.length === 0 ? (
            <EmptyState
              icon="itinerary"
              title="Add a time and place to plan today"
              hint="Add a time and a place, and it'll show up on your Today card automatically."
              optional
            />
          ) : (
            <LedgerList>
              {today.todaysSegments.map((item, i) => (
                <LedgerRow
                  key={item.id}
                  icon="itinerary"
                  actionLabel="Remove"
                  onAction={async () => { await deleteItineraryItem(item.id, tripId, item.title); onChanged(); }}
                  isLast={i === today.todaysSegments.length - 1}
                >
                  <Text style={styles.rowTitle}>{item.title}</Text>
                  <Text style={styles.rowSub}>
                    {new Date(item.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{item.location ? ` · ${item.location}` : ''}
                  </Text>
                </LedgerRow>
              ))}
            </LedgerList>
          )}
        </View>
      </Modal>
    </>
  );
}

const makeStyles = (theme) => StyleSheet.create({
  hideBtn: { position: 'absolute', top: -8, end: -8, padding: 8 },
  planStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 14, padding: 12, marginTop: 18,
  },
  planStripText: { flex: 1, color: '#fff', fontSize: 13.5, fontWeight: '600' },
  recentLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: theme.weight.semibold, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  recentLine: { color: 'rgba(255,255,255,0.85)', fontSize: 12.5, marginTop: 3 },
  collapsedBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: theme.brandWash, borderRadius: theme.radius.md, padding: 12, marginBottom: 12,
  },
  collapsedText: { color: theme.brandDeep, fontWeight: theme.weight.semibold, fontSize: 13 },
  modalContainer: { flex: 1, backgroundColor: theme.bg, padding: 20, paddingTop: 60 },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: theme.type.title, fontWeight: theme.weight.semibold, color: theme.ink, letterSpacing: -0.3 },
  close: { color: theme.brandDeep, fontWeight: theme.weight.semibold },
  input: { backgroundColor: '#fff', borderRadius: theme.radius.sm, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: theme.line, marginBottom: 10, flex: 1, color: theme.ink },
  rowTitle: { color: theme.ink, fontWeight: '600', fontSize: 14.5 },
  rowSub: { color: theme.inkMute, fontSize: 12, marginTop: 2 },
});
