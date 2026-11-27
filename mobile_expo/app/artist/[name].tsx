import React, { useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  Dimensions, FlatList,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import CoverImage from '../../components/CoverImage';
import { useData } from '../../contexts/DataContext';
import { usePlayer } from '../../contexts/PlayerContext';
import { uploadArtistImage } from '../../api/client';
import { Colors, Spacing, FontSize, Radius } from '../../constants/theme';

const SCREEN_W = Dimensions.get('window').width;
const HERO_H = SCREEN_W * 1.0;

export default function ArtistScreen() {
  const { name: rawName } = useLocalSearchParams<{ name: string }>();
  const artistName = decodeURIComponent(rawName || '');
  const router = useRouter();
  const dataCtx = useData();
  const songs = dataCtx.songs || [];
  const artists = dataCtx.artists || [];
  const playlists = dataCtx.playlists || [];
  const { imgVersion, refreshArtists, bumpImgVersion } = dataCtx;
  const { playSong, addToQueue } = usePlayer();
  const [uploading, setUploading] = useState(false);
  const [showAllTracks, setShowAllTracks] = useState(false);

  const artist = artists.find((a: any) => a.name === artistName);
  const artistSongs = useMemo(
    () => songs.filter(s => s.artist === artistName),
    [songs, artistName],
  );

  const albumGroups = useMemo(() => {
    const map = new Map<string, any[]>();
    artistSongs.forEach(s => {
      const key = s.album || 'Singles';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    });
    return Array.from(map.entries()).map(([album, tracks]) => ({
      album, tracks, cover: tracks[0]?.cover_url,
    }));
  }, [artistSongs]);

  const popularTracks = useMemo(() => {
    return [...artistSongs]
      .sort((a, b) => (b.play_count || 0) - (a.play_count || 0))
      .slice(0, showAllTracks ? 20 : 5);
  }, [artistSongs, showAllTracks]);

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
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Hero */}
        <TouchableOpacity activeOpacity={0.9} onPress={handleImageUpload}>
          <View style={styles.heroWrap}>
            {artist?.image_url ? (
              <CoverImage coverUrl={artist.image_url} size={SCREEN_W}
                imgVersion={imgVersion} style={styles.heroImage} />
            ) : (
              <View style={[styles.heroImage, styles.heroPlaceholder]}>
                <Ionicons name="person" size={80} color={Colors.textMuted} />
              </View>
            )}
            <LinearGradient colors={['transparent', 'transparent', 'rgba(0,0,0,0.6)', Colors.bg]}
              locations={[0, 0.35, 0.7, 1]}
              style={styles.heroOverlay} />
            <View style={styles.heroContent}>
              <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                <Ionicons name="chevron-back" size={24} color={Colors.text} />
              </TouchableOpacity>
              <View style={styles.heroBottom}>
                <Text style={styles.heroName}>{artistName}</Text>
                <Text style={styles.heroStat}>
                  {artistSongs.length} track{artistSongs.length !== 1 ? 's' : ''}
                </Text>
              </View>
            </View>
            {uploading && (
              <View style={styles.uploadBanner}>
                <Text style={styles.uploadText}>Uploading image...</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>

        {/* Controls */}
        <View style={styles.controlsRow}>
          <TouchableOpacity style={styles.fabPlay} onPress={handlePlayAll}
            disabled={artistSongs.length === 0}>
            <Ionicons name="play" size={28} color="#000" />
          </TouchableOpacity>
        </View>

        {/* Popular Tracks */}
        {popularTracks.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Popular</Text>
            {popularTracks.map((song, idx) => (
              <TouchableOpacity key={song.id} style={styles.songRow}
                onPress={() => playSong(song, artistSongs)}>
                <Text style={styles.trackNum}>{idx + 1}</Text>
                <CoverImage coverUrl={song.cover_url} size={44} imgVersion={imgVersion} />
                <View style={styles.songInfo}>
                  <Text style={styles.songTitle} numberOfLines={1}>{song.title}</Text>
                  <Text style={styles.songArtist} numberOfLines={1}>
                    {song.play_count ? `${song.play_count} plays` : song.album || 'Unknown'}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => addToQueue(song)} style={styles.moreBtn}>
                  <Ionicons name="ellipsis-horizontal" size={18} color={Colors.textMuted} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
            {artistSongs.length > 5 && (
              <TouchableOpacity style={styles.showMoreBtn}
                onPress={() => setShowAllTracks(!showAllTracks)}>
                <Text style={styles.showMoreText}>
                  {showAllTracks ? 'Show less' : `Show all ${artistSongs.length} tracks`}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* From This Artist - Album Groups */}
        {albumGroups.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>From this artist</Text>
            <FlatList horizontal data={albumGroups} showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => item.album}
              contentContainerStyle={{ paddingHorizontal: Spacing.lg, gap: Spacing.md }}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.albumCard}
                  onPress={() => {
                    if (item.tracks.length > 0) playSong(item.tracks[0], item.tracks);
                  }}>
                  <View style={styles.albumCoverWrap}>
                    <CoverImage coverUrl={item.cover} size={140} imgVersion={imgVersion} />
                  </View>
                  <Text style={styles.albumTitle} numberOfLines={1}>{item.album}</Text>
                  <Text style={styles.albumSub}>{item.tracks.length} songs</Text>
                </TouchableOpacity>
              )} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  heroWrap: { width: SCREEN_W, height: HERO_H, position: 'relative' },
  heroImage: { width: SCREEN_W, height: HERO_H, resizeMode: 'cover' as any },
  heroPlaceholder: {
    backgroundColor: Colors.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  heroOverlay: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: HERO_H,
  },
  heroContent: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'space-between',
  },
  backBtn: { padding: Spacing.lg, paddingTop: 48 },
  heroBottom: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
  heroName: { fontSize: 42, fontWeight: '900', color: Colors.text },
  heroStat: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  uploadBanner: {
    position: 'absolute', top: 48, right: Spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs,
  },
  uploadText: { color: Colors.text, fontSize: FontSize.xs },
  controlsRow: {
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  fabPlay: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  section: { marginBottom: Spacing.xl },
  sectionTitle: {
    fontSize: FontSize.lg, fontWeight: '700', color: Colors.text,
    paddingHorizontal: Spacing.lg, marginBottom: Spacing.md,
  },
  songRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
  },
  trackNum: {
    width: 24, fontSize: FontSize.md, color: Colors.textMuted, textAlign: 'center',
  },
  songInfo: { flex: 1, minWidth: 0 },
  songTitle: { fontSize: FontSize.md, fontWeight: '500', color: Colors.text },
  songArtist: { fontSize: 11, color: Colors.textMuted },
  moreBtn: { padding: Spacing.sm },
  showMoreBtn: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
  showMoreText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textMuted },
  albumCard: { width: 140 },
  albumCoverWrap: { borderRadius: Radius.sm, overflow: 'hidden', marginBottom: Spacing.sm },
  albumTitle: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  albumSub: { fontSize: 11, color: Colors.textMuted },
});
