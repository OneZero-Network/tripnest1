import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../components/UI';

// RETENTION GAP THIS SCREEN CLOSES: the app had every piece of the Trip Bank / personal-
// expense / settlement model correctly implemented, but nowhere that actually TAUGHT it.
// A first-time user could create a trip, add expenses, and land on Settlement without
// ever being told why there are two "Paid from" options, or what "Trip Bank → Person"
// versus "Person → Person" even means. The engine being right doesn't help if nobody
// understands what it's telling them — this is the screen that closes that gap, reachable
// from the exact two moments a user would actually wonder about it (Settlement's info
// icon, and the Trip Bank toggle at trip creation), not just buried in a menu.
const STEPS = [
  { icon: 'flag', title: 'Create a trip', body: 'Name it, pick a currency.' },
  { icon: 'users', title: 'Add your friends', body: 'Everyone splitting costs, as real people — not free text.' },
  { icon: 'briefcase', title: 'Consolidate into a Trip Bank (optional)', body: "Everyone pools money upfront into one shared bank. Skip this if you'd rather just settle up person-to-person as you go." },
  { icon: 'dollar-sign', title: 'Track every expense', body: 'Personal payments, shared cash from the bank, or a foreign currency — TripNest converts everything to one number automatically.' },
  { icon: 'check-circle', title: 'TripNest calculates who pays whom', body: 'Automatically, in three possible directions — see below.' },
  { icon: 'archive', title: 'Save it as a reusable record', body: 'Close the trip, and the final settlement stays saved for reference.' },
];

const OUTCOMES = [
  { icon: 'arrow-down-circle', tone: 'brand', title: 'Trip Bank → Person', body: "The bank has unused cash left over — it gets refunded back to whoever's owed a share." },
  { icon: 'arrow-up-circle', tone: 'warn', title: 'Person → Trip Bank', body: "The bank came up short — whoever hasn't paid their share yet tops it up." },
  { icon: 'repeat', tone: 'accent', title: 'Person → Person', body: 'Someone paid for something personally, out of their own pocket — they get paid back directly by whoever benefited, no bank involved.' },
];

export default function HowItWorksScreen({ navigation }) {
  const theme = useTheme();
  const styles = makeStyles(theme);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="arrow-left" size={22} color={theme.ink} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>How TripNest works</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          You never need to do the math — TripNest does. Here's the shape of a trip, start to finish.
        </Text>

        {STEPS.map((s, i) => (
          <View key={s.title} style={styles.stepRow}>
            <View style={styles.stepLeft}>
              <View style={styles.stepIconCircle}>
                <Feather name={s.icon} size={16} color={theme.brand} />
              </View>
              {i < STEPS.length - 1 && <View style={styles.stepLine} />}
            </View>
            <View style={{ flex: 1, paddingBottom: theme.space.lg }}>
              <Text style={styles.stepTitle}>{s.title}</Text>
              <Text style={styles.stepBody}>{s.body}</Text>
            </View>
          </View>
        ))}

        <Text style={styles.sectionHeading}>The three ways money moves</Text>
        <Text style={styles.sectionSub}>This is the whole idea — everything on Settlement is one of these three.</Text>

        {OUTCOMES.map((o) => (
          <View key={o.title} style={[styles.outcomeCard, { borderColor: theme.line }]}>
            <View style={[styles.outcomeIcon, { backgroundColor: theme[`${o.tone}Wash`] }]}>
              <Feather name={o.icon} size={18} color={theme[o.tone]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.outcomeTitle}>{o.title}</Text>
              <Text style={styles.outcomeBody}>{o.body}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (theme) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: theme.space.xl, paddingVertical: theme.space.md },
  headerTitle: { fontSize: theme.type.heading, fontWeight: theme.weight.semibold, color: theme.ink },
  content: { paddingHorizontal: theme.space.xl, paddingBottom: theme.space.xxl },
  intro: { fontSize: theme.type.body, color: theme.inkSoft, lineHeight: 21, marginBottom: theme.space.xl },
  stepRow: { flexDirection: 'row' },
  stepLeft: { alignItems: 'center', marginEnd: theme.space.md },
  stepIconCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.brandWash, alignItems: 'center', justifyContent: 'center' },
  stepLine: { flex: 1, width: 1, backgroundColor: theme.line, marginTop: 4 },
  stepTitle: { fontSize: theme.type.body, fontWeight: theme.weight.semibold, color: theme.ink },
  stepBody: { fontSize: theme.type.caption, color: theme.inkMute, marginTop: 2, lineHeight: 17 },
  sectionHeading: { fontSize: theme.type.heading, fontWeight: theme.weight.semibold, color: theme.ink, marginTop: theme.space.md, marginBottom: 4 },
  sectionSub: { fontSize: theme.type.caption, color: theme.inkMute, marginBottom: theme.space.lg },
  outcomeCard: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.space.md, borderWidth: 1, borderRadius: theme.radius.lg, padding: theme.space.lg, marginBottom: theme.space.md, backgroundColor: theme.surface },
  outcomeIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  outcomeTitle: { fontSize: theme.type.body, fontWeight: theme.weight.semibold, color: theme.ink },
  outcomeBody: { fontSize: theme.type.caption, color: theme.inkMute, marginTop: 3, lineHeight: 17 },
});
