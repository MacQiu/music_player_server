import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, FlatList, TextInput, StyleSheet, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import CoverImage from '../../components/CoverImage';
import { useData } from '../../contexts/DataContext';
import { usePlayer } from '../../contexts/PlayerContext';
import { createPlaylist, uploadArtistImage } from '../../api/client';
import { Colors, Spacing, FontSize, Radius } from '../../constants/theme';

function HorizontalCard({ title, coverUrl, songId, cacheKey, onPress, imgVersion, placeholder = '\u266A' }: any) {
  return (
    <TouchableOpacity style={styles.hCard} onPress={onPress} activeOpacity={0.7}>
      <CoverImage coverUrl={coverUrl} songId={songId} cacheKey={cacheKey} size={56} placeholder={placeholder} imgVersion={imgVersion} />
      <View style={styles.hCardInfo}>
        <Text style={styles.hCardTitle} numberOfLines={1}>{title}</Text>
      </View>
    </TouchableOpacity>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHdr}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

interface CardProps {
  title: string;
  subtitle: string;
  coverUrl?: string | null;
  songId?: string;
  cacheKey?: string;
  placeholder?: string;
  round?: boolean;
  onPress: () => void;
  imgVersion?: number;
  dashed?: boolean;
}

const CARD_WIDTH = 150;
const CARD_IMG_SIZE = CARD_WIDTH - Spacing.sm * 2;

function Card({ title, subtitle, coverUrl, songId, cacheKey, placeholder = '\u266A', round, onPress, imgVersion, dashed }: CardProps) {
  return (
    <TouchableOpacity style={[styles.card, dashed && styles.cardDashed]} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.cardImgWrap}>
        <CoverImage coverUrl={coverUrl} songId={songId} cacheKey={cacheKey} size={CARD_IMG_SIZE} round={round} placeholder={placeholder} imgVersion={imgVersion} />
      </View>
      <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
      <Text style={styles.cardSub} numberOfLines={1}>{subtitle}</Text>
    </TouchableOpacity>
  );
}

function CardRow({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardRow}>
      {children}
    </ScrollView>
  );
}

