import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { pickAndAddDocument, openDocument, deleteDocument } from '../tripExport';
import { togglePinnedDocument } from '../db';
import { PrimaryButton, EmptyState, LedgerList, LedgerRow, useTheme } from './UI';

export default function DocumentsTab({ tripId, documents, onChanged }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.section}>
      <PrimaryButton
        label="Attach document"
        icon="paperclip"
        onPress={async () => { await pickAndAddDocument(tripId); onChanged(); }}
        style={{ marginBottom: theme.space.md }}
      />

      {documents.length === 0 ? (
        <EmptyState
          icon="document"
          title="Attach tickets, bookings, IDs"
          hint="Anything you'd otherwise dig for in email or photos — keep it here so it's offline and one tap away. Pin passports, insurance, or ID scans to Safe Mode so they surface instantly in an emergency."
          optional
        />
      ) : (
        <LedgerList>
          {documents.map((item, i) => (
            <LedgerRow key={item.id} icon="document" onPress={() => openDocument(item.uri)} isLast={i === documents.length - 1}>
              <Text style={styles.listItem}>{item.name}</Text>
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={styles.pinBtn}
                  onPress={() => { togglePinnedDocument(item.id); onChanged(); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Feather name="shield" size={13} color={item.pinned_emergency ? theme.danger : theme.inkMute} />
                  <Text style={[styles.pinText, item.pinned_emergency && { color: theme.danger }]}>
                    {item.pinned_emergency ? 'In Safe Mode' : 'Pin to Safe Mode'}
                  </Text>
                </TouchableOpacity>
                <Text style={styles.removeText} onPress={async () => { await deleteDocument(item.id, item.uri, tripId, item.name); onChanged(); }}>Remove</Text>
              </View>
            </LedgerRow>
          ))}
        </LedgerList>
      )}
    </View>
  );
}

const makeStyles = (theme) => StyleSheet.create({
  section: { flex: 1 },
  listItem: { fontSize: theme.type.body, fontWeight: theme.weight.semibold, color: theme.ink },
  actionsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: theme.space.md },
  pinBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pinText: { fontSize: 11.5, color: theme.inkMute, fontWeight: theme.weight.semibold },
  removeText: { color: theme.danger, fontWeight: theme.weight.semibold, fontSize: 11.5 },
});
