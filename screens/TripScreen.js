import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, SafeAreaView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
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

// Each tab paired with its own icon — consistent Feather icon language, and the icon
// gives the tab a second, faster-to-scan identity beyond just its label text.
const TABS = [
  { key: 'Travelers', icon: 'users' },
  { key: 'Expenses', icon: 'dollar-sign' },
  { key: 'Notes', icon: 'file-text' },
  { key: 'Documents', icon: 'paperclip' },
  { key: 'Timeline', icon: 'clock' },
  { key: 'Finance', icon: 'pie-chart' },
];
const EMPTY_FINANCE = { contributions: [], totalReceived: 0, totalSpent: 0, currentCash: 0, perPerson: null, fundTarget: null, travelerCount: 0, liveForecast: { balances: {}, transactions: [] }, finalSettlement: null, tripStatus: 'active' };

// TripScreen is an orchestrator: it owns the trip-wide data fetch and tab selection,
// then hands each tab its slice of data plus a single onChanged() refresh callback.
// The header is fully custom (native header disabled) specifically to fix a real bug:
// the trip name was being rendered twice — once by the native stack header, once here.
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
    const { finance, today } = await computeTripData(tripId);
    setFinance(finance);
    setToday(today);
  };

  useFocusEffect(useCallback(() => { loadAll(); }, [tripId]));

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Feather name="arrow-left" size={22} color={theme.ink} />
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>{tripName}</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Search', { tripId })}>
              <Feather name="search" size={17} color={theme.brandDeep} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Drafts', { tripId })}>
              <Feather name="inbox" size={17} color={theme.brandDeep} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Share', { tripId, tripName })}>
              <Feather name="share-2" size={17} color={theme.brandDeep} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsRow} contentContainerStyle={{ paddingRight: 16 }}>
          {TABS.map((t) => (
            <TouchableOpacity key={t.key} onPress={() => setTab(t.key)} style={[styles.tab, tab === t.key && styles.tabActive]}>
              <Feather name={t.icon} size={14} color={tab === t.key ? '#fff' : theme.inkSoft} style={{ marginRight: 6 }} />
              <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.key}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <CockpitCard tripId={tripId} today={today} cashLeft={finance.currentCash} onChanged={loadAll} />

          {tab === 'Travelers' && <TravelersTab tripId={tripId} travelers={travelers} onChanged={loadAll} />}
          {tab === 'Expenses' && <ExpensesTab tripId={tripId} expenses={expenses} onChanged={loadAll} />}
          {tab === 'Notes' && <NotesTab tripId={tripId} notes={notes} onChanged={loadAll} />}
          {tab === 'Documents' && <DocumentsTab tripId={tripId} documents={documents} onChanged={loadAll} />}
          {tab === 'Timeline' && <TimelineTab timeline={timeline} />}
          {tab === 'Finance' && <FinanceTab tripId={tripId} finance={finance} onChanged={loadAll} />}
        </ScrollView>

        <UniversalCapture tripId={tripId} navigation={navigation} onChanged={loadAll} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  container: { flex: 1, backgroundColor: theme.bg, paddingHorizontal: 16, paddingTop: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 12 },
  title: { flex: 1, fontSize: 19, fontWeight: '700', color: theme.ink, letterSpacing: -0.3 },
  headerActions: { flexDirection: 'row', gap: 8 },
  iconBtn: { backgroundColor: theme.brandWash, width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  tabsRow: { flexGrow: 0, marginBottom: 14 },
  tab: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: theme.line, marginRight: 8 },
  tabActive: { backgroundColor: theme.brandDeep, borderColor: theme.brandDeep },
  tabText: { color: theme.inkSoft, fontWeight: '600', fontSize: 13 },
  tabTextActive: { color: '#fff' },
  scrollContent: { paddingBottom: 100 },
});
