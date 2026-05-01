import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, Modal, RefreshControl, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import SongRow from '../../components/SongRow';
import SelectionBar, { SelectionAction } from '../../components/SelectionBar';
import CoverImage from '../../components/CoverImage';
import { useData } from '../../contexts/DataContext';
import { usePlayer, Song } from '../../contexts/PlayerContext';
import { uploadCover, addSongToPlaylist, reorderLibrary, toggleDownload } from '../../api/client';
import { downloadSong, deleteSongLocal } from '../../utils/songStorage';
import { useMultiSelect } from '../../hooks/useMultiSelect';
import { Colors, Spacing, FontSize, Radius } from '../../constants/theme';

function sortSongs(list: Song[], field: string, dir: string) {
  const cmp = (a: any, b: any) => {
    let va = a[field], vb = b[field];
    if (field === 'duration') {
      va = va ?? -Infinity; vb = vb ?? -Infinity;
      return dir === 'asc' ? va - vb : vb - va;
    }
    va = (va || '').toLowerCase(); vb = (vb || '').toLowerCase();
    const r = va.localeCompare(vb);
    return dir === 'asc' ? r : -r;
  };
  return [...list].sort(cmp);
}

type FilterType = 'all' | 'playlists' | 'artists' | 'wrapped' | 'songs';

