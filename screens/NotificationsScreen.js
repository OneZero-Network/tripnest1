import React, { useState, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, PanResponder } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { getNotificationFeed } from '../db';
import { EmptyState, useTheme } from '../components/UI';

export default function NotificationsScreen({ navigation }) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const [items, setItems] = useState(null); // null = loading

  useFocusEffect(useCallback(() => {
    getNotificationFeed().then(setItems);
  }, []));

  const openTrip = (item) => navigation.navigate('Trip', { tripId: item.tripId, tripName: item.tripName });

  // Continues the same Overview → Trips → Notifications → More swipe sequence that
  // starts on the Home screen. Notifications/More are separate pushed screens (not
  // in-place tabs), so each needs its own handler — a swipe gesture on Home has no way
  // to reach a component that isn't even mounted yet. Forward (right-to-left) pushes
  // the next screen in the sequence; backward (left-to-right) is just goBack(), which
  // correctly returns to wherever the sequence was previously (Trips), not a hardcoded
  // destination — the whole point of using the real navigation stack instead of trying
  // to reconstruct "where the user came from" by hand.
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 24 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
      onPanResponderRelease: (_, gesture) => {
        if (Math.abs(gesture.dx) < 60) return;
        if (gesture.dx < 0) navigation.navigate('More');
        else if (navigation.canGoBack()) navigation.goBack();
      },
    })
  ).current;

  return (
    <SafeAreaView style={styles.safe} {...panResponder.panHandlers}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="arrow-left" size={22} color={theme.ink} />
        </TouchableOpacity>
        <Text style={styles.title}>Notifications</Text>
        <View style={{ width: 22 }} />
      </View>

      {items === null ? null : items.length === 0 ? (
        <EmptyState
          icon="check"
          title="Nothing needs your attention"
          hint="Pending drafts, outstanding settlements, and upcoming plans across your active trips will show up here."
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => openTrip(item)}>
              <View style={[styles.iconBadge, { backgroundColor: theme[`${item.tone}Wash`] || theme.brandWash }]}>
                <Feather name={item.icon} size={16} color={theme[item.tone] || theme.brand} />
              </View>
              <Text style={styles.message}>{item.message}</Text>
              <Feather name="chevron-right" size={16} color={theme.inkMute} />
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={styles.divider} />}
        />
      )}
    </SafeAreaView>
  );
}

const makeStyles = (theme) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: theme.space.xl, paddingVertical: theme.space.md },
  title: { fontSize: theme.type.heading, fontWeight: theme.weight.semibold, color: theme.ink },
  list: { paddingHorizontal: theme.space.xl, paddingBottom: theme.space.xxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md, paddingVertical: theme.space.md },
  iconBadge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  message: { flex: 1, fontSize: theme.type.body, color: theme.ink, fontWeight: theme.weight.medium },
  divider: { height: 1, backgroundColor: theme.line },
});
