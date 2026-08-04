import React, {useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { searchTrip } from '../db';
import { SearchBar, LedgerList, LedgerRow, useTheme } from '../components/UI';

// Feather icons, not emoji — the design system rule is one consistent icon language
// everywhere; this screen was the one place still using emoji section labels.
const SECTIONS = {
  travelers: { label: 'Travelers', icon: 'users' },
  expenses: { label: 'Expenses', icon: 'dollar-sign' },
  notes: { label: 'Notes', icon: 'file-text' },
  documents: { label: 'Documents', icon: 'paperclip' },
  timeline: { label: 'Timeline', icon: 'clock' },
  contributions: { label: 'Contributions', icon: 'gift' },
};

function renderLine(section, item) {
  switch (section) {
    case 'travelers': return item.name;
    case 'expenses': return `${item.paid_by} paid ${item.amount} — ${item.description}`;
    case 'notes': return item.text;
    case 'documents': return item.name;
    case 'timeline': return item.event;
    case 'contributions': return `${item.traveler} contributed ${item.amount}`;
    default: return '';
  }
}

export default function SearchScreen({ route, navigation }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { tripId } = route.params;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);

  const runSearch = async (text) => {
    setQuery(text);
    if (!text.trim()) { setResults(null); return; }
    setResults(await searchTrip(tripId, text));
  };

  const totalCount = results ? Object.values(results).reduce((s, arr) => s + arr.length, 0) : 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <SearchBar placeholder="Search this trip…" value={query} onChangeText={runSearch} autoFocus />
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.cancelBtn}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {!results && <Text style={styles.muted}>Search expenses, notes, documents, timeline, travelers, and contributions.</Text>}
        {results && totalCount === 0 && <Text style={styles.muted}>No matches.</Text>}
        {results && Object.entries(results).map(([section, items]) => (
          items.length > 0 && (
            <View key={section} style={styles.section}>
              <View style={styles.sectionTitleRow}>
                <Feather name={SECTIONS[section].icon} size={14} color={theme.inkMute} />
                <Text style={styles.sectionTitle}>{SECTIONS[section].label}</Text>
              </View>
              <LedgerList>
                {items.map((item, i) => (
                  <LedgerRow key={item.id} isLast={i === items.length - 1}>
                    <Text style={styles.resultLine}>{renderLine(section, item)}</Text>
                  </LedgerRow>
                ))}
              </LedgerList>
            </View>
          )
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg, padding: theme.space.xl, paddingTop: theme.space.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: theme.space.lg, gap: theme.space.sm },
  cancelBtn: { minHeight: theme.a11y.minTouchTarget, justifyContent: 'center', paddingHorizontal: 4 },
  cancel: { color: theme.brandDeep, fontWeight: theme.weight.semibold },
  muted: { color: theme.inkMute, textAlign: 'center', marginTop: 40, fontSize: theme.type.body },
  section: { marginBottom: theme.space.lg },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: theme.space.sm },
  sectionTitle: { fontWeight: theme.weight.semibold, color: theme.inkMute, fontSize: theme.type.label, textTransform: 'uppercase', letterSpacing: 0.4 },
  resultLine: { color: theme.ink, fontSize: theme.type.body },
});
