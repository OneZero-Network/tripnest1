import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, PanResponder, LayoutAnimation, Platform, UIManager, TextInput, BackHandler } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
// See HomeScreen.js for why this comes from safe-area-context, not react-native core.
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { getDB, computeTripData, getDrafts, renameTrip, deleteTrip } from '../db';
import CockpitCard from '../components/CockpitCard';
import TravelersTab from '../components/TravelersTab';
import TimelineTab from '../components/TimelineTab';
import FinanceTab from '../components/FinanceTab';
import SettlementTab from '../components/SettlementTab';
import OverviewTab from '../components/OverviewTab';
import ExpensesTab from '../components/ExpensesTab';
import UniversalCapture from '../components/UniversalCapture';
import ActivityItemSheet from '../components/ActivityItemSheet';
import SafeModeCard from '../components/SafeModeCard';
import { ErrorState, Container, BottomSheet, PrimaryButton, SecondaryButton, ConfirmDialog, useTheme } from '../components/UI';

// Five areas, each answering exactly one question — per the "think in questions, not
// screens" review: Overview ("how's the trip going"), Members ("how's each traveler
// doing"), Expenses ("what was spent"), Activity ("what happened"), Settle ("what should
// we do now"). Advanced deliberately isn't here anymore — it's still real and still
// reachable (a link from Settle), just not a tab everyone has to scroll past to get to
// the four things they actually came here for.
const TABS = [
  { key: 'Overview', icon: 'home' },
  { key: 'Members', icon: 'users' },
  { key: 'Expenses', icon: 'dollar-sign' },
  { key: 'Activity', icon: 'activity' },
  { key: 'Settle', icon: 'check-circle' },
];
const EMPTY_FINANCE = { contributions: [], totalReceived: 0, totalSpent: 0, bankSpent: 0, personalSpent: 0, currentCash: 0, perPerson: null, fundTarget: null, travelerCount: 0, custodian: null, hasTripBank: true, baseCurrency: 'INR', tripType: 'domestic', foreignCurrency: null, foreignWallet: null, liveForecast: { balances: {}, transactions: [] }, finalSettlement: null, bankSettlement: { balances: {}, transactions: [], sharedSpendByPerson: {} }, finalBankSettlement: null, tripStatus: 'active' };

