import { useState, useMemo, useCallback } from 'react';
import { IoSearch, IoEllipsisHorizontal, IoPlay, IoList, IoImage, IoDownload, IoMusicalNotes } from 'react-icons/io5';
import SongRow from '../components/SongRow';
import SelectionBar, { type SelectionAction } from '../components/SelectionBar';
import CoverImage from '../components/CoverImage';
import ScrollPage from '../components/ScrollPage';
import Sheet, { SheetItem, SheetDivider } from '../components/Sheet';
import { useData } from '../contexts/DataContext';
import { usePlayer } from '../contexts/PlayerContext';
import { useNav } from '../navigation/Navigator';
import { uploadCover, addSongToPlaylist } from '../api/client';
import { useMultiSelect } from '../hooks/useMultiSelect';
import { pickFile } from '../utils/pickFile';
import { isPlaybackPlaylist } from '../utils/format';
import { Colors } from '../constants/theme';
import type { Song } from '../types';

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
  const { imgVersion, bumpImgVersion, refreshSongs, refreshAll, online, downloadProgress, downloadSongs, removeDownloads } = data;
  const { playSong, addToQueue } = usePlayer();
  const { push } = useNav();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState('asc');
  const [menuSong, setMenuSong] = useState<Song | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);
  const multiSelect = useMultiSelect();

  const onRefresh = useCallback(async () => { await refreshAll(); }, [refreshAll]);

  const mixedItems = useMemo(() => {
    const q = search.toLowerCase();
    const items: any[] = [];

    if (filter === 'all' || filter === 'playlists') {
      playlists.filter(p => !isPlaybackPlaylist(p.name)).forEach(p => {
        if (!q || p.name.toLowerCase().includes(q)) {
          items.push({
            type: 'playlist', id: `pl-${p.id}`, name: p.name,
            subtitle: `Playlist \u00B7 ${p.song_count} songs`, coverUrl: p.cover_url, playlistId: p.id,
          });
        }
      });
    }

    if (filter === 'all' || filter === 'wrapped') {
      playlists.filter(p => isPlaybackPlaylist(p.name)).forEach(p => {
        if (!q || p.name.toLowerCase().includes(q)) {
          items.push({
            type: 'wrapped', id: `pl-${p.id}`, name: p.name,
            subtitle: `Wrapped \u00B7 ${p.song_count} songs`, coverUrl: p.cover_url, playlistId: p.id,
          });
        }
      });
    }

    if (filter === 'all' || filter === 'artists') {
      artists.forEach(a => {
        if (!q || a.name.toLowerCase().includes(q)) {
          items.push({ type: 'artist', id: `ar-${a.name}`, name: a.name, subtitle: 'Artist', imageUrl: a.image_url });
        }
      });
    }

    if (filter === 'all' || filter === 'songs') {
      let songList = songs.filter(s =>
        !q || s.title.toLowerCase().includes(q) || (s.artist || '').toLowerCase().includes(q)
      );
      if (sortField) songList = sortSongs(songList, sortField, sortDir);
      songList.forEach(s => items.push({ type: 'song', id: `so-${s.id}`, song: s }));
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
    if (item.type === 'playlist' || item.type === 'wrapped') push({ name: 'playlist', id: item.playlistId });
    else if (item.type === 'artist') push({ name: 'artist', artist: item.name });
    else if (item.type === 'song') playSong(item.song, songs);
  };

  const handleSetCover = async (song: Song) => {
    setMenuSong(null);
    if (!online) { alert('Connect to the server to change covers.'); return; }
    const file = await pickFile('image/*');
    if (!file) return;
    try { await uploadCover(song.id, file); refreshSongs(); bumpImgVersion(); } catch { }
  };

  const handleToggleDownload = async (song: Song) => {
    setMenuSong(null);
    if (song.downloaded) {
      await removeDownloads([song]);
    } else {
      if (!online) { alert('Connect to the server to download songs.'); return; }
      const res = await downloadSongs([song]);
      if (res.failed) alert('Download Failed: Could not download the song.');
    }
  };

  const handleAddToPlaylist = async (playlistId: string, songId: string) => {
    try { await addSongToPlaylist(playlistId, songId); data.refreshPlaylists(); } catch { }
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
        if (!online) { alert('Connect to the server to download songs.'); return; }
        const res = await downloadSongs(selected.filter(s => !s.downloaded));
        if (res.failed) alert(`${res.failed} download(s) failed.`);
      } else if (action === 'deleteLocal') {
        await removeDownloads(selected.filter(s => s.downloaded));
      }
      multiSelect.exitSelectionMode();
    } catch {
      alert('Some operations failed.');
    } finally {
      setBatchBusy(false);
    }
  }, [multiSelect, songs, online, downloadSongs, removeDownloads]);

  const handleBatchAddToPlaylist = useCallback(async (playlistId: string) => {
    const ids = Array.from(multiSelect.selectedIds);
    setBatchBusy(true);
    try {
      for (const songId of ids) {
        await addSongToPlaylist(playlistId, songId).catch(() => {});
      }
      data.refreshPlaylists();
      multiSelect.exitSelectionMode();
    } catch { } finally {
      setBatchBusy(false);
      setShowPlaylistPicker(false);
    }
  }, [multiSelect, data]);

  const filters: [FilterType, string][] = [['all', 'All'], ['playlists', 'Playlists'], ['artists', 'Artists'], ['wrapped', 'Wrapped'], ['songs', 'Songs']];
  const sortPills: [string, string][] = [['title', 'Title'], ['artist', 'Artist'], ['duration', 'Duration']];

  const songSubtitle = (s: Song) => {
    const p = downloadProgress[s.id];
    if (p !== undefined) return `Downloading... ${Math.round(p * 100)}%`;
    return !s.downloaded ? 'Not Downloaded' : undefined;
  };

  return (
    <div className="library-page">
      <div className="library-head">
        <h1 className="heading" style={{ marginBottom: 12 }}>Your Library</h1>

        <div className="chips-row">
          {filters.map(([key, label]) => (
            <button key={key} className={`chip ${filter === key ? 'active' : ''}`} onClick={() => setFilter(key)}>
              {label}
            </button>
          ))}
        </div>

        <div className="search-bar">
          <IoSearch size={16} />
          <input placeholder="Search your library..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {filter === 'songs' && (
          <div className="chips-row">
            {sortPills.map(([f, label]) => (
              <button key={f} className={`chip ${sortField === f ? 'active' : ''}`} onClick={() => handleSort(f)}>
                {label}{sortField === f ? (sortDir === 'asc' ? ' \u25B2' : ' \u25BC') : ''}
              </button>
            ))}
          </div>
        )}
      </div>

      <ScrollPage onRefresh={onRefresh} className="no-safe">
        <div className="library-list">
          {mixedItems.length === 0 ? (
            <div className="muted">No items found</div>
          ) : mixedItems.map(item => {
            if (item.type === 'song') {
              return (
                <SongRow
                  key={item.id}
                  song={item.song}
                  onPress={() => playSong(item.song, songs)}
                  onLongPress={() => multiSelect.enterSelectionMode(item.song.id)}
                  imgVersion={imgVersion}
                  dimmed={!item.song.downloaded}
                  subtitle={songSubtitle(item.song)}
                  selectionMode={multiSelect.selectionMode}
                  selected={multiSelect.isSelected(item.song.id)}
                  onSelect={() => multiSelect.toggleSelection(item.song.id)}
                  rightElement={
                    <button className="more-btn" onClick={() => setMenuSong(item.song)} aria-label="More">
                      <IoEllipsisHorizontal size={20} />
                    </button>
                  }
                />
              );
            }
            if (multiSelect.selectionMode) return null;
            return (
              <div key={item.id} className="lib-item" onClick={() => handleItemPress(item)}>
                <CoverImage
                  coverUrl={item.type === 'artist' ? item.imageUrl : item.coverUrl}
                  cacheKey={item.type === 'artist' ? `artist_${item.name}` : `playlist_${item.playlistId}`}
                  size={48}
                  round={item.type === 'artist'}
                  placeholder={item.type === 'artist' ? '\uD83C\uDFA4' : '\u266A'}
                  imgVersion={imgVersion}
                />
                <div className="lib-info">
                  <div className="lib-name ellipsis">{item.name}</div>
                  <div className="lib-type ellipsis">{item.subtitle}</div>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollPage>

      {multiSelect.selectionMode && (
        <SelectionBar
          selectedCount={multiSelect.selectedCount}
          totalCount={allSongIds.length}
          actions={['addToPlaylist', 'download', 'deleteLocal']}
          onAction={handleBatchAction}
          onSelectAll={() => multiSelect.selectAll(allSongIds)}
          onDeselectAll={() => multiSelect.clearSelection()}
          onClose={() => multiSelect.exitSelectionMode()}
          busy={batchBusy}
        />
      )}

      <Sheet open={!!menuSong && !multiSelect.selectionMode} onClose={() => setMenuSong(null)} title={menuSong?.title}>
        <SheetItem icon={<IoPlay size={20} />} label="Play Now"
          onClick={() => { if (menuSong) { playSong(menuSong, songs); setMenuSong(null); } }} />
        <SheetItem icon={<IoList size={20} />} label="Add to Queue"
          onClick={() => { if (menuSong) { addToQueue(menuSong); setMenuSong(null); } }} />
        <SheetItem icon={<IoImage size={20} />} label="Set Cover"
          onClick={() => { if (menuSong) handleSetCover(menuSong); }} />
        <SheetItem icon={<IoDownload size={20} />} label={menuSong?.downloaded ? 'Remove Download' : 'Download'}
          onClick={() => { if (menuSong) handleToggleDownload(menuSong); }} />
        {playlists.length > 0 && online && (
          <>
            <SheetDivider />
            <div className="sheet-section-label">Add to Playlist</div>
            {playlists.map(p => (
              <SheetItem key={p.id} icon={<IoMusicalNotes size={16} color={Colors.textMuted} />} label={p.name}
                onClick={() => { if (menuSong) handleAddToPlaylist(p.id, menuSong.id); }} />
            ))}
          </>
        )}
        <SheetDivider />
        <SheetItem label="Cancel" color={Colors.textMuted} onClick={() => setMenuSong(null)} />
      </Sheet>

      <Sheet open={showPlaylistPicker} onClose={() => setShowPlaylistPicker(false)}
        title={`Add ${multiSelect.selectedCount} song${multiSelect.selectedCount !== 1 ? 's' : ''} to...`}>
        {playlists.map(p => (
          <SheetItem key={p.id} icon={<IoMusicalNotes size={20} color={Colors.accent} />} label={p.name}
            onClick={() => handleBatchAddToPlaylist(p.id)} disabled={batchBusy} />
        ))}
        <SheetDivider />
        <SheetItem label="Cancel" color={Colors.textMuted} onClick={() => setShowPlaylistPicker(false)} />
      </Sheet>
    </div>
  );
}
