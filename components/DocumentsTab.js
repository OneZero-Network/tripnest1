import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { pickAndAddDocument, openDocument, deleteDocument } from '../tripExport';
import { ListRow, PrimaryButton, EmptyState, theme } from './UI';

export default function DocumentsTab({ tripId, documents, onChanged }) {
  return (
    <View style={styles.section}>
      <PrimaryButton
        label="Attach Document"
        onPress={async () => { await pickAndAddDocument(tripId); onChanged(); }}
        style={{ marginBottom: 8 }}
      />
      <FlatList
        data={documents}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <ListRow
            onPress={() => openDocument(item.uri)}
            actionLabel="Remove"
            onAction={async () => { await deleteDocument(item.id, item.uri, tripId, item.name); onChanged(); }}
          >
            <Text style={styles.listItem}>📄 {item.name}</Text>
          </ListRow>
        )}
        ListEmptyComponent={<EmptyState text="No documents attached." />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { flex: 1 },
  listItem: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.primaryLight, color: theme.primary },
});
