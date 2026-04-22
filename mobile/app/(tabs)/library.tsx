import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import SongRow from '../../components/SongRow';
import { useData } from '../../contexts/DataContext';
import { usePlayer, Song } from '../../contexts/PlayerContext';
import { uploadCover, addSongToPlaylist, reorderLibrary, toggleDownload } from '../../api/client';
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

export default function LibraryScreen() {
  const { songs, playlists, imgVersion, bumpImgVersion, refreshSongs } = useData();
  const { playSong, addToQueue } = usePlayer();
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState('asc');
  const [menuSong, setMenuSong] = useState<Song | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const list = songs.filter(s =>
      s.title.toLowerCase().includes(q) || (s.artist || '').toLowerCase().includes(q)
    );
    if (sortField) return sortSongs(list, sortField, sortDir);
    return list;
  }, [songs, search, sortField, sortDir]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      if (sortDir === 'desc') { setSortField(null); setSortDir('asc'); }
      else setSortDir('desc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const handleSetCover = async (song: Song) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    try {
      await uploadCover(song.id, asset.uri, asset.fileName || 'cover.jpg');
      refreshSongs();
      bumpImgVersion();
    } catch { }
    setMenuSong(null);
  };

  const handleToggleDownload = async (song: Song) => {
    try {
      await toggleDownload(song.id, !song.downloaded);
      refreshSongs();
    } catch { }
    setMenuSong(null);
  };

  const handleAddToPlaylist = async (playlistId: string, songId: string) => {
    try { await addSongToPlaylist(playlistId, songId); } catch { }
    setMenuSong(null);
  };

  const sortPills: [string, string][] = [['title', 'Title'], ['artist', 'Artist'], ['duration', 'Duration']];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.page}>
        <Text style={styles.heading}>Library</Text>

        <View style={styles.searchBar}>
          <Ionicons name="search" size={16} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search songs..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <View style={styles.sortPills}>
          {sortPills.map(([f, label]) => (
            <TouchableOpacity key={f}
              style={[styles.pill, sortField === f && styles.pillActive]}
              onPress={() => handleSort(f)}>
              <Text style={[styles.pillText, sortField === f && styles.pillTextActive]}>
                {label}{sortField === f ? (sortDir === 'asc' ? ' \u25B2' : ' \u25BC') : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {filtered.length === 0 ? (
          <Text style={styles.muted}>No songs found</Text>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={item => item.id}
            contentContainerStyle={{ paddingBottom: 120 }}
            renderItem={({ item }) => (
              <SongRow
                song={item}
                onPress={() => playSong(item, songs)}
                onLongPress={() => setMenuSong(item)}
                imgVersion={imgVersion}
                dimmed={item.downloaded === 0}
                rightElement={
                  <TouchableOpacity onPress={() => setMenuSong(item)} style={styles.moreBtn}>
                    <Ionicons name="ellipsis-horizontal" size={20} color={Colors.textMuted} />
                  </TouchableOpacity>
                }
              />
            )}
          />
        )}
      </View>

      <Modal visible={!!menuSong} transparent animationType="fade" onRequestClose={() => setMenuSong(null)}>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  page: { flex: 1, padding: Spacing.lg },
  heading: { fontSize: FontSize.title, fontWeight: '700', color: Colors.text, marginBottom: Spacing.lg },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, paddingHorizontal: Spacing.md, marginBottom: Spacing.md,
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: FontSize.md, paddingVertical: Spacing.sm },
  sortPills: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md, flexWrap: 'wrap' },
  pill: {
    backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.round, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs,
  },
  pillActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  pillText: { color: Colors.textMuted, fontSize: 11 },
  pillTextActive: { color: Colors.white },
  muted: { color: Colors.textMuted, fontSize: FontSize.sm },
  moreBtn: { padding: Spacing.sm },
  menuBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end',
  },
  menuSheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg,
    paddingVertical: Spacing.lg, paddingHorizontal: Spacing.lg,
    maxHeight: '70%',
  },
  menuTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text, marginBottom: Spacing.lg, textAlign: 'center' },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
  menuItemText: { fontSize: FontSize.md, color: Colors.text },
  menuDivider: { height: 1, backgroundColor: Colors.border, marginVertical: Spacing.sm },
  menuSectionLabel: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: '600', marginBottom: Spacing.xs, textTransform: 'uppercase' },
});
