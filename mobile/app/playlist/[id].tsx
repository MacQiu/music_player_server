import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, Alert, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import CoverImage from '../../components/CoverImage';
import SongRow from '../../components/SongRow';
import { useData } from '../../contexts/DataContext';
import { usePlayer } from '../../contexts/PlayerContext';
import {
  getPlaylist, removeSongFromPlaylist, addSongToPlaylist,
  reorderPlaylistSongs, updatePlaylist, deletePlaylist,
} from '../../api/client';
import { Colors, Spacing, FontSize, Radius } from '../../constants/theme';

function fmtDuration(secs: number) {
  if (!secs) return '0:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function fmtListeningTime(secs: number) {
  if (!secs) return '0s';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  const parts: string[] = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

export default function PlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const dataCtx = useData();
  const songs = dataCtx.songs || [];
  const { refreshPlaylists, refreshSongs, imgVersion } = dataCtx;
  const { playSong, addToQueue } = usePlayer();
  const [playlist, setPlaylist] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showAddSongs, setShowAddSongs] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');

  const isWrapped = playlist?.is_wrapped || false;

  const fetchPlaylist = async () => {
    try {
      const data = await getPlaylist(id);
      setPlaylist(data);
      setNameValue(data.name);
    } catch { }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchPlaylist(); }, [id]);

  const handleRemoveSong = async (songId: string) => {
    await removeSongFromPlaylist(id, songId).catch(() => {});
    fetchPlaylist();
    refreshPlaylists();
  };

  const handleAddSong = async (songId: string) => {
    await addSongToPlaylist(id, songId).catch(() => {});
    fetchPlaylist();
    refreshPlaylists();
  };

  const handleRename = async () => {
    const name = nameValue.trim();
    if (!name || !playlist) return;
    await updatePlaylist(id, name).catch(() => {});
    setPlaylist({ ...playlist, name });
    setEditingName(false);
    refreshPlaylists();
  };

  const handleDelete = () => {
    Alert.alert('Delete Playlist', `Delete "${playlist?.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await deletePlaylist(id).catch(() => {});
          refreshPlaylists();
          router.back();
        },
      },
    ]);
  };

  const handlePlayAll = () => {
    if (!playlist || playlist.songs.length === 0) return;
    playSong(playlist.songs[0], playlist.songs);
  };

  const totalDuration = playlist?.songs?.reduce((acc: number, s: any) => acc + (s.duration || 0), 0) || 0;
  const playlistSongIds = new Set(playlist?.songs?.map((s: any) => s.id) || []);
  const availableSongs = songs.filter(s =>
    !playlistSongIds.has(s.id) &&
    (s.title.toLowerCase().includes(addSearch.toLowerCase()) ||
     (s.artist || '').toLowerCase().includes(addSearch.toLowerCase()))
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={Colors.text} />
          </TouchableOpacity>
        </View>
        <Text style={[styles.muted, { textAlign: 'center', marginTop: 40 }]}>Loading...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.hero}>
          <CoverImage coverUrl={playlist?.songs?.[0]?.cover_url} size={120} imgVersion={imgVersion} />
          <View style={styles.meta}>
            {!isWrapped && editingName ? (
              <TextInput style={styles.nameInput} value={nameValue}
                onChangeText={setNameValue} onSubmitEditing={handleRename}
                onBlur={handleRename} autoFocus />
            ) : (
              <TouchableOpacity onPress={isWrapped ? undefined : () => setEditingName(true)}>
                <Text style={styles.name}>{playlist?.name}</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.stats}>
              {playlist?.songs?.length || 0} tracks {'\u00B7'} {fmtDuration(totalDuration)}
            </Text>
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.playAllBtn} onPress={handlePlayAll}
            disabled={!playlist?.songs?.length}>
            <Ionicons name="play" size={18} color={Colors.white} />
            <Text style={styles.playAllText}>Play All</Text>
          </TouchableOpacity>
          {!isWrapped && (
            <>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => setShowAddSongs(!showAddSongs)}>
                <Ionicons name="add" size={18} color={Colors.text} />
                <Text style={styles.ghostBtnText}>Add</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.ghostBtn} onPress={handleDelete}>
                <Ionicons name="trash" size={18} color={Colors.danger} />
              </TouchableOpacity>
            </>
          )}
        </View>

        {!isWrapped && showAddSongs && (
          <View style={styles.addSection}>
            <View style={styles.addSearchBar}>
              <Ionicons name="search" size={16} color={Colors.textMuted} />
              <TextInput style={styles.addSearchInput} placeholder="Search songs to add..."
                placeholderTextColor={Colors.textMuted} value={addSearch} onChangeText={setAddSearch} />
            </View>
            {availableSongs.slice(0, 15).map(song => (
              <View key={song.id} style={styles.addItem}>
                <CoverImage coverUrl={song.cover_url} size={36} />
                <View style={styles.addItemInfo}>
                  <Text style={styles.addItemTitle} numberOfLines={1}>{song.title}</Text>
                  <Text style={styles.addItemArtist} numberOfLines={1}>{song.artist || 'Unknown'}</Text>
                </View>
                <TouchableOpacity style={styles.addBtn} onPress={() => handleAddSong(song.id)}>
                  <Ionicons name="add" size={20} color={Colors.accent} />
                </TouchableOpacity>
              </View>
            ))}
            {availableSongs.length === 0 && <Text style={styles.muted}>No songs to add</Text>}
          </View>
        )}

        <View style={styles.songList}>
          {(playlist?.songs || []).map((song: any, idx: number) => (
            <TouchableOpacity key={song.id} style={styles.songRow}
              onPress={() => playSong(song, playlist.songs)}>
              <CoverImage coverUrl={song.cover_url} size={44} imgVersion={imgVersion} />
              <View style={styles.songInfo}>
                <Text style={styles.songTitle} numberOfLines={1}>{song.title}</Text>
                <Text style={styles.songArtist} numberOfLines={1}>{song.artist || 'Unknown'}</Text>
              </View>
              {isWrapped ? (
                <View style={styles.songStats}>
                  <Text style={styles.statText}>{song.play_count || 0} plays</Text>
                  <Text style={styles.statText}>{fmtListeningTime(song.total_time)}</Text>
                </View>
              ) : (
                <View style={styles.songActions}>
                  <TouchableOpacity onPress={() => addToQueue(song)} style={styles.actionBtn}>
                    <Ionicons name="list" size={16} color={Colors.textMuted} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleRemoveSong(song.id)} style={styles.actionBtn}>
                    <Ionicons name="close" size={16} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>
              )}
            </TouchableOpacity>
          ))}
          {(!playlist?.songs || playlist.songs.length === 0) && (
            <Text style={[styles.muted, { textAlign: 'center', marginTop: 20 }]}>No songs in this playlist</Text>
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
  nameInput: {
    fontSize: FontSize.xl, fontWeight: '700', color: Colors.text,
    backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.accent,
    borderRadius: Radius.sm, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs,
  },
  stats: { fontSize: FontSize.sm, color: Colors.textMuted },
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
  ghostBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    padding: Spacing.sm,
  },
  ghostBtnText: { color: Colors.text, fontSize: FontSize.md },
  addSection: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  addSearchBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, paddingHorizontal: Spacing.md, marginBottom: Spacing.md,
  },
  addSearchInput: { flex: 1, color: Colors.text, fontSize: FontSize.md, paddingVertical: Spacing.sm },
  addItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xs },
  addItemInfo: { flex: 1, minWidth: 0 },
  addItemTitle: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  addItemArtist: { fontSize: 11, color: Colors.textMuted },
  addBtn: { padding: Spacing.sm },
  songList: { paddingHorizontal: Spacing.lg },
  songRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  songInfo: { flex: 1, minWidth: 0 },
  songTitle: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  songArtist: { fontSize: 11, color: Colors.textMuted },
  songStats: { alignItems: 'flex-end' },
  statText: { fontSize: 11, color: Colors.textMuted },
  songActions: { flexDirection: 'row', gap: Spacing.sm },
  actionBtn: { padding: Spacing.xs },
  muted: { color: Colors.textMuted, fontSize: FontSize.sm, padding: Spacing.md },
});