export default function LibraryScreen() {
  const data = useData();
  const songs = data.songs || [];
  const playlists = data.playlists || [];
  const artists = data.artists || [];
  const { imgVersion, bumpImgVersion, refreshSongs, refreshAll } = data;
  const { playSong, addToQueue } = usePlayer();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState('asc');
  const [menuSong, setMenuSong] = useState<Song | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);
  const multiSelect = useMultiSelect();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  }, [refreshAll]);

  const isPlaybackPlaylist = (name: string) => /^Your \d{4} Playback$/.test(name);

  const mixedItems = useMemo(() => {
    const q = search.toLowerCase();
    const items: any[] = [];

    if (filter === 'all' || filter === 'playlists') {
      (playlists || []).filter((p: any) => !isPlaybackPlaylist(p.name)).forEach((p: any) => {
        if (!q || p.name.toLowerCase().includes(q)) {
          items.push({
            type: 'playlist',
            id: `pl-${p.id}`,
            name: p.name,
            subtitle: `Playlist \u00B7 ${p.song_count} songs`,
            coverUrl: p.cover_url,
            playlistId: p.id,
          });
        }
      });
    }

    if (filter === 'all' || filter === 'wrapped') {
      (playlists || []).filter((p: any) => isPlaybackPlaylist(p.name)).forEach((p: any) => {
        if (!q || p.name.toLowerCase().includes(q)) {
          items.push({
            type: 'wrapped',
            id: `pl-${p.id}`,
            name: p.name,
            subtitle: `Wrapped \u00B7 ${p.song_count} songs`,
            coverUrl: p.cover_url,
            playlistId: p.id,
          });
        }
      });
    }

    if (filter === 'all' || filter === 'artists') {
      (artists || []).forEach((a: any) => {
        if (!q || a.name.toLowerCase().includes(q)) {
          items.push({
            type: 'artist',
            id: `ar-${a.name}`,
            name: a.name,
            subtitle: 'Artist',
            imageUrl: a.image_url,
          });
        }
      });
    }

    if (filter === 'all' || filter === 'songs') {
      let songList = songs.filter(s =>
        !q || s.title.toLowerCase().includes(q) || (s.artist || '').toLowerCase().includes(q)
      );
      if (sortField) songList = sortSongs(songList, sortField, sortDir);
      songList.forEach(s => {
        items.push({
          type: 'song',
          id: `so-${s.id}`,
          song: s,
        });
      });
    }

    return items;
  }, [search, filter, playlists, artists, songs, sortField, sortDir]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      if (sortDir === 'desc') { setSortField(null); setSortDir('asc'); }
      else setSortDir('desc');
    } else { setSortField(field); setSortDir('asc'); }
  };

  const handleItemPress = (item: any) => {
    if (item.type === 'playlist' || item.type === 'wrapped') {
      router.push(`/playlist/${item.playlistId}`);
    } else if (item.type === 'artist') {
      router.push(`/artist/${encodeURIComponent(item.name)}`);
    } else if (item.type === 'song') {
      playSong(item.song, songs);
    }
  };

  const handleSetCover = async (song: Song) => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    try { await uploadCover(song.id, asset.uri, asset.fileName || 'cover.jpg'); refreshSongs(); bumpImgVersion(); } catch { }
    setMenuSong(null);
  };

  const handleToggleDownload = async (song: Song) => {
    setMenuSong(null);
    if (song.downloaded) {
      try { await deleteSongLocal(song.id, song.file_path); await toggleDownload(song.id, false); refreshSongs(); } catch { }
    } else {
      try {
        setDownloading(song.id);
        await downloadSong(song.id, song.file_path, song.cover_url || undefined);
        await toggleDownload(song.id, true);
        refreshSongs();
      } catch { Alert.alert('Download Failed', 'Could not download the song.'); }
      finally { setDownloading(null); }
    }
  };

  const handleAddToPlaylist = async (playlistId: string, songId: string) => {
    try { await addSongToPlaylist(playlistId, songId); } catch { }
    setMenuSong(null);
  };

  const songItems = useMemo(() => mixedItems.filter(i => i.type === 'song'), [mixedItems]);
  const allSongIds = useMemo(() => songItems.map(i => i.song.id), [songItems]);

  const handleBatchAction = useCallback(async (action: SelectionAction) => {
    const ids = Array.from(multiSelect.selectedIds);
    const selected = songs.filter(s => ids.includes(s.id));
    if (selected.length === 0) return;

    if (action === 'addToPlaylist') {
      setShowPlaylistPicker(true);
      return;
    }

    setBatchBusy(true);
    try {
      if (action === 'download') {
        for (const song of selected) {
          if (!song.downloaded) {
            await downloadSong(song.id, song.file_path, song.cover_url || undefined).catch(() => {});
            await toggleDownload(song.id, true).catch(() => {});
          }
        }
      } else if (action === 'deleteLocal') {
        for (const song of selected) {
          if (song.downloaded) {
            await deleteSongLocal(song.id, song.file_path).catch(() => {});
            await toggleDownload(song.id, false).catch(() => {});
          }
        }
      }
      refreshSongs();
      multiSelect.exitSelectionMode();
    } catch {
      Alert.alert('Error', 'Some operations failed.');
    } finally {
      setBatchBusy(false);
    }
  }, [multiSelect, songs, refreshSongs]);

  const handleBatchAddToPlaylist = useCallback(async (playlistId: string) => {
    const ids = Array.from(multiSelect.selectedIds);
    setBatchBusy(true);
    try {
      for (const songId of ids) {
        await addSongToPlaylist(playlistId, songId).catch(() => {});
      }
      multiSelect.exitSelectionMode();
    } catch {} finally {
      setBatchBusy(false);
      setShowPlaylistPicker(false);
    }
  }, [multiSelect]);

  const filters: [FilterType, string][] = [['all', 'All'], ['playlists', 'Playlists'], ['artists', 'Artists'], ['wrapped', 'Wrapped'], ['songs', 'Songs']];
  const sortPills: [string, string][] = [['title', 'Title'], ['artist', 'Artist'], ['duration', 'Duration']];

  const renderItem = ({ item }: { item: any }) => {
    if (item.type === 'song') {
      return (
        <SongRow
          song={item.song}
          onPress={() => playSong(item.song, songs)}
          onLongPress={() => multiSelect.enterSelectionMode(item.song.id)}
          imgVersion={imgVersion}
          dimmed={!item.song.downloaded}
          subtitle={downloading === item.song.id ? 'Downloading...' : (!item.song.downloaded ? 'Not Downloaded' : undefined)}
          selectionMode={multiSelect.selectionMode}
          selected={multiSelect.isSelected(item.song.id)}
          onSelect={() => multiSelect.toggleSelection(item.song.id)}
          rightElement={
            <TouchableOpacity onPress={() => setMenuSong(item.song)} style={styles.moreBtn}>
              <Ionicons name="ellipsis-horizontal" size={20} color={Colors.textMuted} />
            </TouchableOpacity>
          }
        />
      );
    }

    if (multiSelect.selectionMode) return null;

    return (
      <TouchableOpacity style={styles.libItem} onPress={() => handleItemPress(item)} activeOpacity={0.7}>
        <View style={[styles.libThumb, item.type === 'artist' && styles.libThumbRound]}>
          <CoverImage
            coverUrl={item.type === 'artist' ? item.imageUrl : item.coverUrl}
            cacheKey={item.type === 'artist' ? `artist_${item.name}` : `playlist_${item.playlistId}`}
            size={48}
            round={item.type === 'artist'}
            placeholder={item.type === 'artist' ? '\uD83C\uDFA4' : '\u266A'}
            imgVersion={imgVersion}
          />
        </View>
        <View style={styles.libInfo}>
          <Text style={styles.libName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.libType} numberOfLines={1}>{item.subtitle}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.page}>
        <Text style={styles.heading}>Your Library</Text>

        <View style={styles.filterRow}>
          {filters.map(([key, label]) => (
            <TouchableOpacity key={key}
              style={[styles.chip, filter === key && styles.chipActive]}
              onPress={() => setFilter(key)}>
              <Text style={[styles.chipText, filter === key && styles.chipTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.searchBar}>
          <Ionicons name="search" size={16} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search your library..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {filter === 'songs' && (
          <View style={styles.sortPills}>
            {sortPills.map(([f, label]) => (
              <TouchableOpacity key={f}
                style={[styles.chip, sortField === f && styles.chipActive]}
                onPress={() => handleSort(f)}>
                <Text style={[styles.chipText, sortField === f && styles.chipTextActive]}>
                  {label}{sortField === f ? (sortDir === 'asc' ? ' \u25B2' : ' \u25BC') : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {mixedItems.length === 0 ? (
          <Text style={styles.muted}>No items found</Text>
        ) : (
          <FlatList
            data={mixedItems}
            keyExtractor={item => item.id}
            contentContainerStyle={{ paddingBottom: 120 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
            renderItem={renderItem}
          />
        )}
      </View>

      {multiSelect.selectionMode && (
        <SelectionBar
          selectedCount={multiSelect.selectedCount}
          totalCount={allSongIds.length}
          actions={['addToPlaylist', 'download', 'deleteLocal']}
          onAction={handleBatchAction}
          onSelectAll={() => multiSelect.selectAll(allSongIds)}
          onDeselectAll={() => multiSelect.clearSelection()}
          onClose={() => multiSelect.exitSelectionMode()}
        />
      )}

      <Modal visible={!!menuSong && !multiSelect.selectionMode} transparent animationType="fade" onRequestClose={() => setMenuSong(null)}>
        <TouchableOpacity style={styles.menuBackdrop} onPress={() => setMenuSong(null)} activeOpacity={1}>
          <View style={styles.menuSheet}>
            <Text style={styles.menuTitle} numberOfLines={1}>{menuSong?.title}</Text>
            <TouchableOpacity style={styles.menuItem} onPress={() => { if (menuSong) { playSong(menuSong, songs); setMenuSong(null); } }}>
              <Ionicons name="play" size={20} color={Colors.text} />
              <Text style={styles.menuItemText}>Play Now</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { if (menuSong) { addToQueue(menuSong); setMenuSong(null); } }}>
              <Ionicons name="list" size={20} color={Colors.text} />
              <Text style={styles.menuItemText}>Add to Queue</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { if (menuSong) handleSetCover(menuSong); }}>
              <Ionicons name="image" size={20} color={Colors.text} />
              <Text style={styles.menuItemText}>Set Cover</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { if (menuSong) handleToggleDownload(menuSong); }}>
              <Ionicons name="download" size={20} color={Colors.text} />
              <Text style={styles.menuItemText}>{menuSong?.downloaded ? 'Remove Download' : 'Download'}</Text>
            </TouchableOpacity>
            {playlists.length > 0 && (
              <>
                <View style={styles.menuDivider} />
                <Text style={styles.menuSectionLabel}>Add to Playlist</Text>
                {playlists.map((p: any) => (
                  <TouchableOpacity key={p.id} style={styles.menuItem}
                    onPress={() => { if (menuSong) handleAddToPlaylist(p.id, menuSong.id); }}>
                    <Ionicons name="musical-notes" size={16} color={Colors.textMuted} />
                    <Text style={styles.menuItemText}>{p.name}</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={() => setMenuSong(null)}>
              <Text style={[styles.menuItemText, { color: Colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showPlaylistPicker} transparent animationType="fade" onRequestClose={() => setShowPlaylistPicker(false)}>
        <TouchableOpacity style={styles.menuBackdrop} onPress={() => setShowPlaylistPicker(false)} activeOpacity={1}>
          <View style={styles.menuSheet}>
            <Text style={styles.menuTitle}>Add {multiSelect.selectedCount} song{multiSelect.selectedCount !== 1 ? 's' : ''} to...</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {playlists.map((p: any) => (
                <TouchableOpacity key={p.id} style={styles.menuItem}
                  onPress={() => handleBatchAddToPlaylist(p.id)} disabled={batchBusy}>
                  <Ionicons name="musical-notes" size={20} color={Colors.accent} />
                  <Text style={styles.menuItemText}>{p.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={() => setShowPlaylistPicker(false)}>
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
  page: { flex: 1, padding: Spacing.lg },
  heading: { fontSize: FontSize.title, fontWeight: '700', color: Colors.text, marginBottom: Spacing.md },
  filterRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md, flexWrap: 'wrap' },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: Radius.round,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs + 2,
  },
  chipActive: { backgroundColor: '#fff' },
  chipText: { color: Colors.text, fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: '#000' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface2, borderRadius: Radius.round,
    paddingHorizontal: Spacing.md, marginBottom: Spacing.md,
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: FontSize.md, paddingVertical: Spacing.sm },
  sortPills: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md, flexWrap: 'wrap' },
  muted: { color: Colors.textMuted, fontSize: FontSize.sm },
  libItem: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: Spacing.sm, borderRadius: Radius.sm,
  },
  libThumb: { width: 48, height: 48, borderRadius: Radius.sm, overflow: 'hidden', backgroundColor: Colors.surface3 },
  libThumbRound: { borderRadius: 24 },
  libInfo: { flex: 1, minWidth: 0 },
  libName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  libType: { fontSize: 11, color: Colors.textMuted },
  moreBtn: { padding: Spacing.sm },
  menuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  menuSheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg,
    paddingVertical: Spacing.lg, paddingHorizontal: Spacing.lg, maxHeight: '70%',
  },
  menuTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text, marginBottom: Spacing.lg, textAlign: 'center' },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
  menuItemText: { fontSize: FontSize.md, color: Colors.text },
  menuDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: Spacing.sm },
  menuSectionLabel: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: '600', marginBottom: Spacing.xs, textTransform: 'uppercase' },
});
