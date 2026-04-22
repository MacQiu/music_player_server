import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import MiniPlayer from '../../components/MiniPlayer';
import { Colors, FontSize } from '../../constants/theme';

export default function TabLayout() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: Colors.surface2,
            borderTopColor: Colors.border,
            borderTopWidth: 1,
          },
          tabBarActiveTintColor: Colors.accent,
          tabBarInactiveTintColor: Colors.textMuted,
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
          },
          sceneStyle: { backgroundColor: Colors.bg },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="library"
          options={{
            title: 'Library',
            tabBarIcon: ({ color, size }) => <Ionicons name="musical-notes" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="analytics"
          options={{
            title: 'Analytics',
            tabBarIcon: ({ color, size }) => <Ionicons name="bar-chart" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="sync"
          options={{
            title: 'Sync',
            tabBarIcon: ({ color, size }) => <Ionicons name="sync" size={size} color={color} />,
          }}
        />
      </Tabs>
      <View style={styles.miniPlayerWrap}>
        <MiniPlayer onPress={() => router.push('/player')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  miniPlayerWrap: {
    position: 'absolute',
    bottom: 49,
    left: 0,
    right: 0,
    zIndex: 50,
  },
});
