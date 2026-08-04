import React, {useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { buildTripHTML, exportTripPDF } from '../tripExport';
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
      <TouchableOpacity style={styles.exportBtn} onPress={() => exportTripPDF(tripId, tripName)}>
        <Text style={styles.exportBtnText}>Export as PDF / share</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.surface },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg },
  webview: { flex: 1 },
  exportBtn: { backgroundColor: theme.brandDeep, minHeight: theme.a11y.minTouchTarget, alignItems: 'center', justifyContent: 'center' },
  exportBtnText: { color: '#fff', fontWeight: theme.weight.semibold, fontSize: theme.type.heading },
});
