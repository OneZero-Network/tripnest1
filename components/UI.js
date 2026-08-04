import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export const theme = {
  bg: '#F4FAF9',
  primary: '#0F5C56',
  primaryLight: '#E1F0EE',
  border: '#CFE8E4',
  muted: '#8FA8A5',
  danger: '#B23B3B',
};

// A single list row with a tap target and an optional trailing action —
// the "docRow" pattern that was copy-pasted across every tab (Travelers, Notes,
// Documents, Plan, Drafts) before this extraction.
export function ListRow({ onPress, children, actionLabel, onAction, actionColor }) {
  return (
    <View style={styles.row}>
      <TouchableOpacity style={{ flex: 1 }} onPress={onPress} disabled={!onPress}>
        {children}
      </TouchableOpacity>
      {actionLabel && (
        <TouchableOpacity onPress={onAction}>
          <Text style={[styles.actionText, actionColor && { color: actionColor }]}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export function PrimaryButton({ label, onPress, style }) {
  return (
    <TouchableOpacity style={[styles.btn, style]} onPress={onPress}>
      <Text style={styles.btnText}>{label}</Text>
    </TouchableOpacity>
  );
}

export function Chip({ label, active, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function EmptyState({ text }) {
  return <Text style={styles.empty}>{text}</Text>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  actionText: { color: theme.danger, fontWeight: '600', paddingLeft: 10, fontSize: 12 },
  btn: { backgroundColor: theme.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontWeight: '600' },
  chip: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: theme.border, marginRight: 6 },
  chipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  chipText: { color: theme.primary, fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  empty: { color: theme.muted, textAlign: 'center', marginTop: 20 },
});
