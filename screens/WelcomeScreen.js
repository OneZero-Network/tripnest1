import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { setAppMeta } from '../db';
import { PrimaryButton, useTheme } from '../components/UI';

const BULLETS = ['Track expenses', 'Split automatically', 'Settle instantly', 'Works offline'];

// Shown exactly once, ever — SplashScreen checks the app_meta 'onboarded' flag and routes
// here only the first time. This is the one screen in the app that's allowed to be
// persuasive rather than purely functional; every screen after this one goes back to
// "calm, get out of the way."
export default function WelcomeScreen({ navigation }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(theme);

  const getStarted = async () => {
    await setAppMeta('onboarded', '1');
    navigation.replace('Home');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.logoRow}>
        <View style={styles.logoBadge}>
          <Feather name="briefcase" size={22} color="#fff" />
        </View>
        <Text style={styles.logoText}>TripNest</Text>
      </View>

      <Text style={styles.tagline}>Your trip. Organized.{'\n'}Money. Simplified.</Text>

      <View style={styles.bullets}>
        {BULLETS.map((b) => (
          <View key={b} style={styles.bulletRow}>
            <View style={styles.bulletIcon}>
              <Feather name="check" size={13} color={theme.brand} />
            </View>
            <Text style={styles.bulletText}>{b}</Text>
          </View>
        ))}
      </View>

      <View style={{ flex: 1 }} />

      <View style={styles.privacyCard}>
        <Feather name="shield" size={20} color={theme.brand} />
        <View style={{ flex: 1, marginStart: 12 }}>
          <Text style={styles.privacyTitle}>100% Private & Offline</Text>
          <Text style={styles.privacySub}>Your data stays on your device</Text>
        </View>
      </View>

      <PrimaryButton label="Get Started" onPress={getStarted} style={{ marginTop: theme.space.lg }} />
    </View>
  );
}

// This screen deliberately does NOT follow the light/dark theme — it's a fixed dark
// branded moment shown exactly once, the same kind of intentional exception Safe Mode's
// always-red screen is. theme.ink would have been wrong here: it flips between near-black
// and near-white depending on system mode, which would break this screen's look entirely
// in light mode.
const WELCOME_BG = '#0F1720';

const makeStyles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: WELCOME_BG, paddingHorizontal: theme.space.xl },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md, marginBottom: theme.space.xxl },
  logoBadge: { width: 44, height: 44, borderRadius: 14, backgroundColor: theme.brand, alignItems: 'center', justifyContent: 'center' },
  logoText: { fontSize: 24, fontWeight: theme.weight.semibold, color: '#fff' },
  tagline: { fontSize: 26, fontWeight: theme.weight.semibold, color: '#fff', lineHeight: 34, marginBottom: theme.space.xxl },
  bullets: { gap: theme.space.md },
  bulletRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md },
  bulletIcon: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  bulletText: { fontSize: 16, color: 'rgba(255,255,255,0.9)' },
  privacyCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: theme.radius.lg, padding: theme.space.lg, marginBottom: theme.space.md },
  privacyTitle: { fontSize: 14.5, fontWeight: theme.weight.semibold, color: '#fff' },
  privacySub: { fontSize: 12.5, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
});
