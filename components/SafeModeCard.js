import React, {useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Linking } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { getSafeModeData } from '../db';
import { openDocument } from '../tripExport';
import { useTheme, IconBadge, EmptyState } from './UI';

// HOOK: this screen exists for exactly one moment — something's gone wrong (missed flight,
// lost bag, a traveler needs the embassy number) and the organizer has ten seconds of
// patience, not thirty. So the design rule is the opposite of everywhere else in the app:
// zero data entry, zero decisions, just the handful of facts that matter, at maximum size.
// Nothing here is new data — it's a filtered view of documents/notes the organizer already
// chose to pin, which is why it's trustworthy: it can't show something out of date that
// nobody bothered to enter, because there's nothing to enter.
export default function SafeModeCard({ tripId, tripName, onClose }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [data, setData] = useState(null);

  useEffect(() => {
    getSafeModeData(tripId).then(setData);
  }, [tripId]);

  if (!data) return null;

  const nothingPinned = data.documents.length === 0 && data.notes.length === 0;

  return (
    <View style={styles.overlay}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Feather name="shield" size={20} color="#fff" />
          <Text style={styles.headerTitle}>Safe Mode</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="Exit Safe Mode" accessibilityRole="button">
          <Feather name="x" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
      <Text style={styles.tripName}>{tripName}</Text>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>TRAVELERS</Text>
        <View style={styles.travelerWrap}>
          {data.travelers.map((t) => (
            <View key={t.id} style={styles.travelerChip}>
              <IconBadge type="traveler" size={30} tone="danger" />
              <Text style={styles.travelerName}>{t.name}</Text>
            </View>
          ))}
          {data.travelers.length === 0 && <Text style={styles.muted}>No travelers added yet.</Text>}
        </View>

        <Text style={[styles.sectionLabel, { marginTop: 22 }]}>PINNED DOCUMENTS</Text>
        {data.documents.length === 0 ? (
          <Text style={styles.muted}>
            No documents pinned. Go to Documents → open a passport, ID, or insurance file → "Pin to Safe Mode."
          </Text>
        ) : (
          data.documents.map((d) => (
            <TouchableOpacity key={d.id} style={styles.docRow} onPress={() => openDocument(d.uri)}>
              <Feather name="file-text" size={16} color="#fff" />
              <Text style={styles.docName}>{d.name}</Text>
              <Feather name="chevron-right" size={16} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          ))
        )}

        <Text style={[styles.sectionLabel, { marginTop: 22 }]}>PINNED NOTES</Text>
        {data.notes.length === 0 ? (
          <Text style={styles.muted}>
            No notes pinned. Pin an "Embassy contact" or "Insurance policy #" note here so it's one tap away.
          </Text>
        ) : (
          data.notes.map((n) => (
            <View key={n.id} style={styles.noteCard}>
              <Text style={styles.noteText}>{n.text}</Text>
            </View>
          ))
        )}

        {nothingPinned && (
          <Text style={styles.tip}>
            Tip: pin your passport scan, travel insurance, and an emergency contact note before you travel —
            not during an emergency.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (theme) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: theme.danger, position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50, paddingTop: 56, paddingHorizontal: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: theme.weight.semibold, letterSpacing: -0.2 },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  tripName: { color: 'rgba(255,255,255,0.8)', fontSize: 13.5, marginTop: 6 },
  body: { paddingTop: 22, paddingBottom: 60 },
  sectionLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11.5, fontWeight: theme.weight.semibold, letterSpacing: 0.6, marginBottom: 10 },
  travelerWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  travelerChip: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, minWidth: 84 },
  travelerName: { color: '#fff', fontSize: 12.5, fontWeight: '600', marginTop: 6, textAlign: 'center' },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 12, padding: 12, marginBottom: 8 },
  docName: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600' },
  noteCard: { backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 12, padding: 12, marginBottom: 8 },
  noteText: { color: '#fff', fontSize: 14, lineHeight: 20 },
  muted: { color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 19 },
  tip: { color: 'rgba(255,255,255,0.7)', fontSize: 12.5, lineHeight: 18, marginTop: 20, fontStyle: 'italic' },
});