export default function HomeScreen() {
  const { songs, analytics, playlists, artists, imgVersion, bumpImgVersion, refreshPlaylists, refreshArtists, refreshAll } = useData();
  const { playSong } = usePlayer();
  const router = useRouter();
  const [showNewPlaylist, setShowNewPlaylist] = useState(false);
  const [newName, setNewName] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  }, [refreshAll]);

  const safeSongs = songs || [];

  const topTracks = useMemo(() => {
    const top = analytics?.top_songs ?? [];
    return top.slice(0, 8).map((t: any) => {
      const song = safeSongs.find(s => s.id === t.id);
      return song || { ...t };
    });
  }, [analytics, safeSongs]);

  const derivedArtists = useMemo(() => {
    if (artists && artists.length > 0) return artists;
    const map: Record<string, any> = {};
    safeSongs.forEach(s => {
      const key = s.artist || 'Unknown';
      if (!map[key]) map[key] = { name: key, song_count: 0, image_url: null };
      map[key].song_count++;
    });
    return Object.values(map);
  }, [artists, safeSongs]);

  const recommendations = analytics?.recommendations ?? [];
  const isPlaybackPlaylist = (name: string) => /^Your \d{4} Playback$/.test(name);
  const userPlaylists = useMemo(() => (playlists || []).filter((p: any) => !isPlaybackPlaylist(p.name)), [playlists]);
  const wrappedPlaylists = useMemo(() => (playlists || []).filter((p: any) => isPlaybackPlaylist(p.name)), [playlists]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await createPlaylist(name);
      setNewName('');
      setShowNewPlaylist(false);
      refreshPlaylists();
    } catch { }
  };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}>

        <LinearGradient colors={['rgba(29,185,84,0.3)', 'rgba(29,185,84,0.08)', 'transparent']}
          style={styles.greetingGradient}>
          <Text style={styles.greeting}>{greeting()}</Text>
        </LinearGradient>

        {topTracks.length > 0 && (
          <View style={styles.topGrid}>
            {topTracks.slice(0, 8).map((s: any) => (
              <HorizontalCard key={s.id} title={s.title}
                coverUrl={s.cover_url} songId={s.id} imgVersion={imgVersion}
                onPress={() => playSong(s, safeSongs)} />
            ))}
          </View>
        )}

        {topTracks.length === 0 && (
          <>
            <SectionHeader title="Recently Played" />
            <Text style={styles.muted}>No plays yet</Text>
          </>
        )}

        {derivedArtists.length > 0 && (
          <>
            <SectionHeader title="Artists" />
            <CardRow>
              {derivedArtists.map((a: any) => (
                <Card key={a.name} title={a.name}
                  subtitle={`${a.song_count} song${a.song_count !== 1 ? 's' : ''}`}
                  coverUrl={a.image_url} cacheKey={`artist_${a.name}`} round placeholder="\uD83C\uDFA4"
                  imgVersion={imgVersion}
                  onPress={() => router.push(`/artist/${encodeURIComponent(a.name)}`)} />
              ))}
            </CardRow>
          </>
        )}

        <SectionHeader title="Playlists" />
        <CardRow>
          {userPlaylists.map((p: any) => (
            <Card key={p.id} title={p.name}
              subtitle={`${p.song_count} song${p.song_count !== 1 ? 's' : ''}`}
              coverUrl={p.cover_url} cacheKey={`playlist_${p.id}`} imgVersion={imgVersion}
              onPress={() => router.push(`/playlist/${p.id}`)} />
          ))}
          <Card title="New Playlist" subtitle="" placeholder="+"
            dashed onPress={() => setShowNewPlaylist(true)} />
        </CardRow>
        {showNewPlaylist && (
          <View style={styles.inlineForm}>
            <TextInput style={styles.inlineInput} placeholder="Playlist name"
              placeholderTextColor={Colors.textMuted}
              value={newName} onChangeText={setNewName}
              onSubmitEditing={handleCreate} autoFocus />
            <TouchableOpacity style={styles.inlineBtn} onPress={handleCreate}>
              <Text style={styles.inlineBtnText}>Create</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowNewPlaylist(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {wrappedPlaylists.length > 0 && (
          <>
            <SectionHeader title="Wrapped" />
            <CardRow>
              {wrappedPlaylists.map((p: any) => (
                <Card key={p.id} title={p.name}
                  subtitle={`${p.song_count} song${p.song_count !== 1 ? 's' : ''}`}
                  coverUrl={p.cover_url} cacheKey={`playlist_${p.id}`} imgVersion={imgVersion} placeholder="\uD83C\uDF81"
                  onPress={() => router.push(`/playlist/${p.id}`)} />
              ))}
            </CardRow>
          </>
        )}

        {recommendations.length > 0 && (
          <>
            <SectionHeader title="Recommended" />
            <CardRow>
              {recommendations.map((r: any) => {
                const full = safeSongs.find(x => x.id === r.id);
                return (
                  <Card key={r.id} title={r.title} subtitle={r.artist || 'Unknown'}
                    coverUrl={r.cover_url} songId={r.id} imgVersion={imgVersion} placeholder="\u2605"
                    onPress={() => { if (full) playSong(full, safeSongs); }} />
                );
              })}
            </CardRow>
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  page: { flex: 1 },
  pageContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg },
  greetingGradient: {
    marginHorizontal: -Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
    marginBottom: Spacing.sm,
  },
  greeting: { fontSize: 28, fontWeight: '700', color: Colors.text },
  sectionHdr: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.xl, marginBottom: Spacing.md },
  sectionTitle: { fontSize: 22, fontWeight: '700', color: Colors.text },
  muted: { color: Colors.textMuted, fontSize: FontSize.sm },
  topGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: Spacing.md,
  },
  hCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: Radius.sm,
    overflow: 'hidden',
    width: '48.5%' as any,
    height: 56,
  },
  hCardInfo: { flex: 1, paddingHorizontal: Spacing.sm },
  hCardTitle: { fontSize: 12, fontWeight: '700', color: Colors.text },
  cardRow: { gap: Spacing.md, paddingBottom: Spacing.sm },
  card: {
    width: CARD_WIDTH,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    overflow: 'hidden',
    padding: Spacing.sm,
  },
  cardDashed: { borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.textMuted },
  cardImgWrap: { borderRadius: Radius.sm, overflow: 'hidden', marginBottom: Spacing.sm },
  cardTitle: { fontSize: 13, fontWeight: '600', color: Colors.text, marginBottom: 2 },
  cardSub: { fontSize: 11, color: Colors.textMuted },
  inlineForm: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm },
  inlineInput: {
    flex: 1, backgroundColor: Colors.surface2, borderRadius: Radius.sm,
    color: Colors.text, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, fontSize: FontSize.sm,
  },
  inlineBtn: { backgroundColor: Colors.accent, borderRadius: Radius.round, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  inlineBtnText: { color: '#000', fontSize: FontSize.sm, fontWeight: '700' },
  cancelText: { color: Colors.textMuted, fontSize: FontSize.sm },
});
