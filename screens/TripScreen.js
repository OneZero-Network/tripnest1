import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getDB, computeTripData } from '../db';
import CockpitCard from '../components/CockpitCard';
import TravelersTab from '../components/TravelersTab';
import ExpensesTab from '../components/ExpensesTab';
import NotesTab from '../components/NotesTab';
import DocumentsTab from '../components/DocumentsTab';
import TimelineTab from '../components/TimelineTab';
import FinanceTab from '../components/FinanceTab';
import UniversalCapture from '../components/UniversalCapture';
import { theme } from '../components/UI';

const TABS = ['Travelers', 'Expenses', 'Notes', 'Documents', 'Timeline', 'Finance'];
const EMPTY_FINANCE = { contributions: [], totalReceived: 0, totalSpent: 0, currentCash: 0, perPerson: null, fundTarget: null, travelerCount: 0, liveForecast: { balances: {}, transactions: [] }, finalSettlement: null, tripStatus: 'active' };

// TripScreen is an orchestrator: it owns the trip-wide data fetch and tab selection,
// then hands each tab its slice of data plus a single onChanged() refresh callback.
// Per-tab form state (inputs, editing state) now lives inside each tab component.
export default function TripScreen({ route, navigation }) {
  const { tripId, tripName } = route.params;
  const [tab, setTab] = useState('Expenses');
  const [travelers, setTravelers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [notes, setNotes] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [finance, setFinance] = useState(EMPTY_FINANCE);
  const [today, setToday] = useState(null);

  const loadAll = async () => {
    const db = await getDB();
    setTravelers(await db.getAllAsync('SELECT * FROM travelers WHERE trip_id = ?', tripId));
    setExpenses(await db.getAllAsync('SELECT * FROM expenses WHERE trip_id = ? ORDER BY created_at DESC', tripId));
    setNotes(await db.getAllAsync('SELECT * FROM notes WHERE trip_id = ? ORDER BY created_at DESC', tripId));
    setDocuments(await db.getAllAsync('SELECT * FROM documents WHERE trip_id = ? ORDER BY created_at DESC', tripId));
    setTimeline(await db.getAllAsync('SELECT * FROM timeline WHERE trip_id = ? ORDER BY created_at DESC', tripId));
    // Settlement computed exactly once here, shared into both Finance and Today —
    // fixes the duplicate computation flagged in the engineering review.
    const { finance, today } = await computeTripData(tripId);
    setFinance(finance);
    setToday(today);
  };

  useFocusEffect(useCallback(() => { loadAll(); }, [tripId]));

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{tripName}</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Search', { tripId })}>
            <Text style={styles.iconBtnText}>🔍</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Drafts', { tripId })}>
            <Text style={styles.iconBtnText}>📥</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.shareBtn} onPress={() => navigation.navigate('Share', { tripId, tripName })}>
            <Text style={styles.shareBtnText}>Share / Export</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsRow}>
        {TABS.map((t) => (
          <TouchableOpacity key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabActive]}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <CockpitCard tripId={tripId} today={today} cashLeft={finance.currentCash} onChanged={loadAll} />

      {tab === 'Travelers' && <TravelersTab tripId={tripId} travelers={travelers} onChanged={loadAll} />}
      {tab === 'Expenses' && <ExpensesTab tripId={tripId} expenses={expenses} onChanged={loadAll} />}
      {tab === 'Notes' && <NotesTab tripId={tripId} notes={notes} onChanged={loadAll} />}
      {tab === 'Documents' && <DocumentsTab tripId={tripId} documents={documents} onChanged={loadAll} />}
      {tab === 'Timeline' && <TimelineTab timeline={timeline} />}
      {tab === 'Finance' && <FinanceTab tripId={tripId} finance={finance} onChanged={loadAll} />}

      <UniversalCapture tripId={tripId} navigation={navigation} onChanged={loadAll} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg, padding: 16, paddingTop: 60 },
  title: { fontSize: 22, fontWeight: '700', color: theme.primary },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { backgroundColor: theme.primaryLight, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  iconBtnText: { fontSize: 14 },
  shareBtn: { backgroundColor: theme.primaryLight, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16 },
  shareBtnText: { color: theme.primary, fontWeight: '600', fontSize: 12 },
  tabsRow: { flexGrow: 0, marginBottom: 12 },
  tab: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20, backgroundColor: theme.primaryLight, marginRight: 8 },
  tabActive: { backgroundColor: theme.primary },
  tabText: { color: theme.primary, fontWeight: '600' },
  tabTextActive: { color: '#fff' },
});
