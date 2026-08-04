import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from './screens/HomeScreen';
import TripScreen from './screens/TripScreen';
import ShareScreen from './screens/ShareScreen';
import SearchScreen from './screens/SearchScreen';
import DraftsScreen from './screens/DraftsScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: '#0F5C56' }, headerTintColor: '#fff' }}>
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'TripNest' }} />
        <Stack.Screen name="Trip" component={TripScreen} options={({ route }) => ({ title: route.params.tripName })} />
        <Stack.Screen name="Share" component={ShareScreen} options={{ title: 'Share Trip' }} />
        <Stack.Screen name="Search" component={SearchScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Drafts" component={DraftsScreen} options={{ headerShown: false }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
