import React, {useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { buildTripHTML, exportTripPDF, exportTripCSV } from '../tripExport';
import { useTheme } from '../components/UI';

export default function ShareScreen({ route }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { tripId, tripName } = route.params;
  const [html, setHtml] = useState(null);

  useEffect(() => {
    buildTripHTML(tripId, tripName).then(setHtml);
  }, [tripId, tripName]);

  if (!html) {
    return (
      <View style={styles.center}><ActivityIndicator color={theme.brandDeep} /></View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView originWhitelist={['*']} source={{ html }} style={styles.webview} />
      <View style={styles.exportRow}>
        <TouchableOpacity style={[styles.exportBtn, { flex: 1 }]} onPress={() => exportTripPDF(tripId, tripName)}>
          <Text style={styles.exportBtnText}>Export as PDF</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.exportBtn, styles.csvBtn, { flex: 1 }]} onPress={() => exportTripCSV(tripId, tripName)}>
          <Text style={[styles.exportBtnText, styles.csvBtnText]}>Export expenses as CSV</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.surface },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg },
  webview: { flex: 1 },
  exportRow: { flexDirection: 'row' },
  exportBtn: { backgroundColor: theme.brandDeep, minHeight: theme.a11y.minTouchTarget, alignItems: 'center', justifyContent: 'center' },
  csvBtn: { backgroundColor: theme.surface, borderTopWidth: 1, borderColor: theme.line },
  exportBtnText: { color: '#fff', fontWeight: theme.weight.semibold, fontSize: theme.type.body, paddingHorizontal: theme.space.sm, textAlign: 'center' },
  csvBtnText: { color: theme.brandDeep },
});
