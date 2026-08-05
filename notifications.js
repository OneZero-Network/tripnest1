import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// TripNest has no server and no push infrastructure, and per its own offline-first
// principle should never need one for something as simple as "remind me about this plan
// item." expo-notifications' LOCAL scheduling (not push) is the correct tool here: the
// notification is scheduled entirely on-device, fires even with no network at all, and
// needs no backend to ever exist. This is not a reduced version of "real" notifications —
// for this use case, it's the right architecture, not a workaround.

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

let permissionRequested = false;

export async function requestNotificationPermissions() {
  if (permissionRequested) return true;
  permissionRequested = true;
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Trip reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  return status === 'granted';
}

// Schedules a reminder 15 minutes before the plan item's scheduled time — far enough
// ahead to actually act on it, not so far that it arrives disconnected from the moment.
// If the scheduled time is already less than 15 minutes away (or in the past), fires
// immediately-ish instead of silently scheduling something that will never trigger.
export async function scheduleItineraryNotification(tripName, title, location, scheduledAt) {
  try {
    const granted = await requestNotificationPermissions();
    if (!granted) return null;

    const reminderTime = scheduledAt - 15 * 60 * 1000;
    const secondsUntil = Math.max(5, Math.round((reminderTime - Date.now()) / 1000));

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: `${tripName}: ${title}`,
        body: location ? `Coming up soon at ${location}` : 'Coming up soon',
      },
      trigger: { seconds: secondsUntil, channelId: 'default' },
    });
    return notificationId;
  } catch (err) {
    // Notifications are a nice-to-have on top of the core app, not a dependency it should
    // ever crash on — a permission denial or scheduling failure just means no reminder,
    // not a broken "add plan item" flow.
    return null;
  }
}

export async function cancelItineraryNotification(notificationId) {
  if (!notificationId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch (err) {
    // Already fired or already cancelled — fine either way.
  }
}
