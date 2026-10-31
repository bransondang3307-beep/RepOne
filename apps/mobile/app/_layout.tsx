import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { AppServicesProvider, useAppContainer } from '../src/application';
import { useLiveSession } from '../src/features/rep-tracking';
import { TabBar, useTheme } from '../src/shared';

export default function RootLayout() {
  const boot = useAppContainer();
  const { colors, spacing } = useTheme();

  if (boot.status !== 'ready') {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: spacing.lg }]}>
        <StatusBar style="auto" />
        {boot.status === 'loading' ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Text style={{ color: colors.danger, textAlign: 'center' }}>Could not open local storage: {boot.message}</Text>
        )}
      </View>
    );
  }

  return (
    <AppServicesProvider container={boot.container}>
      <StatusBar style="auto" />
      <Tabs
        tabBar={(props) => <AppTabBar {...props} />}
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background }, animation: 'fade' }}
      >
        <Tabs.Screen name="index" options={{ title: 'Today' }} />
        <Tabs.Screen name="record" options={{ title: 'Record' }} />
        <Tabs.Screen name="history" options={{ title: 'History' }} />
      </Tabs>
    </AppServicesProvider>
  );
}

const ICONS = { index: 'home', record: 'record', history: 'history' } as const;

/** The tab bar, with a live dot on Record while a set is recording there. */
function AppTabBar(props: BottomTabBarProps) {
  const status = useLiveSession((s) => s.session.status);
  const live = status === 'starting' || status === 'recording' || status === 'stopping';
  return <TabBar {...props} icons={ICONS} liveRoute={live ? 'record' : null} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
