import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { getDB, logTimelineEvent } from '../db';
import { PrimaryButton, IconBadge, Chip, theme } from '../components/UI';

const COMMON_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'THB'];

// HOOK: this screen's job is momentum, not data entry. The design brief is explicit —
// "only asks Trip Name + Travelers, everything else comes later" — because every extra
// field here is a chance for the organizer to close the app and never come back. Adding
// travelers right after naming the trip is the hook: it turns an abstract trip into a
// concrete group of real people before the organizer has invested any real effort.
export default function CreateTripScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [travelerInput, setTravelerInput] = useState('');
  const [travelers, setTravelers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [baseCurrency, setBaseCurrency] = useState('INR');

  const addTraveler = () => {
    const trimmed = travelerInput.trim();
    if (!trimmed) return;
    if (travelers.some((t) => t.toLowerCase() === trimmed.toLowerCase())) { setTravelerInput(''); return; }
    setTravelers((prev) => [...prev, trimmed]);
    setTravelerInput('');
  };

  const removeTraveler = (t) => setTravelers((prev) => prev.filter((x) => x !== t));

  const createTrip = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    const db = await getDB();
    const id = String(Date.now());
    const ts = Date.now();
    // Wrapped in a transaction: trip creation is really one atomic action (trip + its
    // travelers + the timeline entry), not three independent writes. Without this, killing
    // the app mid-loop (common on memory-constrained Android devices) could leave a trip
    // row with only some of its travelers inserted, with no signal that it happened.
    try {
      await db.withTransactionAsync(async () => {
        await db.runAsync('INSERT INTO trips (id, name, base_currency, created_at) VALUES (?, ?, ?, ?)', id, name.trim(), baseCurrency, ts);
        for (const t of travelers) {
          const tid = String(Date.now()) + Math.random().toString(36).slice(2);
          await db.runAsync('INSERT INTO travelers (id, trip_id, name) VALUES (?, ?, ?)', tid, id, t);
        }
        await logTimelineEvent({ tripId: id, type: 'trip', title: `Trip created: ${name.trim()}`, timestamp: ts, idSuffix: '_created' });
      });
      navigation.replace('Trip', { tripId: id, tripName: name.trim() });
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={[styles.safe, { paddingTop: insets.top + 16 }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="arrow-left" size={22} color={theme.ink} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create a New Trip</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.body}>
        <Text style={styles.label}>Trip Name</Text>
        <TextInput
          style={styles.nameInput}
          placeholder="e.g. Goa Trip"
          placeholderTextColor={theme.inkMute}
          value={name}
          onChangeText={setName}
          autoFocus
        />

        <Text style={[styles.label, { marginTop: theme.space.xl }]}>Currency</Text>
        <View style={styles.currencyRow}>
          {COMMON_CURRENCIES.map((c) => (
            <Chip key={c} label={c} active={baseCurrency === c} onPress={() => setBaseCurrency(c)} />
          ))}
        </View>

        <Text style={[styles.label, { marginTop: theme.space.xl }]}>Add Travelers</Text>
        <View style={styles.travelerRow}>
          <TextInput
            style={styles.travelerInput}
            placeholder="Name"
            placeholderTextColor={theme.inkMute}
            value={travelerInput}
            onChangeText={setTravelerInput}
            onSubmitEditing={addTraveler}
            returnKeyType="done"
          />
          <TouchableOpacity style={styles.addBtn} onPress={addTraveler}>
            <Feather name="plus" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        <FlatList
          data={travelers}
          keyExtractor={(item) => item}
          style={{ marginTop: 12 }}
          renderItem={({ item }) => (
            <View style={styles.travelerChip}>
              <IconBadge type="traveler" size={30} />
              <Text style={styles.travelerName}>{item}</Text>
              <TouchableOpacity onPress={() => removeTraveler(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={16} color={theme.inkMute} />
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.hint}>You can add yourself and others now, or later from the Travelers tab.</Text>}
        />
      </View>

      <View style={styles.footer}>
        <PrimaryButton
          label={saving ? 'Creating…' : 'Create Trip'}
          onPress={createTrip}
          style={{ opacity: name.trim() ? 1 : 0.5 }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 20 },
  headerTitle: { fontSize: 18, fontWeight: theme.weight.semibold, color: theme.ink },
  body: { flex: 1, paddingHorizontal: 20 },
  label: { fontSize: 13, fontWeight: theme.weight.semibold, color: theme.inkMute, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 },
  nameInput: { backgroundColor: theme.surface, borderRadius: theme.radius.md, paddingHorizontal: 16, paddingVertical: 14, fontSize: 17, fontWeight: theme.weight.semibold, color: theme.ink, borderWidth: 1, borderColor: theme.line },
  currencyRow: { flexDirection: 'row', flexWrap: 'wrap' },
  travelerRow: { flexDirection: 'row', gap: 8 },
  travelerInput: { flex: 1, backgroundColor: theme.surface, borderRadius: theme.radius.sm, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: theme.line, color: theme.ink },
  addBtn: { backgroundColor: theme.brandDeep, width: 46, height: 46, borderRadius: theme.radius.sm, alignItems: 'center', justifyContent: 'center' },
  travelerChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, padding: 10, borderRadius: theme.radius.md, marginBottom: 8, borderWidth: 1, borderColor: theme.line, gap: 10 },
  travelerName: { flex: 1, fontSize: 15, fontWeight: theme.weight.semibold, color: theme.ink },
  hint: { fontSize: 13, color: theme.inkMute, lineHeight: 19, marginTop: 4 },
  footer: { padding: 20 },
});
