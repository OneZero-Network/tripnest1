import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Linking, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTheme, ConfirmDialog } from '../components/UI';
import { signInWithGoogle, backupToGoogleDrive, restoreFromGoogleDrive } from '../googleBackup';

// What actually exists to put here: an explainer (real), a feedback channel (real — mailto
// needs no backend), version/privacy info (real, straight from app.json), and optional
// Google Drive backup (real, but manual and opt-in — see googleBackup.js for exactly what
// it does and doesn't do). What does NOT exist yet — account settings, theme override —
// isn't listed at all, rather than shown as a dead link.
const ITEMS = [
  { key: 'howItWorks', icon: 'help-circle', label: 'How TripNest works', sub: 'The three ways settlement can go' },
  { key: 'feedback', icon: 'mail', label: 'Send feedback', sub: 'Opens your email app' },
];

export default function MoreScreen({ navigation }) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const [busy, setBusy] = useState(null); // 'backup' | 'restore' | null
  const [pendingRestore, setPendingRestore] = useState(false);
  const [resultMessage, setResultMessage] = useState(null);

  const handlePress = (key) => {
    if (key === 'howItWorks') navigation.navigate('HowItWorks');
    if (key === 'feedback') Linking.openURL('mailto:?subject=TripNest%20feedback');
  };

  const doBackup = async () => {
    setBusy('backup');
    setResultMessage(null);
    try {
      const token = await signInWithGoogle();
      if (!token) { setBusy(null); return; }
      await backupToGoogleDrive(token);
      setResultMessage('Backed up to Google Drive.');
    } catch (err) {
      setResultMessage(`Backup failed: ${err?.message || 'unknown error'}`);
    }
    setBusy(null);
  };

  const doRestore = async () => {
    setPendingRestore(false);
    setBusy('restore');
    setResultMessage(null);
    try {
      const token = await signInWithGoogle();
      if (!token) { setBusy(null); return; }
      const result = await restoreFromGoogleDrive(token);
      setResultMessage(
        result.found
          ? `Restore complete — ${result.restored} record${result.restored === 1 ? '' : 's'} merged in. Nothing already on this device was overwritten.`
          : 'No backup found on this Google account yet.'
      );
    } catch (err) {
      setResultMessage(`Restore failed: ${err?.message || 'unknown error'}`);
    }
    setBusy(null);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="arrow-left" size={22} color={theme.ink} />
        </TouchableOpacity>
        <Text style={styles.title}>More</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.list}>
        {ITEMS.map((item, i) => (
          <TouchableOpacity
            key={item.key}
            style={[styles.row, styles.divider]}
            onPress={() => handlePress(item.key)}
          >
            <Feather name={item.icon} size={18} color={theme.brand} style={{ marginEnd: theme.space.md }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{item.label}</Text>
              <Text style={styles.sub}>{item.sub}</Text>
            </View>
            <Feather name="chevron-right" size={16} color={theme.inkMute} />
          </TouchableOpacity>
        ))}

        <View style={styles.row}>
          <Feather name="cloud" size={18} color={theme.brand} style={{ marginEnd: theme.space.md }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Google Drive backup</Text>
            <Text style={styles.sub}>Optional and manual — nothing leaves this device unless you tap below.</Text>
          </View>
        </View>
        <View style={styles.backupActions}>
          <TouchableOpacity style={styles.backupBtn} onPress={doBackup} disabled={!!busy}>
            {busy === 'backup' ? <ActivityIndicator size="small" color={theme.brandDeep} /> : <Text style={styles.backupBtnText}>Back up now</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.backupBtn} onPress={() => setPendingRestore(true)} disabled={!!busy}>
            {busy === 'restore' ? <ActivityIndicator size="small" color={theme.brandDeep} /> : <Text style={styles.backupBtnText}>Restore</Text>}
          </TouchableOpacity>
        </View>
        {resultMessage && <Text style={styles.resultMessage}>{resultMessage}</Text>}
      </View>

      <View style={styles.privacyRow}>
        <Feather name="shield" size={14} color={theme.inkMute} />
        <Text style={styles.privacyText}>
          By default, everything stays on your device. Google Drive backup only ever sees a file TripNest itself creates — never the rest of your Drive — and only runs when you tap Back up or Restore.
        </Text>
      </View>

      <Text style={styles.version}>TripNest v1.0.0</Text>

      <ConfirmDialog
        visible={pendingRestore}
        title="Restore from Google Drive?"
        message="This adds any trips from your Drive backup that aren't already on this device. Nothing already here gets deleted or overwritten — but attached documents (photos, PDFs) aren't part of this backup yet, only trip data."
        confirmLabel="Restore"
        onConfirm={doRestore}
        onCancel={() => setPendingRestore(false)}
      />
    </SafeAreaView>
  );
}

const makeStyles = (theme) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: theme.space.xl, paddingVertical: theme.space.md },
  title: { fontSize: theme.type.heading, fontWeight: theme.weight.semibold, color: theme.ink },
  list: { marginHorizontal: theme.space.xl, backgroundColor: theme.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.line },
  row: { flexDirection: 'row', alignItems: 'center', padding: theme.space.md, minHeight: theme.a11y.minTouchTarget },
  divider: { borderBottomWidth: 1, borderBottomColor: theme.line },
  label: { fontSize: theme.type.body, fontWeight: theme.weight.semibold, color: theme.ink },
  sub: { fontSize: theme.type.caption, color: theme.inkMute, marginTop: 2 },
  backupActions: { flexDirection: 'row', gap: theme.space.sm, paddingHorizontal: theme.space.md, paddingBottom: theme.space.md },
  backupBtn: { flex: 1, minHeight: 40, borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.line, alignItems: 'center', justifyContent: 'center' },
  backupBtnText: { fontSize: theme.type.caption, fontWeight: theme.weight.semibold, color: theme.brandDeep },
  resultMessage: { fontSize: theme.type.caption, color: theme.inkMute, paddingHorizontal: theme.space.md, paddingBottom: theme.space.md, lineHeight: 17 },
  privacyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginHorizontal: theme.space.xl, marginTop: theme.space.xl },
  privacyText: { flex: 1, fontSize: theme.type.caption, color: theme.inkMute, lineHeight: 17 },
  version: { textAlign: 'center', fontSize: 11.5, color: theme.inkMute, marginTop: theme.space.xxl },
});
