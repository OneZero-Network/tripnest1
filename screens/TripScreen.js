import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
// See HomeScreen.js for why this comes from safe-area-context, not react-native core.
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { getDB, computeTripData, getDrafts } from '../db';
import CockpitCard from '../components/CockpitCard';
import TravelersTab from '../components/TravelersTab';
import ExpensesTab from '../components/ExpensesTab';
import NotesTab from '../components/NotesTab';
import DocumentsTab from '../components/DocumentsTab';
import TimelineTab from '../components/TimelineTab';
import FinanceTab from '../components/FinanceTab';
import UniversalCapture from '../components/UniversalCapture';
import SafeModeCard from '../components/SafeModeCard';
import { ErrorState, Container, useTheme } from '../components/UI';

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
const EMPTY_FINANCE = { contributions: [], totalReceived: 0, totalSpent: 0, currentCash: 0, perPerson: null, fundTarget: null, travelerCount: 0, custodian: null, baseCurrency: 'INR', liveForecast: { balances: {}, transactions: [] }, finalSettlement: null, tripStatus: 'active' };

// TripScreen is an orchestrator: it owns the trip-wide data fetch and tab selection,
// then hands each tab its slice of data plus a single onChanged() refresh callback.
// The header is fully custom (native header disabled) specifically to fix a real bug:
// the trip name was being rendered twice — once by the native stack header, once here.
export default function TripScreen({ route, navigation }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { tripId, tripName, openSafeMode } = route.params;
  const [tab, setTab] = useState('Expenses');
  const [travelers, setTravelers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [notes, setNotes] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [finance, setFinance] = useState(EMPTY_FINANCE);
  const [today, setToday] = useState(null);
  const [safeMode, setSafeMode] = useState(!!openSafeMode);
  const [draftCount, setDraftCount] = useState(0);
  const [loadError, setLoadError] = useState(null);

  const loadAll = async () => {
    try {
      const db = await getDB();
      // These 7 reads are all independent — none depends on another's result — so they
      // were serialized for no reason. Running them concurrently cuts wall-clock load time
      // by avoiding paying the JS-bridge round-trip cost 7 times in sequence.
      const [travelersRows, expensesRows, notesRows, documentsRows, timelineRows, tripData, drafts] = await Promise.all([
        db.getAllAsync('SELECT * FROM travelers WHERE trip_id = ?', tripId),
        db.getAllAsync('SELECT * FROM expenses WHERE trip_id = ? ORDER BY created_at DESC', tripId),
        db.getAllAsync('SELECT * FROM notes WHERE trip_id = ? ORDER BY created_at DESC', tripId),
        db.getAllAsync('SELECT * FROM documents WHERE trip_id = ? ORDER BY created_at DESC', tripId),
        db.getAllAsync('SELECT * FROM timeline WHERE trip_id = ? ORDER BY created_at DESC', tripId),
        computeTripData(tripId),
        getDrafts(tripId),
      ]);
      setTravelers(travelersRows);
      setExpenses(expensesRows);
      setNotes(notesRows);
      setDocuments(documentsRows);
      setTimeline(timelineRows);
      setFinance(tripData.finance);
      setToday(tripData.today);
      setDraftCount(drafts.length);
      setLoadError(null);
    } catch (err) {
      // A failure here used to mean a silently blank screen — the tabs would just never
      // populate, with nothing telling the organizer why. Now it's an explicit state with
      // a retry, distinct from "this trip genuinely has no expenses yet."
      setLoadError(err?.message || 'Could not load this trip.');
    }
  };

  useFocusEffect(useCallback(() => { loadAll(); }, [tripId]));

  // Handles the case where the app is already open on this trip and the shortcut fires
  // again — navigate() updates route.params without remounting, so the initial useState
  // above wouldn't catch it on its own.
  useEffect(() => {
    if (openSafeMode) setSafeMode(true);
  }, [openSafeMode]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.replace('Home'))}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.backBtn}
            accessibilityLabel="Back"
            accessibilityRole="button"
          >
            <Feather name="arrow-left" size={22} color={theme.ink} />
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>{tripName}</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Search', { tripId })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Search this trip" accessibilityRole="button">
              <Feather name="search" size={18} color={theme.inkSoft} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Drafts', { tripId })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Drafts" accessibilityRole="button">
              <Feather name="inbox" size={18} color={theme.inkSoft} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Share', { tripId, tripName })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Share trip" accessibilityRole="button">
              <Feather name="share-2" size={18} color={theme.inkSoft} />
            </TouchableOpacity>
            {/* Safe Mode is the one icon that keeps color — it's the one place color is
                carrying real meaning (emergency), not decoration. */}
            <TouchableOpacity style={styles.iconBtn} onPress={() => setSafeMode(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Open Safe Mode" accessibilityRole="button">
              <Feather name="shield" size={18} color={theme.danger} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.tabsRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingEnd: 16 }}>
            {TABS.map((t) => (
              <TouchableOpacity key={t.key} onPress={() => setTab(t.key)} style={[styles.tab, tab === t.key && styles.tabActive]}>
                <Feather name={t.icon} size={14} color={tab === t.key ? theme.ink : theme.inkMute} style={{ marginEnd: 6 }} />
                <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.key}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Container>
            {loadError ? (
              <ErrorState
                title="Couldn't load this trip"
                hint={loadError}
                onRetry={loadAll}
              />
            ) : (
              <>
                <CockpitCard tripId={tripId} today={today} cashLeft={finance.currentCash} tripStatus={finance.tripStatus} pendingDraftsCount={draftCount} baseCurrency={finance.baseCurrency} onChanged={loadAll} />

                {tab === 'Travelers' && <TravelersTab tripId={tripId} travelers={travelers} onChanged={loadAll} />}
                {tab === 'Expenses' && <ExpensesTab tripId={tripId} expenses={expenses} travelers={travelers} baseCurrency={finance.baseCurrency} onChanged={loadAll} />}
                {tab === 'Notes' && <NotesTab tripId={tripId} notes={notes} onChanged={loadAll} />}
                {tab === 'Documents' && <DocumentsTab tripId={tripId} documents={documents} onChanged={loadAll} />}
                {tab === 'Timeline' && <TimelineTab timeline={timeline} />}
                {tab === 'Finance' && <FinanceTab tripId={tripId} finance={finance} onChanged={loadAll} />}
              </>
            )}
          </Container>
        </ScrollView>

        <UniversalCapture tripId={tripId} navigation={navigation} onChanged={loadAll} />
      </View>
      {safeMode && <SafeModeCard tripId={tripId} tripName={tripName} onClose={() => setSafeMode(false)} />}
    </SafeAreaView>
  );
}

const makeStyles = (theme) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  container: { flex: 1, backgroundColor: theme.bg, paddingHorizontal: theme.space.lg, paddingTop: theme.space.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: theme.space.md, gap: theme.space.md },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: theme.type.heading, fontWeight: theme.weight.semibold, color: theme.ink, letterSpacing: -0.3 },
  headerActions: { flexDirection: 'row', gap: theme.space.md },
  iconBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  tabsRow: { marginBottom: theme.space.md, borderBottomWidth: 1, borderBottomColor: theme.line },
  tab: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4, marginEnd: theme.space.lg, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: theme.brand },
  tabText: { color: theme.inkMute, fontWeight: theme.weight.medium, fontSize: theme.type.label },
  tabTextActive: { color: theme.ink, fontWeight: theme.weight.semibold },
  scrollContent: { paddingBottom: 100 },
});
