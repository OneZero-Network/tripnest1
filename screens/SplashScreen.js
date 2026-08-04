import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { theme } from '../components/UI';

// HOOK: the first 800ms of the app is a promise, not a loading screen. Organizers open
// TripNest mid-chaos (at a counter, in a cab, offline). Showing the brand instantly with
// zero spinner-anxiety ("Your trips. Organized.") sets the emotional tone before a single
// pixel of real data loads — that's the hook for this screen: trust, not features.
export default function SplashScreen({ navigation }) {
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 450, useNativeDriver: true }).start();
    const t = setTimeout(() => navigation.replace('Home'), 900);
    return () => clearTimeout(t);
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.brandDeep, alignItems: 'center', justifyContent: 'center' },
  logoCircle: { width: 84, height: 84, borderRadius: 42, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  name: { color: '#fff', fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },
  tagline: { color: 'rgba(255,255,255,0.75)', fontSize: 13.5, marginTop: 6 },
});
