import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { Stack } from 'expo-router';
import { PlayerProvider } from '../contexts/PlayerContext';
import { DataProvider } from '../contexts/DataContext';
import { loadServerUrl, saveServerUrl, getBaseUrl } from '../api/client';
import { Colors, Spacing, FontSize, Radius } from '../constants/theme';

function ServerSetup({ onDone }: { onDone: () => void }) {
  const [url, setUrl] = useState('');

  return (
    <View style={styles.setup}>
      <Text style={styles.setupTitle}>KillerTunes</Text>
      <Text style={styles.setupSub}>Enter your server address</Text>
      <TextInput
        style={styles.setupInput}
        value={url}
        onChangeText={setUrl}
        placeholder="http://192.168.1.100:5000"
        placeholderTextColor={Colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      <TouchableOpacity
        style={[styles.setupBtn, !url.trim() && styles.setupBtnDisabled]}
        onPress={async () => {
          if (!url.trim()) return;
          await saveServerUrl(url.trim());
          onDone();
        }}
        disabled={!url.trim()}
      >
        <Text style={styles.setupBtnText}>Connect</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [hasServer, setHasServer] = useState(false);

  useEffect(() => {
    loadServerUrl().then(url => {
      setHasServer(!!url);
      setReady(true);
    });
  }, []);

  if (!ready) return null;

  if (!hasServer) {
    return (
      <>
        <StatusBar barStyle="light-content" />
        <ServerSetup onDone={() => setHasServer(true)} />
      </>
    );
  }

  return (
    <PlayerProvider>
      <DataProvider>
        <StatusBar barStyle="light-content" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: Colors.bg },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="playlist/[id]"
            options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen
            name="artist/[name]"
            options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen
            name="player"
            options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen
            name="queue"
            options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen
            name="lyrics"
            options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen
            name="upload"
            options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen
            name="settings"
            options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
          />
        </Stack>
      </DataProvider>
    </PlayerProvider>
  );
}

const styles = StyleSheet.create({
  setup: {
    flex: 1,
    backgroundColor: Colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xxl,
  },
  setupTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  setupSub: {
    fontSize: FontSize.md,
    color: Colors.textMuted,
    marginBottom: Spacing.xxl,
  },
  setupInput: {
    width: '100%',
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    color: Colors.text,
    fontSize: FontSize.md,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  setupBtn: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xxl,
  },
  setupBtnDisabled: {
    opacity: 0.5,
  },
  setupBtnText: {
    color: Colors.white,
    fontSize: FontSize.lg,
    fontWeight: '600',
  },
});
