import React, { useEffect, useRef } from 'react';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as QuickActions from 'expo-quick-actions';
import { ThemeProvider, useTheme } from './components/UI';
import SplashScreen from './screens/SplashScreen';
import HomeScreen from './screens/HomeScreen';
import CreateTripScreen from './screens/CreateTripScreen';
import TripScreen from './screens/TripScreen';
import ShareScreen from './screens/ShareScreen';
import SearchScreen from './screens/SearchScreen';
import DraftsScreen from './screens/DraftsScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}

function AppInner() {
  const theme = useTheme();
  const navigationRef = useNavigationContainerRef();

  // OS-level shortcut: long-press the app icon (Android) / 3D Touch or long-press (iOS)
  // shows "🛡️ Safe Mode: <Trip Name>" when there's an active trip. Tapping it routes
  // straight to that trip with Safe Mode already open — one step from the home screen,
  // with the OS's own lock-screen security (FaceID/fingerprint/PIN) as the actual gate,
  // per the V1 access-UX decision: no widget, no data rendered outside the app itself.
  const openedFromQuickAction = useRef(QuickActions.initial ?? null);

  useEffect(() => {
    const nav = (action) => {
      if (!action || action.id !== 'safe-mode' || !action.params?.tripId) return;
      navigationRef.navigate('Trip', {
        tripId: action.params.tripId,
        tripName: action.params.tripName,
        openSafeMode: true,
      });
    };
    // Track the state-listener unsubscribe outside the listener itself — the previous
    // version only removed it from within its own callback, so if that callback never
    // fired before this component unmounted, the listener would never be cleaned up.
    let unsubState = null;
    if (openedFromQuickAction.current) {
      // App was cold-launched via the shortcut — wait for the navigator to be ready.
      unsubState = navigationRef.addListener('state', () => {
        nav(openedFromQuickAction.current);
        openedFromQuickAction.current = null;
        unsubState();
        unsubState = null;
      });
    }
    const sub = QuickActions.addListener(nav);
    return () => {
      sub.remove();
      if (unsubState) unsubState();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <NavigationContainer ref={navigationRef}>
        <Stack.Navigator initialRouteName="Splash" screenOptions={{ headerStyle: { backgroundColor: theme.brandDeep }, headerTintColor: '#fff' }}>
          <Stack.Screen name="Splash" component={SplashScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
          <Stack.Screen name="CreateTrip" component={CreateTripScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Trip" component={TripScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Share" component={ShareScreen} options={{ title: 'Share Trip' }} />
          <Stack.Screen name="Search" component={SearchScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Drafts" component={DraftsScreen} options={{ headerShown: false }} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
