import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import CoverImage from '../../components/CoverImage';
import { useData } from '../../contexts/DataContext';
import { ping, getSongs, syncLogs, saveServerUrl, getBaseUrl } from '../../api/client';
import { enqueueLog, getQueueSize, flushAll } from '../../utils/playlogQueue';
import { Colors, Spacing, FontSize, Radius } from '../../constants/theme';

export default function SyncScreen() {
  const dataCtx = useData();
  const { online, setSongs, refreshAnalytics, updateLocalAnalytics, refreshAll: refreshAllData } = dataCtx;
  const songs = dataCtx.songs || [];
  const router = useRouter();
  const [serverOk, setServerOk] = useState<boolean | null>(online || null);
  const [syncOk, setSyncOk] = useState<boolean | null>(null);
  const [fetchResult, setFetchResult] = useState<{ ok: boolean; songs: any[] } | null>(null);
  const [loading, setLoading] = useState({ server: false, sync: false, fetch: false });
  const [devYear, setDevYear] = useState(new Date().getFullYear());
  const [devGenerating, setDevGenerating] = useState(false);
  const [devFlushing, setDevFlushing] = useState(false);
  const [devMsg, setDevMsg] = useState<string | null>(null);
  const [queueSize, setQueueSize] = useState<number>(0);

  const refreshQueueSize = useCallback(async () => {
    const size = await getQueueSize();
    setQueueSize(size);
  }, []);

  React.useEffect(() => { refreshQueueSize(); }, [refreshQueueSize]);

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
      const safeSongs = Array.isArray(data) ? data : [];
      setSongs(safeSongs);
      setFetchResult({ ok: true, songs: safeSongs });
    } catch {
      setFetchResult({ ok: false, songs: [] });
    }
    setLoading(l => ({ ...l, fetch: false }));
  };

  const refreshAllSync = async () => {
    await checkServer();
    await fetchSongsAction();
    await refreshAnalytics();
  };

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshAllData();
    await checkServer();
    setRefreshing(false);
  }, [refreshAllData]);

  const getStatusIcon = (loading: boolean, ok: boolean | null, defaultIcon: keyof typeof Ionicons.glyphMap) => {
    if (loading) return <ActivityIndicator size="small" color={Colors.accent} />;
    if (ok === true) return <Ionicons name="checkmark-circle" size={24} color={Colors.success} />;
    if (ok === false) return <Ionicons name="close-circle" size={24} color={Colors.danger} />;
    return <Ionicons name={defaultIcon} size={24} color={Colors.textMuted} />;
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}>
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

          <TouchableOpacity style={styles.row} onPress={refreshAllSync}>
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

        <View style={styles.devSection}>
          <Text style={styles.devHeading}>Dev Tools</Text>
          <Text style={styles.devSub}>Generate test data (same as desktop) & sync</Text>

          <View style={styles.devYearRow}>
            <Text style={styles.devYearLabel}>Year:</Text>
            {[devYear - 1, devYear, devYear + 1].map(y => (
              <TouchableOpacity key={y}
                style={[styles.devYearBtn, y === devYear && styles.devYearBtnActive]}
                onPress={() => setDevYear(y)}>
                <Text style={[styles.devYearBtnText, y === devYear && styles.devYearBtnTextActive]}>{y}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.devQueueInfo}>
            <Ionicons name="file-tray-stacked" size={20} color={Colors.textMuted} />
            <Text style={styles.devQueueText}>Pending queue: {queueSize} logs</Text>
            <TouchableOpacity onPress={refreshQueueSize}>
              <Ionicons name="refresh" size={18} color={Colors.accent} />
            </TouchableOpacity>
          </View>

          <View style={styles.devBtnRow}>
            <TouchableOpacity
              style={[styles.devBtn, styles.devBtnGenerate]}
              disabled={devGenerating || songs.length === 0}
              onPress={async () => {
                setDevGenerating(true);
                setDevMsg(null);
                try {
                  const count = 200;
                  const startDt = new Date(devYear - 1, 11, 1).getTime();
                  const endDt = new Date(devYear, 10, 30, 23, 59, 59).getTime();
                  const span = endDt - startDt;

                  const songCounts: Record<string, { song: any; plays: number; time: number }> = {};
                  const artistCounts: Record<string, { plays: number; time: number }> = {};
                  let totalTime = 0;

                  for (let i = 0; i < count; i++) {
                    const song = songs[Math.floor(Math.random() * songs.length)];
                    const duration = 30 + Math.random() * 210;
                    const ts = new Date(startDt + Math.random() * span).toISOString();
                    await enqueueLog(song.id, duration, ts);

                    if (!songCounts[song.id]) songCounts[song.id] = { song, plays: 0, time: 0 };
                    songCounts[song.id].plays++;
                    songCounts[song.id].time += duration;

                    const artist = song.artist || 'Unknown';
                    if (!artistCounts[artist]) artistCounts[artist] = { plays: 0, time: 0 };
                    artistCounts[artist].plays++;
                    artistCounts[artist].time += duration;

                    totalTime += duration;
                  }

                  const topSongs = Object.values(songCounts)
                    .sort((a, b) => b.plays - a.plays)
                    .slice(0, 10)
                    .map(s => ({ id: s.song.id, title: s.song.title, artist: s.song.artist, play_count: s.plays, total_time: s.time }));

                  const topArtists = Object.entries(artistCounts)
                    .sort((a, b) => b[1].plays - a[1].plays)
                    .slice(0, 10)
                    .map(([artist, d]) => ({ artist, play_count: d.plays, total_time: d.time }));

                  updateLocalAnalytics({
                    top_songs: topSongs,
                    top_artists: topArtists,
                    total_listening_time: totalTime,
                    total_plays: count,
                  });

                  await refreshQueueSize();
                  setDevMsg(`Generated ${count} playlogs for ${devYear}. Analytics updated locally.`);
                } catch { setDevMsg('Failed to generate test data'); }
                finally { setDevGenerating(false); }
              }}
            >
              {devGenerating
                ? <ActivityIndicator size="small" color="#000" />
                : <Text style={styles.devBtnText}>Generate Test Data</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.devBtn, styles.devBtnFlush]}
              disabled={devFlushing || queueSize === 0}
              onPress={async () => {
                setDevFlushing(true);
                setDevMsg(null);
                try {
                  await flushAll();
                  await refreshQueueSize();
                  await refreshAnalytics();
                  setDevMsg('Queue synced to server');
                } catch { setDevMsg('Sync failed (server offline?)'); }
                finally { setDevFlushing(false); }
              }}
            >
              {devFlushing
                ? <ActivityIndicator size="small" color="#000" />
                : <Text style={styles.devBtnText}>Sync to Server</Text>}
            </TouchableOpacity>
          </View>

          {devMsg && <Text style={styles.devMsg}>{devMsg}</Text>}
        </View>

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
    padding: Spacing.lg, backgroundColor: Colors.surface,
    borderWidth: 0, borderColor: 'transparent', borderRadius: Radius.md,
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
  devSection: {
    marginTop: Spacing.xl,
    padding: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
  },
  devHeading: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  devSub: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: Spacing.lg },
  devYearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  devYearLabel: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: '600' },
  devYearBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surface2,
  },
  devYearBtnActive: { backgroundColor: Colors.accent },
  devYearBtnText: { fontSize: FontSize.sm, color: Colors.text, fontWeight: '600' },
  devYearBtnTextActive: { color: '#000' },
  devQueueInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
    padding: Spacing.md,
    backgroundColor: Colors.surface2,
    borderRadius: Radius.sm,
  },
  devQueueText: { flex: 1, fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  devBtnRow: { flexDirection: 'row', gap: Spacing.md },
  devBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  devBtnGenerate: { backgroundColor: Colors.accent },
  devBtnFlush: { backgroundColor: Colors.accent },
  devBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: '#000' },
  devMsg: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: Spacing.md, textAlign: 'center' as const },
});
