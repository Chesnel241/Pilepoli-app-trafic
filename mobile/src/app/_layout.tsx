import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { BricolageGrotesque_600SemiBold, BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold } from '@expo-google-fonts/inter';
import { View } from 'react-native';
import { SettingsProvider, useSettings } from '../lib/settings';
import { configureNotifications } from '../lib/notify';
import { colors } from '../theme';

configureNotifications();

export default function RootLayout() {
  return (
    <SettingsProvider>
      <Root />
    </SettingsProvider>
  );
}

function Root() {
  const [loaded] = useFonts({
    BricolageGrotesque_600SemiBold, BricolageGrotesque_800ExtraBold,
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold,
  });
  const { ready } = useSettings();
  if (!loaded || !ready) return <View style={{ flex: 1, backgroundColor: colors.violet }} />;
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'slide_from_right',
          gestureEnabled: true,
          gestureDirection: 'horizontal',
        }}
      >
        {/* Pendant le guidage, pas de retour par glissement accidentel. */}
        <Stack.Screen name="en-route" options={{ gestureEnabled: false }} />
        <Stack.Screen name="bienvenue" options={{ gestureEnabled: false, animation: 'fade' }} />
      </Stack>
    </>
  );
}
