import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import CoverImage from '../../components/CoverImage';
import { useData } from '../../contexts/DataContext';
import { usePlayer } from '../../contexts/PlayerContext';
import { uploadArtistImage } from '../../api/client';
import { Colors, Spacing, FontSize, Radius } from '../../constants/theme';

export default function ArtistScreen() {
  const { name: rawName } = useLocalSearchParams<{ name: string }>();
  const artistName = decodeURIComponent(rawName || '');
  const router = useRouter();
  const dataCtx = useData();
  const songs = dataCtx.songs || [];
  const artists = dataCtx.artists || [];
  const { imgVersion, refreshArtists, bumpImgVersion } = dataCtx;
  const { playSong, addToQueue } = usePlayer();
  const [uploading, setUploading] = useState(false);

  const artist = artists.find((a: any) => a.name === artistName);
  const artistSongs = useMemo(
    () => songs.filter(s => s.artist === artistName),
    [songs, artistName],
  );

  const handleImageUpload = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    setUploading(true);
    try {
      const asset = result.assets[0];
      await uploadArtistImage(artistName, asset.uri, asset.fileName || 'image.jpg');
      refreshArtists();
      bumpImgVersion();
    } catch { }
    finally { setUploading(false); }
  };

  const handlePlayAll = () => {
    if (artistSongs.length === 0) return;
    playSong(artistSongs[0], artistSongs);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.hero}>
          <TouchableOpacity onPress={handleImageUpload}>
            <CoverImage coverUrl={artist?.image_url} size={120} round
              placeholder="\uD83C\uDFA4" imgVersion={imgVersion} />
            {uploading && (
              <View style={styles.uploadOverlay}>
                <Text style={styles.uploadText}>...</Text>
              </View>
            )}
          </TouchableOpacity>
          <View style={styles.meta}>
            <Text style={styles.name}>{artistName}</Text>
            <Text style={styles.stats}>
              {artistSongs.length} track{artistSongs.length !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.playAllBtn} onPress={handlePlayAll}
            disabled={artistSongs.length === 0}>
            <Ionicons name="play" size={18} color={Colors.white} />
            <Text style={styles.playAllText}>Play All</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.songList}>
          {artistSongs.map((song) => (
            <TouchableOpacity key={song.id} style={styles.songRow}
              onPress={() => playSong(song, artistSongs)}>
              <CoverImage coverUrl={song.cover_url} size={44} imgVersion={imgVersion} />
              <View style={styles.songInfo}>
                <Text style={styles.songTitle} numberOfLines={1}>{song.title}</Text>
                <Text style={styles.songArtist} numberOfLines={1}>{song.album || 'Unknown Album'}</Text>
              </View>
              <TouchableOpacity onPress={() => addToQueue(song)} style={styles.actionBtn}>
                <Ionicons name="list" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
          {artistSongs.length === 0 && (
            <Text style={[styles.muted, { textAlign: 'center', marginTop: 20 }]}>No songs by this artist</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  headerBar: { padding: Spacing.md },
  hero: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg },
  meta: { flex: 1 },
  name: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text, marginBottom: Spacing.xs },
  stats: { fontSize: FontSize.sm, color: Colors.textMuted },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadText: { color: Colors.white, fontSize: FontSize.lg },
  actions: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg,
  },
  playAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.accent, borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
  },
  playAllText: { color: Colors.white, fontWeight: '600', fontSize: FontSize.md },
  songList: { paddingHorizontal: Spacing.lg },
  songRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  songInfo: { flex: 1, minWidth: 0 },
  songTitle: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  songArtist: { fontSize: 11, color: Colors.textMuted },
  actionBtn: { padding: Spacing.xs },
  muted: { color: Colors.textMuted, fontSize: FontSize.sm },
});
