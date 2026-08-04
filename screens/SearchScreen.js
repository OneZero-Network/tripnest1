import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { searchTrip } from '../db';

const SECTION_LABELS = {
  travelers: '👤 Travelers',
  expenses: '💰 Expenses',
  notes: '📝 Notes',
  documents: '📄 Documents',
  timeline: '🕒 Timeline',
  contributions: '💵 Contributions',
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
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TextInput
          style={styles.input}
          placeholder="Search this trip…"
          value={query}
          onChangeText={runSearch}
          autoFocus
        />
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.cancel}>Cancel</Text></TouchableOpacity>
      </View>

      <ScrollView>
        {!results && <Text style={styles.muted}>Search expenses, notes, documents, timeline, travelers, and contributions.</Text>}
        {results && totalCount === 0 && <Text style={styles.muted}>No matches.</Text>}
        {results && Object.entries(results).map(([section, items]) => (
          items.length > 0 && (
            <View key={section} style={styles.section}>
              <Text style={styles.sectionTitle}>{SECTION_LABELS[section]}</Text>
              {items.map((item) => (
                <Text key={item.id} style={styles.resultLine}>{renderLine(section, item)}</Text>
              ))}
            </View>
          )
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4FAF9', padding: 16, paddingTop: 60 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  input: { flex: 1, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: '#CFE8E4' },
  cancel: { color: '#0F5C56', fontWeight: '600', marginLeft: 10 },
  muted: { color: '#8FA8A5', textAlign: 'center', marginTop: 40 },
  section: { marginBottom: 16 },
  sectionTitle: { fontWeight: '700', color: '#0F5C56', marginBottom: 6 },
  resultLine: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#E1F0EE', color: '#0F5C56' },
});
