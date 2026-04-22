import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, FlatList, TextInput, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import CoverImage from '../../components/CoverImage';
import { useData } from '../../contexts/DataContext';
import { usePlayer } from '../../contexts/PlayerContext';
import { createPlaylist, uploadArtistImage } from '../../api/client';
import { Colors, Spacing, FontSize, Radius } from '../../constants/theme';

function CardRow({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardRow}>
      {children}
    </ScrollView>
  );
}

interface CardProps {
  title: string;
  subtitle: string;
  coverUrl?: string | null;
  placeholder?: string;
  round?: boolean;
  onPress: () => void;
  imgVersion?: number;
  dashed?: boolean;
}

function Card({ title, subtitle, coverUrl, placeholder = '\u266A', round, onPress, imgVersion, dashed }: CardProps) {
  return (
    <TouchableOpacity style={[styles.card, dashed && styles.cardDashed]} onPress={onPress} activeOpacity={0.7}>
      <CoverImage coverUrl={coverUrl} size={120} round={round} placeholder={placeholder} imgVersion={imgVersion} />
      <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
      <Text style={styles.cardSub} numberOfLines={1}>{subtitle}</Text>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const { songs, analytics, playlists, artists, imgVersion, bumpImgVersion, refreshPlaylists, refreshArtists } = useData();
  const { playSong } = usePlayer();
  const router = useRouter();
  const [showNewPlaylist, setShowNewPlaylist] = useState(false);
  const [newName, setNewName] = useState('');

  const recentlyPlayed = useMemo(() => {
    const top = analytics?.top_songs ?? [];
    return top.slice(0, 5).map((t: any) => {
      const song = songs.find(s => s.id === t.id);
      return song || { ...t };
    });
  }, [analytics, songs]);

  const derivedArtists = useMemo(() => {
    if (artists && artists.length > 0) return artists;
    const map: Record<string, any> = {};
    songs.forEach(s => {
      const key = s.artist || 'Unknown';
      if (!map[key]) map[key] = { name: key, song_count: 0, image_url: null };
      map[key].song_count++;
    });
    return Object.values(map);
  }, [artists, songs]);

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

  const handleArtistImageUpload = async (artistName: string) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    try {
      await uploadArtistImage(artistName, asset.uri, asset.fileName || 'image.jpg');
      refreshArtists();
      bumpImgVersion();
    } catch { }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
        <Text style={styles.heading}>Home</Text>

        <Text style={styles.sectionTitle}>Recently Played</Text>
        {recentlyPlayed.length === 0 ? (
          <Text style={styles.muted}>No plays yet</Text>
        ) : (
          <CardRow>
            {recentlyPlayed.map((s: any) => (
              <Card key={s.id} title={s.title} subtitle={s.artist || 'Unknown'}
                coverUrl={s.cover_url} imgVersion={imgVersion}
                onPress={() => playSong(s, songs)} />
            ))}
          </CardRow>
        )}

        <Text style={styles.sectionTitle}>Artists</Text>
        {derivedArtists.length === 0 ? (
          <Text style={styles.muted}>No artists yet</Text>
        ) : (
          <CardRow>
            {derivedArtists.map((a: any) => (
              <Card key={a.name} title={a.name}
                subtitle={`${a.song_count} song${a.song_count !== 1 ? 's' : ''}`}
                coverUrl={a.image_url} round placeholder="\uD83C\uDFA4"
                imgVersion={imgVersion}
                onPress={() => router.push(`/artist/${encodeURIComponent(a.name)}`)} />
            ))}
          </CardRow>
        )}

        <Text style={styles.sectionTitle}>Playlists</Text>
        <CardRow>
          {userPlaylists.map((p: any) => (
            <Card key={p.id} title={p.name}
              subtitle={`${p.song_count} song${p.song_count !== 1 ? 's' : ''}`}
              coverUrl={p.cover_url} imgVersion={imgVersion}
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
            <Text style={styles.sectionTitle}>Wrapped</Text>
            <CardRow>
              {wrappedPlaylists.map((p: any) => (
                <Card key={p.id} title={p.name}
                  subtitle={`${p.song_count} song${p.song_count !== 1 ? 's' : ''}`}
                  coverUrl={p.cover_url} imgVersion={imgVersion} placeholder="\uD83C\uDF81"
                  onPress={() => router.push(`/playlist/${p.id}`)} />
              ))}
            </CardRow>
          </>
        )}

        {recommendations.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Recommended</Text>
            <CardRow>
              {recommendations.map((r: any) => {
                const full = songs.find(x => x.id === r.id);
                return (
                  <Card key={r.id} title={r.title} subtitle={r.artist || 'Unknown'}
                    coverUrl={r.cover_url} imgVersion={imgVersion} placeholder="\u2605"
                    onPress={() => { if (full) playSong(full, songs); }} />
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
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  page: {
    flex: 1,
  },
  pageContent: {
    padding: Spacing.lg,
  },
  heading: {
    fontSize: FontSize.title,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: Colors.textMuted,
    marginBottom: Spacing.sm,
    marginTop: Spacing.lg,
  },
  muted: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
  },
  cardRow: {
    gap: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  card: {
    width: 140,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    overflow: 'hidden',
    alignItems: 'center',
  },
  cardDashed: {
    borderStyle: 'dashed',
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text,
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.xs,
    width: '100%',
  },
  cardSub: {
    fontSize: 11,
    color: Colors.textMuted,
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.sm,
    width: '100%',
  },
  inlineForm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  inlineInput: {
    flex: 1,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    color: Colors.text,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSize.sm,
  },
  inlineBtn: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  inlineBtnText: {
    color: Colors.white,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  cancelText: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
  },
});
