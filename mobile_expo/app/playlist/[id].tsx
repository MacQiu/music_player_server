import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, Alert, StyleSheet, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import CoverImage from '../../components/CoverImage';
import SongRow from '../../components/SongRow';
import SelectionBar, { SelectionAction } from '../../components/SelectionBar';
import { useData } from '../../contexts/DataContext';
import { usePlayer } from '../../contexts/PlayerContext';
import {
  getPlaylist, removeSongFromPlaylist, addSongToPlaylist,
  reorderPlaylistSongs, updatePlaylist, deletePlaylist, toggleDownload,
} from '../../api/client';
import { downloadSong, deleteSongLocal } from '../../utils/songStorage';
import { useMultiSelect } from '../../hooks/useMultiSelect';
import { Colors, Spacing, FontSize, Radius } from '../../constants/theme';

function fmtDuration(secs: number) {
  if (!secs) return '0:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h) return `${h}h ${m}m`;
  return `${m} min ${s} sec`;
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
  const [menuSong, setMenuSong] = useState<any>(null);
  const [menuIndex, setMenuIndex] = useState(-1);
  const [batchBusy, setBatchBusy] = useState(false);
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const multiSelect = useMultiSelect();

  const isWrapped = playlist?.is_wrapped || false;
  const allPlaylists = dataCtx.playlists || [];
  const otherPlaylists = useMemo(() => allPlaylists.filter((p: any) => p.id !== id), [allPlaylists, id]);
  const playlistSongIdList = useMemo(() => (playlist?.songs || []).map((s: any) => s.id), [playlist]);

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

  const handleMoveSong = async (fromIdx: number, toIdx: number) => {
    if (!playlist?.songs || toIdx < 0 || toIdx >= playlist.songs.length) return;
    const newOrder = [...playlist.songs];
    const [moved] = newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, moved);
    setPlaylist({ ...playlist, songs: newOrder });
    setMenuSong(null);
    await reorderPlaylistSongs(id, newOrder.map((s: any) => s.id)).catch(() => {});
    fetchPlaylist();
  };

  const handleDragEnd = useCallback(({ data }: { data: any[] }) => {
    setPlaylist((prev: any) => prev ? { ...prev, songs: data } : prev);
    reorderPlaylistSongs(id, data.map((s: any) => s.id)).catch(() => {});
  }, [id]);

  const openSongMenu = (song: any, idx: number) => {
    setMenuSong(song);
    setMenuIndex(idx);
  };

  const handleBatchAction = useCallback(async (action: SelectionAction) => {
    const ids = Array.from(multiSelect.selectedIds);
    if (ids.length === 0) return;

    if (action === 'addToPlaylist') {
      setShowPlaylistPicker(true);
      return;
    }

    setBatchBusy(true);
    try {
      if (action === 'removeFromPlaylist') {
        for (const songId of ids) {
          await removeSongFromPlaylist(id, songId).catch(() => {});
        }
        fetchPlaylist();
        refreshPlaylists();
      } else if (action === 'download') {
        const allSongs = dataCtx.songs || [];
        for (const songId of ids) {
          const song = allSongs.find((s: any) => s.id === songId) || playlist?.songs?.find((s: any) => s.id === songId);
          if (song && !song.downloaded) {
            await downloadSong(songId, song.file_path, song.cover_url || undefined).catch(() => {});
            await toggleDownload(songId, true).catch(() => {});
          }
        }
        refreshSongs();
      } else if (action === 'deleteLocal') {
        const allSongs = dataCtx.songs || [];
        for (const songId of ids) {
          const song = allSongs.find((s: any) => s.id === songId) || playlist?.songs?.find((s: any) => s.id === songId);
          if (song?.downloaded) {
            await deleteSongLocal(songId, song.file_path).catch(() => {});
            await toggleDownload(songId, false).catch(() => {});
          }
        }
        refreshSongs();
      }
      multiSelect.exitSelectionMode();
    } catch {
      Alert.alert('Error', 'Some operations failed.');
    } finally {
      setBatchBusy(false);
    }
  }, [multiSelect, id, playlist, dataCtx.songs, refreshPlaylists, refreshSongs]);

  const handleBatchAddToOtherPlaylist = useCallback(async (targetPlaylistId: string) => {
    const ids = Array.from(multiSelect.selectedIds);
    setBatchBusy(true);
    try {
      for (const songId of ids) {
        await addSongToPlaylist(targetPlaylistId, songId).catch(() => {});
      }
      multiSelect.exitSelectionMode();
    } catch {} finally {
      setBatchBusy(false);
      setShowPlaylistPicker(false);
    }
  }, [multiSelect]);

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

  const renderDraggableItem = useCallback(({ item: song, drag, isActive: isDragActive }: RenderItemParams<any>) => (
    <ScaleDecorator>
      <TouchableOpacity
        style={[styles.songRow, { paddingHorizontal: Spacing.lg, opacity: isDragActive ? 0.7 : 1,
          backgroundColor: isDragActive ? Colors.surface2 : 'transparent' }]}
        onLongPress={drag}
        delayLongPress={100}
        disabled={isDragActive}
      >
        <Ionicons name="reorder-three" size={22} color={Colors.textMuted} style={{ marginRight: Spacing.xs }} />
        <CoverImage coverUrl={song.cover_url} size={44} imgVersion={imgVersion} />
        <View style={styles.songInfo}>
          <Text style={styles.songTitle} numberOfLines={1}>{song.title}</Text>
          <Text style={styles.songArtist} numberOfLines={1}>{song.artist || 'Unknown'}</Text>
        </View>
      </TouchableOpacity>
    </ScaleDecorator>
  ), [imgVersion]);

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

  const renderHeader = () => (
    <>
      <LinearGradient colors={['#333333', '#222222', Colors.bg]} locations={[0, 0.6, 1]} style={styles.heroGradient}>
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={Colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.hero}>
          <View style={styles.coverWrap}>
            <CoverImage coverUrl={playlist?.songs?.[0]?.cover_url} size={200} imgVersion={imgVersion} />
          </View>

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
            {playlist?.songs?.length || 0} songs {'\u00B7'} {fmtDuration(totalDuration)}
          </Text>
        </View>
      </LinearGradient>

      <View style={styles.controlsRow}>
        <View style={styles.controlsLeft}>
          {!isWrapped && (
            <>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => setShowAddSongs(!showAddSongs)}>
                <Ionicons name="add-circle-outline" size={28} color={Colors.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => setEditMode(!editMode)}>
                <Ionicons name={editMode ? 'checkmark-circle' : 'pencil-outline'} size={24}
                  color={editMode ? Colors.accent : Colors.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.ghostBtn} onPress={handleDelete}>
                <Ionicons name="trash-outline" size={24} color={Colors.textMuted} />
              </TouchableOpacity>
            </>
          )}
        </View>
        <TouchableOpacity style={styles.fabPlay} onPress={handlePlayAll}
          disabled={!playlist?.songs?.length}>
          <Ionicons name="play" size={28} color="#000" />
        </TouchableOpacity>
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

      {editMode && (
        <View style={styles.editBanner}>
          <Ionicons name="reorder-three" size={20} color={Colors.textMuted} />
          <Text style={styles.editBannerText}>Drag to reorder songs</Text>
          <TouchableOpacity onPress={() => setEditMode(false)}>
            <Text style={styles.editDoneText}>Done</Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );

  const renderSongList = () => (
    <View style={styles.songList}>
      {(playlist?.songs || []).map((song: any, idx: number) => {
        const inSelectMode = multiSelect.selectionMode;
        const isSelected = multiSelect.isSelected(song.id);

        return (
          <TouchableOpacity key={song.id}
            style={[styles.songRow, inSelectMode && isSelected && styles.songRowSelected]}
            onPress={inSelectMode ? () => multiSelect.toggleSelection(song.id) : () => playSong(song, playlist.songs)}
            onLongPress={!isWrapped ? () => multiSelect.enterSelectionMode(song.id) : undefined}>
            {inSelectMode && (
              <View style={[styles.selectCircle, isSelected && styles.selectCircleChecked]}>
                {isSelected && <Ionicons name="checkmark" size={14} color="#000" />}
              </View>
            )}
            <CoverImage coverUrl={song.cover_url} size={44} imgVersion={imgVersion} />
            <View style={styles.songInfo}>
              <Text style={styles.songTitle} numberOfLines={1}>{song.title}</Text>
              <Text style={styles.songArtist} numberOfLines={1}>{song.artist || 'Unknown'}</Text>
            </View>
            {!inSelectMode && isWrapped && (
              <View style={styles.songStats}>
                <Text style={styles.statText}>{song.play_count || 0} plays</Text>
                <Text style={styles.statText}>{fmtListeningTime(song.total_time)}</Text>
              </View>
            )}
            {!inSelectMode && !isWrapped && (
              <TouchableOpacity onPress={() => openSongMenu(song, idx)} style={styles.actionBtn}>
                <Ionicons name="ellipsis-horizontal" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        );
      })}
      {(!playlist?.songs || playlist.songs.length === 0) && (
        <Text style={[styles.muted, { textAlign: 'center', marginTop: 20 }]}>No songs in this playlist</Text>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      {editMode && !isWrapped ? (
        <GestureHandlerRootView style={{ flex: 1 }}>
          <DraggableFlatList
            data={playlist?.songs || []}
            keyExtractor={(item: any) => item.id}
            renderItem={renderDraggableItem}
            onDragEnd={handleDragEnd}
            ListHeaderComponent={renderHeader}
            contentContainerStyle={{ paddingBottom: 40 }}
          />
        </GestureHandlerRootView>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {renderHeader()}
          {renderSongList()}
        </ScrollView>
      )}

      {multiSelect.selectionMode && !isWrapped && (
        <SelectionBar
          selectedCount={multiSelect.selectedCount}
          totalCount={playlistSongIdList.length}
          actions={['removeFromPlaylist', 'addToPlaylist', 'download', 'deleteLocal']}
          onAction={handleBatchAction}
          onSelectAll={() => multiSelect.selectAll(playlistSongIdList)}
          onDeselectAll={() => multiSelect.clearSelection()}
          onClose={() => multiSelect.exitSelectionMode()}
        />
      )}

      <Modal visible={showPlaylistPicker} transparent animationType="fade" onRequestClose={() => setShowPlaylistPicker(false)}>
        <TouchableOpacity style={styles.menuBackdrop} onPress={() => setShowPlaylistPicker(false)} activeOpacity={1}>
          <View style={styles.menuSheet}>
            <Text style={styles.menuTitle}>Add {multiSelect.selectedCount} song{multiSelect.selectedCount !== 1 ? 's' : ''} to...</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {otherPlaylists.map((p: any) => (
                <TouchableOpacity key={p.id} style={styles.menuItem}
                  onPress={() => handleBatchAddToOtherPlaylist(p.id)} disabled={batchBusy}>
                  <Ionicons name="musical-notes" size={20} color={Colors.accent} />
                  <Text style={styles.menuItemText}>{p.name}</Text>
                </TouchableOpacity>
              ))}
              {otherPlaylists.length === 0 && <Text style={styles.muted}>No other playlists</Text>}
            </ScrollView>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={() => setShowPlaylistPicker(false)}>
              <Text style={[styles.menuItemText, { color: Colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={!!menuSong && !multiSelect.selectionMode} transparent animationType="fade" onRequestClose={() => setMenuSong(null)}>
        <TouchableOpacity style={styles.menuBackdrop} onPress={() => setMenuSong(null)} activeOpacity={1}>
          <View style={styles.menuSheet}>
            <Text style={styles.menuTitle} numberOfLines={1}>{menuSong?.title}</Text>

            <TouchableOpacity style={styles.menuItem} onPress={() => {
              if (menuSong) { playSong(menuSong, playlist?.songs || []); setMenuSong(null); }
            }}>
              <Ionicons name="play" size={20} color={Colors.text} />
              <Text style={styles.menuItemText}>Play Now</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={() => {
              if (menuSong) { addToQueue(menuSong); setMenuSong(null); }
            }}>
              <Ionicons name="list" size={20} color={Colors.text} />
              <Text style={styles.menuItemText}>Add to Queue</Text>
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            <TouchableOpacity style={styles.menuItem}
              disabled={menuIndex <= 0}
              onPress={() => handleMoveSong(menuIndex, menuIndex - 1)}>
              <Ionicons name="arrow-up" size={20} color={menuIndex <= 0 ? Colors.surface3 : Colors.text} />
              <Text style={[styles.menuItemText, menuIndex <= 0 && { color: Colors.surface3 }]}>Move Up</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem}
              disabled={menuIndex >= (playlist?.songs?.length || 0) - 1}
              onPress={() => handleMoveSong(menuIndex, menuIndex + 1)}>
              <Ionicons name="arrow-down" size={20}
                color={menuIndex >= (playlist?.songs?.length || 0) - 1 ? Colors.surface3 : Colors.text} />
              <Text style={[styles.menuItemText, menuIndex >= (playlist?.songs?.length || 0) - 1 && { color: Colors.surface3 }]}>
                Move Down
              </Text>
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            <TouchableOpacity style={styles.menuItem} onPress={() => {
              if (menuSong) {
                Alert.alert('Remove Song', `Remove "${menuSong.title}" from this playlist?`, [
                  { text: 'Cancel', style: 'cancel', onPress: () => setMenuSong(null) },
                  { text: 'Remove', style: 'destructive', onPress: () => { handleRemoveSong(menuSong.id); setMenuSong(null); } },
                ]);
              }
            }}>
              <Ionicons name="trash-outline" size={20} color="#ef4444" />
              <Text style={[styles.menuItemText, { color: '#ef4444' }]}>Remove from Playlist</Text>
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            <TouchableOpacity style={styles.menuItem} onPress={() => setMenuSong(null)}>
              <Text style={[styles.menuItemText, { color: Colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  headerBar: { padding: Spacing.md },
  heroGradient: { paddingBottom: Spacing.lg },
  hero: { alignItems: 'center', paddingHorizontal: Spacing.xl },
  coverWrap: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
    marginBottom: Spacing.lg,
  },
  name: {
    fontSize: 24, fontWeight: '700', color: Colors.text, textAlign: 'center', marginBottom: Spacing.xs,
  },
  nameInput: {
    fontSize: 20, fontWeight: '700', color: Colors.text, textAlign: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, width: '100%',
  },
  stats: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center' },
  controlsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  controlsLeft: { flexDirection: 'row', gap: Spacing.lg },
  ghostBtn: { padding: Spacing.xs },
  fabPlay: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  addSection: {
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  addSearchBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface2, borderRadius: Radius.round,
    paddingHorizontal: Spacing.md, marginBottom: Spacing.md,
  },
  addSearchInput: { flex: 1, color: Colors.text, fontSize: FontSize.md, paddingVertical: Spacing.sm },
  addItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xs },
  addItemInfo: { flex: 1, minWidth: 0 },
  addItemTitle: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  addItemArtist: { fontSize: 11, color: Colors.textMuted },
  addBtn: { padding: Spacing.sm },
  editBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    backgroundColor: Colors.surface2, marginHorizontal: Spacing.lg,
    borderRadius: Radius.sm, marginBottom: Spacing.sm,
  },
  editBannerText: { flex: 1, fontSize: FontSize.sm, color: Colors.textMuted },
  editDoneText: { fontSize: FontSize.md, fontWeight: '700', color: Colors.accent },
  songList: { paddingHorizontal: Spacing.lg },
  songRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: Spacing.sm, borderRadius: Radius.sm,
  },
  songRowSelected: {
    backgroundColor: 'rgba(29,185,84,0.1)',
  },
  selectCircle: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: Colors.textMuted,
    alignItems: 'center' as const, justifyContent: 'center' as const,
  },
  selectCircleChecked: {
    backgroundColor: Colors.accent, borderColor: Colors.accent,
  },
  songInfo: { flex: 1, minWidth: 0 },
  songTitle: { fontSize: FontSize.md, fontWeight: '500', color: Colors.text },
  songArtist: { fontSize: 11, color: Colors.textMuted },
  songStats: { alignItems: 'flex-end' },
  statText: { fontSize: 11, color: Colors.textMuted },
  actionBtn: { padding: Spacing.sm },
  muted: { color: Colors.textMuted, fontSize: FontSize.sm, padding: Spacing.md },
  menuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  menuSheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg,
    paddingVertical: Spacing.lg, paddingHorizontal: Spacing.lg, maxHeight: '70%',
  },
  menuTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text, marginBottom: Spacing.lg, textAlign: 'center' },
  menuItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: Spacing.md, paddingVertical: Spacing.md },
  menuItemText: { fontSize: FontSize.md, color: Colors.text },
  menuDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: Spacing.sm },
});
