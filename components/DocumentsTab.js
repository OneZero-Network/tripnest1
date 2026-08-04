import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { pickAndAddDocument, openDocument, deleteDocument } from '../tripExport';
import { ListRow, PrimaryButton, EmptyState, theme } from './UI';

export default function DocumentsTab({ tripId, documents, onChanged }) {
  return (
    <View style={styles.section}>
      <PrimaryButton
        label="Attach Document"
        icon="paperclip"
        onPress={async () => { await pickAndAddDocument(tripId); onChanged(); }}
        style={{ marginBottom: 12 }}
      />
      <FlatList
        data={documents}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <ListRow
            icon="document"
            onPress={() => openDocument(item.uri)}
            actionLabel="Remove"
            onAction={async () => { await deleteDocument(item.id, item.uri, tripId, item.name); onChanged(); }}
          >
            <Text style={styles.listItem}>{item.name}</Text>
          </ListRow>
        )}
        ListEmptyComponent={
          <EmptyState
            icon="document"
            title="Attach tickets, bookings, IDs"
            hint="Anything you'd otherwise dig for in email or photos — keep it here so it's offline and one tap away."
            optional
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { flex: 1 },
  listItem: { fontSize: 14.5, fontWeight: '600', color: theme.ink },
});
