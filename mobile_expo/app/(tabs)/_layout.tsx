import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MiniPlayer from '../../components/MiniPlayer';
import { Colors } from '../../constants/theme';

const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'home',
  library: 'musical-notes',
  analytics: 'bar-chart',
  sync: 'sync',
};

const TAB_LABELS: Record<string, string> = {
  index: 'Home',
  library: 'Library',
  analytics: 'Analytics',
  sync: 'Sync',
};

function CustomTabBar({ state, navigation }: any) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View>
      <MiniPlayer onPress={() => router.push('/player')} />
      <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {state.routes.map((route: any, index: number) => {
          const focused = state.index === index;
          const color = focused ? Colors.white : Colors.textMuted;
          const icon = TAB_ICONS[route.name] || 'ellipse';
          const label = TAB_LABELS[route.name] || route.name;

          return (
            <TouchableOpacity
              key={route.key}
              style={styles.tabItem}
              onPress={() => {
                if (!focused) navigation.navigate(route.name);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name={icon} size={22} color={color} />
              <Text style={[styles.tabLabel, { color }]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function TabLayout() {
  return (
    <View style={styles.container}>
      <Tabs
        tabBar={(props) => <CustomTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: Colors.bg },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="library" options={{ title: 'Library' }} />
        <Tabs.Screen name="analytics" options={{ title: 'Analytics' }} />
        <Tabs.Screen name="sync" options={{ title: 'Sync' }} />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderTopColor: 'rgba(255,255,255,0.07)',
    borderTopWidth: 1,
    paddingTop: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
});
