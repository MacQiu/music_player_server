import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import CoverImage from '../../components/CoverImage';
import { useData } from '../../contexts/DataContext';
import { ping, getSongs, syncLogs, saveServerUrl, getBaseUrl } from '../../api/client';
import { Colors, Spacing, FontSize, Radius } from '../../constants/theme';

export default function SyncScreen() {
  const { online, setSongs, refreshAnalytics } = useData();
  const router = useRouter();
  const [serverOk, setServerOk] = useState<boolean | null>(online || null);
  const [syncOk, setSyncOk] = useState<boolean | null>(null);
  const [fetchResult, setFetchResult] = useState<{ ok: boolean; songs: any[] } | null>(null);
  const [loading, setLoading] = useState({ server: false, sync: false, fetch: false });

  const checkServer = async () => {
    setLoading(l => ({ ...l, server: true }));
    try { await ping(); setServerOk(true); }
    catch { setServerOk(false); }
    setLoading(l => ({ ...l, server: false }));
  };

  const doSync = async () => {
    setLoading(l => ({ ...l, sync: true }));
    try { await syncLogs([]); setSyncOk(true); }
    catch { setSyncOk(false); }
    setLoading(l => ({ ...l, sync: false }));
  };

  const fetchSongsAction = async () => {
    setLoading(l => ({ ...l, fetch: true }));
    try {
      const data = await getSongs();
      setSongs(data);
      setFetchResult({ ok: true, songs: data });
    } catch {
      setFetchResult({ ok: false, songs: [] });
    }
    setLoading(l => ({ ...l, fetch: false }));
  };

  const refreshAll = async () => {
    await checkServer();
    await fetchSongsAction();
    await refreshAnalytics();
  };

  const getStatusIcon = (loading: boolean, ok: boolean | null, defaultIcon: keyof typeof Ionicons.glyphMap) => {
    if (loading) return <ActivityIndicator size="small" color={Colors.accent} />;
    if (ok === true) return <Ionicons name="checkmark-circle" size={24} color={Colors.success} />;
    if (ok === false) return <Ionicons name="close-circle" size={24} color={Colors.danger} />;
    return <Ionicons name={defaultIcon} size={24} color={Colors.textMuted} />;
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
        <Text style={styles.heading}>Sync</Text>

        <View style={styles.rows}>
          <TouchableOpacity style={styles.row} onPress={checkServer} disabled={loading.server}>
            <View style={styles.rowIcon}>
              {getStatusIcon(loading.server, serverOk, 'information-circle')}
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Server Status</Text>
              <Text style={styles.rowSub}>
                {loading.server ? 'Checking...' : serverOk === true ? 'Server Online' : serverOk === false ? 'Server Offline' : 'Tap to check'}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.row} onPress={doSync} disabled={loading.sync}>
            <View style={styles.rowIcon}>
              {getStatusIcon(loading.sync, syncOk, 'sync')}
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Sync Status</Text>
              <Text style={styles.rowSub}>
                {loading.sync ? 'Syncing...' : syncOk === true ? 'Sync Complete' : syncOk === false ? 'Sync Failed' : 'Tap to sync'}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.row} onPress={fetchSongsAction} disabled={loading.fetch}>
            <View style={styles.rowIcon}>
              {getStatusIcon(loading.fetch, fetchResult?.ok ?? null, 'cloud-download')}
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Fetch Songs</Text>
              <Text style={styles.rowSub}>
                {loading.fetch ? 'Fetching...' : fetchResult?.ok ? `All Songs Up to Date (${fetchResult.songs.length})` : fetchResult && !fetchResult.ok ? 'Fetch Failed' : 'Tap to fetch'}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.row} onPress={refreshAll}>
            <View style={styles.rowIcon}>
              <Ionicons name="refresh" size={24} color={Colors.accent} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Refresh All</Text>
              <Text style={styles.rowSub}>Check server, fetch songs & analytics</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.row} onPress={() => router.push('/settings')}>
            <View style={styles.rowIcon}>
              <Ionicons name="settings" size={24} color={Colors.textMuted} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Server Settings</Text>
              <Text style={styles.rowSub} numberOfLines={1}>{getBaseUrl() || 'Not configured'}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.row} onPress={() => router.push('/upload')}>
            <View style={styles.rowIcon}>
              <Ionicons name="cloud-upload" size={24} color={Colors.textMuted} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Upload Song</Text>
              <Text style={styles.rowSub}>Upload audio and cover art</Text>
            </View>
          </TouchableOpacity>
        </View>

        {fetchResult?.ok && fetchResult.songs.length > 0 && (
          <View style={styles.songPreview}>
            {fetchResult.songs.slice(0, 8).map((s: any) => (
              <View key={s.id} style={styles.songPreviewRow}>
                <CoverImage coverUrl={s.cover_url} size={32} />
                <View style={styles.songPreviewInfo}>
                  <Text style={styles.songPreviewTitle} numberOfLines={1}>{s.title}</Text>
                  <Text style={styles.songPreviewArtist} numberOfLines={1}>{s.artist || 'Unknown'}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  page: { flex: 1 },
  pageContent: { padding: Spacing.lg },
  heading: { fontSize: FontSize.title, fontWeight: '700', color: Colors.text, marginBottom: Spacing.lg },
  rows: { gap: Spacing.md },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.lg,
    padding: Spacing.lg, backgroundColor: Colors.surface2,
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
  },
  rowIcon: { width: 28, alignItems: 'center' },
  rowText: { flex: 1 },
  rowTitle: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  rowSub: { fontSize: FontSize.sm, color: Colors.textMuted },
  songPreview: { marginTop: Spacing.lg, gap: Spacing.xs },
  songPreviewRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    padding: Spacing.sm, backgroundColor: Colors.surface2, borderRadius: Radius.sm,
  },
  songPreviewInfo: { flex: 1, minWidth: 0 },
  songPreviewTitle: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  songPreviewArtist: { fontSize: 11, color: Colors.textMuted },
});