// TripScreen is an orchestrator: it owns the trip-wide data fetch and tab selection,
// then hands each tab its slice of data plus a single onChanged() refresh callback.
// The header is fully custom (native header disabled) specifically to fix a real bug:
// the trip name was being rendered twice — once by the native stack header, once here.
export default function TripScreen({ route, navigation }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { tripId, tripName, openSafeMode } = route.params;
  const [currentTripName, setCurrentTripName] = useState(tripName);
  const [renamingTrip, setRenamingTrip] = useState(false);
  const [tripNameDraft, setTripNameDraft] = useState(tripName);
  const [pendingDeleteTrip, setPendingDeleteTrip] = useState(false);
  const [deletingTrip, setDeletingTrip] = useState(false);
  const [tab, setTab] = useState('Overview');

  // A subtle cross-fade/resize when switching tabs — cheap (one built-in RN API call,
  // no new dependency) and exactly the "small transitions when switching tabs" this
  // review asked for. Android needs this experimental flag explicitly enabled; iOS and
  // the New Architecture support it without one, so the guard is harmless there.
  if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
  // The real bug behind "tab indicator doesn't follow swipe": the state was always
  // updating correctly on swipe, but the horizontal tab-bar scroller never scrolled to
  // bring the newly-active tab into view — so on a trip with enough tabs to need
  // scrolling, swiping to "Settle" could leave it selected but still off-screen, making
  // it look like nothing happened. This ref + effect keeps the bar in sync with `tab`
  // regardless of whether it changed via tap or swipe.
  const tabsScrollRef = useRef(null);
  const tabLayouts = useRef({});
  useEffect(() => {
    const layout = tabLayouts.current[tab];
    if (layout && tabsScrollRef.current) {
      const targetX = Math.max(0, layout.x - 24);
      tabsScrollRef.current.scrollTo({ x: targetX, animated: true });
    }
  }, [tab]);

  const changeTab = (key) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setTab(key);
  };
  const [selectedActivityEvent, setSelectedActivityEvent] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Swipe left/right between tabs. Deliberately conservative about claiming the gesture —
  // only takes over once horizontal movement clearly dominates vertical (2:1 ratio, 20px
  // minimum) so it never fights the vertical ScrollView underneath it for a normal scroll.
  const swipeTab = (direction) => {
    const idx = TABS.findIndex((t) => t.key === tab);
    const nextIdx = idx + direction;
    if (nextIdx >= 0 && nextIdx < TABS.length) changeTab(TABS[nextIdx].key);
  };
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 20 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2,
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx < -40) swipeTab(1);
          else if (gesture.dx > 40) swipeTab(-1);
        },
      }),
    [tab]
  );
  const latestRequestRef = useRef(tripId); // tracks the most recently STARTED loadAll() call, for the stale-response guard below
  const [travelers, setTravelers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [finance, setFinance] = useState(EMPTY_FINANCE);
  const [today, setToday] = useState(null);
  const [safeMode, setSafeMode] = useState(!!openSafeMode);
  const [draftCount, setDraftCount] = useState(0);
  const [loadError, setLoadError] = useState(null);

  const loadAll = async () => {
    // Guards against the actual root cause behind "Add Expense shows a different trip's
    // members": an out-of-order async response, not stale UI state. Switching trips
    // quickly (e.g. Dubai → Goa) can leave two loadAll() calls in flight at once — one
    // for Dubai, one for Goa. Nothing previously stopped the Dubai response, if it
    // happened to resolve SECOND, from overwriting the correct Goa data that had already
    // rendered. latestRequestRef persists across renders (unlike a local variable, which
    // would just compare a closure to itself and never catch anything) — each call
    // records itself as "the latest request" when it STARTS, and before writing any
    // state checks whether a newer call has started since. If so, this response is
    // stale and gets discarded instead of clobbering the right trip's data — this is
    // what actually let a traveler who was never a member of Goa (Tariq) show up in that
    // trip's Add Expense sheet.
    const requestedTripId = tripId;
    latestRequestRef.current = requestedTripId;
    try {
      const db = await getDB();
      // Expenses is back as its own fetch — the Expenses tab returned per this review's
      // 5-area structure, as a dedicated "what was spent" browsing lens distinct from
      // Activity's broader feed. Still 4 independent reads run concurrently, same reasoning
      // as before: no read here depends on another's result.
      const [travelersRows, timelineRows, expensesRows, tripData, drafts] = await Promise.all([
        db.getAllAsync('SELECT * FROM travelers WHERE trip_id = ?', requestedTripId),
        db.getAllAsync('SELECT * FROM timeline WHERE trip_id = ? ORDER BY created_at DESC', requestedTripId),
        db.getAllAsync('SELECT * FROM expenses WHERE trip_id = ? ORDER BY created_at DESC', requestedTripId),
        computeTripData(requestedTripId),
        getDrafts(requestedTripId),
      ]);
      if (latestRequestRef.current !== requestedTripId) return; // a newer load has started since — drop this stale one
      setTravelers(travelersRows);
      setTimeline(timelineRows);
      setExpenses(expensesRows);
      setFinance(tripData.finance);
      setToday(tripData.today);
      setDraftCount(drafts.length);
      setLoadError(null);
    } catch (err) {
      if (latestRequestRef.current !== requestedTripId) return;
      // A failure here used to mean a silently blank screen — the tabs would just never
      // populate, with nothing telling the organizer why. Now it's an explicit state with
      // a retry, distinct from "this trip genuinely has no expenses yet."
      setLoadError(err?.message || 'Could not load this trip.');
    }
  };

  useFocusEffect(useCallback(() => { loadAll(); }, [tripId]));

  const saveTripName = async () => {
    const trimmed = tripNameDraft.trim();
    if (!trimmed || trimmed === currentTripName) { setRenamingTrip(false); return; }
    await renameTrip(tripId, trimmed);
    setCurrentTripName(trimmed);
    navigation.setParams({ tripName: trimmed });
    setRenamingTrip(false);
    loadAll();
  };

  // Deleting a trip is permanent — no undo, no reopen path (that's what Close/Reopen is
  // for). Requires an explicit destructive confirmation first (see the ConfirmDialog
  // below), same pattern as every other irreversible action in this app.
  const confirmDeleteTrip = async () => {
    setDeletingTrip(true);
    const result = await deleteTrip(tripId);
    setDeletingTrip(false);
    setPendingDeleteTrip(false);
    if (result.ok) {
      setRenamingTrip(false);
      navigation.canGoBack() ? navigation.navigate('Home', { homeTab: 'overview' }) : navigation.replace('Home', { homeTab: 'overview' });
    }
  };

  // Handles the case where the app is already open on this trip and the shortcut fires
  // again — navigate() updates route.params without remounting, so the initial useState
  // above wouldn't catch it on its own.
  useEffect(() => {
    if (openSafeMode) setSafeMode(true);
  }, [openSafeMode]);

  // The on-screen back arrow already has a fallback for "nothing to go back to"
  // (navigation.replace('Home')) — but Android's hardware/gesture back button doesn't go
  // through that code at all, it's handled by React Navigation's default stack behavior,
  // which lets the press fall through to the OS (exiting the app) when there's nothing
  // left to pop. That's exactly what happens whenever this trip is the root of the
  // stack — which it genuinely is on a fresh launch straight into an active trip
  // (SplashScreen uses navigation.replace('Trip', ...), not push, specifically so
  // there's no Home screen sitting uselessly behind it — so canGoBack() here is
  // correctly false, and without this listener the very first hardware back press would
  // exit the app instead of surfacing Home.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (navigation.canGoBack()) return false; // let the default stack behavior handle it
      navigation.replace('Home', { homeTab: 'overview' });
      return true; // we handled it — don't let it fall through to exiting the app
    });
    return () => sub.remove();
  }, [navigation]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => (navigation.canGoBack() ? navigation.navigate('Home', { homeTab: 'overview' }) : navigation.replace('Home', { homeTab: 'overview' }))}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.backBtn}
            accessibilityLabel="Back"
            accessibilityRole="button"
          >
            <Feather name="arrow-left" size={22} color={theme.ink} />
          </TouchableOpacity>
          <TouchableOpacity
            style={{ flex: 1 }}
            onPress={() => { setTripNameDraft(currentTripName); setRenamingTrip(true); }}
            hitSlop={{ top: 8, bottom: 8 }}
            accessibilityLabel="Rename trip"
            accessibilityRole="button"
          >
            <Text style={styles.title} numberOfLines={1}>{currentTripName}</Text>
          </TouchableOpacity>
          <View style={styles.headerActions}>
            {timeline.length >= 10 && (
              <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Search', { tripId })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Search this trip" accessibilityRole="button">
                <Feather name="search" size={18} color={theme.inkSoft} />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Drafts', { tripId })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Drafts" accessibilityRole="button">
              <Feather name="inbox" size={18} color={theme.inkSoft} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Share', { tripId, tripName: currentTripName })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Share trip" accessibilityRole="button">
              <Feather name="share-2" size={18} color={theme.inkSoft} />
            </TouchableOpacity>
            {/* Safe Mode is the one icon that keeps color — it's the one place color is
                carrying real meaning (emergency), not decoration. */}
            <TouchableOpacity style={styles.iconBtn} onPress={() => setSafeMode(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Open Safe Mode" accessibilityRole="button">
              <Feather name="shield" size={18} color={theme.danger} />
            </TouchableOpacity>
            {/* Rename/Delete were previously only reachable by tapping the plain trip
                title text — no visible affordance at all, which is exactly why it read
                as "no delete option exists." This icon is the discoverable entry point;
                it opens the same rename sheet (with Delete under Danger Zone) as tapping
                the title still does. */}
            <TouchableOpacity style={styles.iconBtn} onPress={() => { setTripNameDraft(currentTripName); setRenamingTrip(true); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Trip settings" accessibilityRole="button">
              <Feather name="more-vertical" size={18} color={theme.inkSoft} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.tabsRow}>
          <ScrollView
            ref={tabsScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingEnd: 16 }}
          >
            {TABS.map((t) => (
              <TouchableOpacity
                key={t.key}
                onPress={() => changeTab(t.key)}
                onLayout={(e) => { tabLayouts.current[t.key] = e.nativeEvent.layout; }}
                style={[styles.tab, tab === t.key && styles.tabActive]}
              >
                <Feather name={t.icon} size={14} color={tab === t.key ? theme.ink : theme.inkMute} style={{ marginEnd: 6 }} />
                <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.key}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {/* A real discoverability bug this fixes: "Settle" was scrolled off-screen with
              zero visual hint that more tabs existed past "Activity" — showsHorizontalScroll
              Indicator={false} means the OS scrollbar hint is off too, so there was
              genuinely nothing telling a first-time user to swipe. This fade doesn't block
              taps (pointerEvents="none") — it's purely the "there's more this way" cue. */}
          <LinearGradient
            colors={[`${theme.bg}00`, theme.bg]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.tabsFadeEdge}
            pointerEvents="none"
          />
        </View>

        <View style={{ flex: 1 }} {...panResponder.panHandlers}>
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

                {tab === 'Members' && <TravelersTab tripId={tripId} travelers={travelers} expenses={expenses} finance={finance} onChanged={loadAll} />}
                {tab === 'Expenses' && <ExpensesTab tripId={tripId} expenses={expenses} baseCurrency={finance.baseCurrency} onOpenItem={setSelectedActivityEvent} />}
                {tab === 'Activity' && <TimelineTab timeline={timeline} baseCurrency={finance.baseCurrency} onOpenItem={setSelectedActivityEvent} />}
                {tab === 'Overview' && <OverviewTab finance={finance} timeline={timeline} today={today} expenses={expenses} tripName={currentTripName} navigation={navigation} onOpenSettlement={() => changeTab('Settle')} onOpenExpenses={() => changeTab('Expenses')} />}
                {tab === 'Settle' && <SettlementTab tripId={tripId} tripName={currentTripName} finance={finance} navigation={navigation} onOpenAdvanced={() => setShowAdvanced(true)} onChanged={loadAll} />}
              </>
            )}
          </Container>
        </ScrollView>
        </View>

        <UniversalCapture tripId={tripId} navigation={navigation} travelers={travelers} baseCurrency={finance.baseCurrency} hasTripBank={finance.hasTripBank} tripType={finance.tripType} foreignCurrency={finance.foreignCurrency} onChanged={loadAll} />
      </View>
      {safeMode && <SafeModeCard tripId={tripId} tripName={currentTripName} onClose={() => setSafeMode(false)} />}
      {showAdvanced && (
        <View style={styles.advancedOverlay}>
          <View style={styles.advancedHeaderRow}>
            <TouchableOpacity onPress={() => setShowAdvanced(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Feather name="arrow-left" size={22} color={theme.ink} />
            </TouchableOpacity>
            <Text style={styles.advancedTitle}>Advanced</Text>
            <View style={{ width: 22 }} />
          </View>
          <View style={{ flex: 1, paddingHorizontal: theme.space.lg }}>
            <FinanceTab tripId={tripId} finance={finance} onChanged={loadAll} />
          </View>
        </View>
      )}
      <ActivityItemSheet
        tripId={tripId}
        event={selectedActivityEvent}
        baseCurrency={finance.baseCurrency}
        travelers={travelers}
        hasTripBank={finance.hasTripBank}
        onClose={() => setSelectedActivityEvent(null)}
        onChanged={loadAll}
      />

      <BottomSheet visible={renamingTrip} onClose={() => setRenamingTrip(false)}>
        <Text style={styles.renameTitle}>Rename trip</Text>
        <TextInput
          style={styles.renameInput}
          value={tripNameDraft}
          onChangeText={setTripNameDraft}
          autoFocus
          placeholder="Trip name"
          placeholderTextColor={theme.inkMute}
        />
        <PrimaryButton label="Save" onPress={saveTripName} style={{ marginTop: theme.space.sm }} />

        <View style={styles.dangerZoneDivider} />
        <Text style={styles.dangerZoneLabel}>Danger zone</Text>
        <SecondaryButton
          label="Delete trip"
          icon="trash-2"
          onPress={() => setPendingDeleteTrip(true)}
          style={styles.deleteTripButton}
        />
      </BottomSheet>

      <ConfirmDialog
        visible={pendingDeleteTrip}
        title={`Delete "${currentTripName}"?`}
        message="This permanently removes the trip and everything in it — expenses, contributions, exchanges, settlements, notes, documents, and activity history. This cannot be undone."
        confirmLabel={deletingTrip ? 'Deleting…' : 'Delete trip'}
        destructive
        onConfirm={confirmDeleteTrip}
        onCancel={() => setPendingDeleteTrip(false)}
      />
    </SafeAreaView>
  );
}

const makeStyles = (theme) => StyleSheet.create({
  renameTitle: { fontSize: theme.type.heading, fontWeight: theme.weight.semibold, color: theme.ink, marginBottom: theme.space.sm },
  renameInput: { backgroundColor: theme.bg, borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.line, paddingHorizontal: 14, minHeight: theme.a11y.minTouchTarget, color: theme.ink, fontSize: 16 },
  dangerZoneDivider: { height: 1, backgroundColor: theme.line, marginTop: theme.space.lg, marginBottom: theme.space.md },
  dangerZoneLabel: { fontSize: theme.type.label, fontWeight: theme.weight.semibold, color: theme.inkMute, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: theme.space.xs },
  deleteTripButton: { borderColor: theme.danger },
  advancedOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: theme.bg, zIndex: 40, paddingTop: 56 },
  advancedHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: theme.space.lg, marginBottom: theme.space.md },
  advancedTitle: { fontSize: theme.type.heading, fontWeight: theme.weight.semibold, color: theme.ink },
  safe: { flex: 1, backgroundColor: theme.bg },
  container: { flex: 1, backgroundColor: theme.bg, paddingHorizontal: theme.space.lg, paddingTop: theme.space.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: theme.space.md, gap: theme.space.md },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: theme.type.heading, fontWeight: theme.weight.semibold, color: theme.ink, letterSpacing: -0.3 },
  headerActions: { flexDirection: 'row', gap: theme.space.md },
  iconBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  tabsRow: { marginBottom: theme.space.md, borderBottomWidth: 1, borderBottomColor: theme.line, position: 'relative' },
  tabsFadeEdge: { position: 'absolute', top: 0, bottom: 0, end: 0, width: 28 },
  tab: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4, marginEnd: theme.space.lg, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: theme.brand },
  tabText: { color: theme.inkMute, fontWeight: theme.weight.medium, fontSize: theme.type.label },
  tabTextActive: { color: theme.ink, fontWeight: theme.weight.semibold },
  scrollContent: { paddingBottom: 100 },
});
