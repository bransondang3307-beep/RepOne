import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAppContainer } from '../src/di/useAppContainer';
import { WorkoutStoreProvider } from '../src/state/WorkoutStoreProvider';
import { colors, spacing } from '../src/ui/theme/tokens';

export default function RootLayout() {
  const boot = useAppContainer();

  if (boot.status !== 'ready') {
    return (
      <View style={styles.center}>
        {boot.status === 'loading' ? (
          <ActivityIndicator />
        ) : (
          <Text style={styles.error}>Could not open local storage: {boot.message}</Text>
        )}
      </View>
    );
  }

  return (
    <WorkoutStoreProvider container={boot.container}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="index" options={{ title: 'RepOne' }} />
        <Stack.Screen name="history" options={{ title: 'History' }} />
      </Stack>
    </WorkoutStoreProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  error: { color: colors.danger, textAlign: 'center' },
});
