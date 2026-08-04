import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { buildTripHTML, exportTripPDF } from '../tripExport';

export default function ShareScreen({ route }) {
  const { tripId, tripName } = route.params;
  const [html, setHtml] = useState(null);

  useEffect(() => {
    buildTripHTML(tripId, tripName).then(setHtml);
  }, [tripId, tripName]);

  if (!html) {
    return (
      <View style={styles.center}><ActivityIndicator color="#0F5C56" /></View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView originWhitelist={['*']} source={{ html }} style={styles.webview} />
      <TouchableOpacity style={styles.exportBtn} onPress={() => exportTripPDF(tripId, tripName)}>
        <Text style={styles.exportBtnText}>Export as PDF / Share</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  webview: { flex: 1 },
  exportBtn: { backgroundColor: '#0F5C56', padding: 16, alignItems: 'center' },
  exportBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
