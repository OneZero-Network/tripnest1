import React, {useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { getDB } from '../db';
import * as QuickActions from 'expo-quick-actions';
import * as SplashScreenNative from 'expo-splash-screen';
import { useTheme } from '../components/UI';

// HOOK: the first 800ms of the app is a promise, not a loading screen. Organizers open
// TripNest mid-chaos (at a counter, in a cab, offline). Showing the brand instantly with
// zero spinner-anxiety ("Your trips. Organized.") sets the emotional tone before a single
// pixel of real data loads — that's the hook for this screen: trust, not features.
//
// ACTIVE TRIP BYPASS: per the V1 access-UX decision, if there's a currently active trip
// (status = 'active'), launch drops the organizer straight into that Trip's Cockpit —
// skipping the trip list entirely — instead of making an emergency start with a tap on
// the right trip card. If there's more than one active trip, most-recently-created wins,
// matching the same rule Home's "Current Trip" card already uses, so the two stay in sync.
export default function SplashScreen({ navigation }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Native splash is still showing at this point (App.js called preventAutoHideAsync).
    // Hiding it now, the instant this component has mounted and is ready to paint, means
    // the handoff from native splash to this animated one has no gap — never a bare white
    // frame in between, which was the actual bug being reported.
    SplashScreenNative.hideAsync().catch(() => {});
    Animated.timing(fade, { toValue: 1, duration: 450, useNativeDriver: true }).start();

    (async () => {
      const minSplash = new Promise((res) => setTimeout(res, 900));
      const findActiveTrip = (async () => {
        const db = await getDB();
        const rows = await db.getAllAsync(
          "SELECT * FROM trips WHERE status = 'active' ORDER BY created_at DESC LIMIT 1"
        );
        return rows[0] || null;
      })();
      const [, activeTrip] = await Promise.all([minSplash, findActiveTrip]);

      // Keep the OS shortcut in sync with whichever trip is actually active — cleared
      // entirely if there's none, so the shortcut never points at a stale/closed trip.
      if (activeTrip) {
        QuickActions.setItems([
          { id: 'safe-mode', title: `🛡️ Safe Mode: ${activeTrip.name}`, params: { tripId: activeTrip.id, tripName: activeTrip.name } },
        ]);
        navigation.replace('Trip', { tripId: activeTrip.id, tripName: activeTrip.name });
      } else {
        QuickActions.setItems([]);
        navigation.replace('Home');
      }
    })();
  }, []);

  return (
    <View style={styles.container}>
      <Animated.View style={{ opacity: fade, alignItems: 'center' }}>
        <View style={styles.logoCircle}>
          <Feather name="flag" size={34} color="#fff" />
        </View>
        <Text style={styles.name}>TripNest</Text>
        <Text style={styles.tagline}>Your trips. Organized.</Text>
      </Animated.View>
    </View>
  );
}

const makeStyles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.brandDeep, alignItems: 'center', justifyContent: 'center' },
  logoCircle: { width: 84, height: 84, borderRadius: 42, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  name: { color: '#fff', fontSize: 28, fontWeight: theme.weight.semibold, letterSpacing: -0.5 },
  tagline: { color: 'rgba(255,255,255,0.75)', fontSize: 13.5, marginTop: 6 },
});
