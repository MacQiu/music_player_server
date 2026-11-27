import { useState, useEffect, useMemo, useCallback, type CSSProperties } from 'react';
import {
  IoChevronBack, IoAddCircleOutline, IoPencilOutline, IoCheckmarkCircle, IoTrashOutline, IoPlay,
  IoSearch, IoAdd, IoReorderThree, IoEllipsisHorizontal, IoCheckmark, IoList, IoArrowUp, IoArrowDown,
  IoMusicalNotes,
} from 'react-icons/io5';
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import CoverImage from '../components/CoverImage';
import SelectionBar, { type SelectionAction } from '../components/SelectionBar';
import Sheet, { SheetItem, SheetDivider } from '../components/Sheet';
import { useData } from '../contexts/DataContext';
import { usePlayer } from '../contexts/PlayerContext';
import { useNav } from '../navigation/Navigator';
import {
  removeSongFromPlaylist, addSongToPlaylist, reorderPlaylistSongs, updatePlaylist, deletePlaylist,
} from '../api/client';
import { useMultiSelect } from '../hooks/useMultiSelect';
import { usePress } from '../hooks/usePress';
import { fmtDuration } from '../utils/format';
import { Colors } from '../constants/theme';
import type { PlaylistDetail, Song } from '../types';

function PlaylistSongRow({ song, imgVersion, selectMode, selected, isWrapped, onPress, onLongPress, onMenu }: {
  song: Song;
  imgVersion: number;
  selectMode: boolean;
  selected: boolean;
  isWrapped: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  onMenu: () => void;
}) {
  const press = usePress(onPress, onLongPress);
  return (
    <div className={`pl-song-row ${selectMode && selected ? 'selected' : ''}`} {...press}>
      {selectMode && (
        <span className={`check-circle ${selected ? 'checked' : ''}`}>
          {selected && <IoCheckmark size={14} color="#000" />}
        </span>
      )}
      <CoverImage coverUrl={song.cover_url} songId={song.id} size={44} imgVersion={imgVersion} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="pl-song-title ellipsis">{song.title}</div>
        <div className="pl-song-artist ellipsis">{song.is_blank ? 'No audio' : (song.artist || 'Unknown')}</div>
      </div>
      {!selectMode && isWrapped && (
        <div className="song-stats">
          <div>{song.play_count || 0} plays</div>
          {!!song.is_blank && <div>No audio</div>}
        </div>
      )}
      {!selectMode && !isWrapped && (
        <button className="more-btn" aria-label="More"
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onMenu(); }}>
          <IoEllipsisHorizontal size={18} />
        </button>
      )}
    </div>
  );
}

function SortableSongRow({ song, imgVersion }: { song: Song; imgVersion: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: song.id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    position: 'relative',
    zIndex: isDragging ? 2 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} className={`pl-song-row ${isDragging ? 'dragging' : ''}`}>
      <span className="drag-handle" {...attributes} {...listeners}>
        <IoReorderThree size={22} />
      </span>
      <CoverImage coverUrl={song.cover_url} songId={song.id} size={44} imgVersion={imgVersion} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="pl-song-title ellipsis">{song.title}</div>
        <div className="pl-song-artist ellipsis">{song.is_blank ? 'No audio' : (song.artist || 'Unknown')}</div>
      </div>
    </div>
  );
}

export default function PlaylistScreen({ id }: { id: string }) {
  const { back } = useNav();
  const {
    songs, playlists, online, imgVersion, refreshPlaylists, loadPlaylist, downloadSongs, removeDownloads,
  } = useData();
  const { playSong, addToQueue } = usePlayer();
  const [playlist, setPlaylist] = useState<PlaylistDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddSongs, setShowAddSongs] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [menuSong, setMenuSong] = useState<Song | null>(null);
  const [menuIndex, setMenuIndex] = useState(-1);
  const [batchBusy, setBatchBusy] = useState(false);
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const multiSelect = useMultiSelect();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 0, tolerance: 4 } }),
  );

  const isWrapped = !!playlist?.is_wrapped;
  const plSongs: Song[] = playlist?.songs || [];
  const otherPlaylists = useMemo(() => playlists.filter(p => p.id !== id), [playlists, id]);
  const playlistSongIdList = useMemo(() => plSongs.map(s => s.id), [plSongs]);

  const fetchPlaylist = useCallback(async () => {
    const data = await loadPlaylist(id);
    if (data) {
      setPlaylist(data);
      setNameValue(data.name);
    }
    setLoading(false);
  }, [id, loadPlaylist]);

  useEffect(() => { fetchPlaylist(); }, [fetchPlaylist]);

  const requireOnline = () => {
    if (online) return true;
    alert('Connect to the server to edit playlists.');
    return false;
  };

  const handleRemoveSong = async (songId: string) => {
    if (!requireOnline()) return;
    await removeSongFromPlaylist(id, songId).catch(() => {});
    fetchPlaylist();
    refreshPlaylists();
  };

  const handleAddSong = async (songId: string) => {
    if (!requireOnline()) return;
    await addSongToPlaylist(id, songId).catch(() => {});
    fetchPlaylist();
    refreshPlaylists();
  };

  const handleMoveSong = async (fromIdx: number, toIdx: number) => {
    if (!playlist || toIdx < 0 || toIdx >= plSongs.length) return;
    setMenuSong(null);
    if (!requireOnline()) return;
    const newOrder = arrayMove(plSongs, fromIdx, toIdx);
    setPlaylist({ ...playlist, songs: newOrder });
    await reorderPlaylistSongs(id, newOrder.map(s => s.id)).catch(() => {});
    fetchPlaylist();
  };

  const onDragEnd = (e: DragEndEvent) => {
    if (!playlist || !e.over || e.active.id === e.over.id) return;
    const from = playlistSongIdList.indexOf(String(e.active.id));
    const to = playlistSongIdList.indexOf(String(e.over.id));
    if (from < 0 || to < 0) return;
    const newOrder = arrayMove(plSongs, from, to);
    setPlaylist({ ...playlist, songs: newOrder });
    reorderPlaylistSongs(id, newOrder.map(s => s.id)).catch(() => {});
  };

  /** Library entries carry the local `downloaded` flag; playlist payloads may not. */
  const resolveSongs = (ids: string[]) => ids
    .map(sid => songs.find(s => s.id === sid) || plSongs.find(s => s.id === sid))
    .filter((s): s is Song => !!s);

  const handleBatchAction = async (action: SelectionAction) => {
    const ids = Array.from(multiSelect.selectedIds);
    if (ids.length === 0) return;

    if (action === 'addToPlaylist') {
      if (requireOnline()) setShowPlaylistPicker(true);
      return;
    }

    setBatchBusy(true);
    try {
      if (action === 'removeFromPlaylist') {
        if (!requireOnline()) return;
        for (const songId of ids) {
          await removeSongFromPlaylist(id, songId).catch(() => {});
        }
        fetchPlaylist();
        refreshPlaylists();
      } else if (action === 'download') {
        if (!requireOnline()) return;
        const { failed } = await downloadSongs(resolveSongs(ids).filter(s => !s.downloaded));
        if (failed) alert(`${failed} download${failed !== 1 ? 's' : ''} failed.`);
      } else if (action === 'deleteLocal') {
        await removeDownloads(resolveSongs(ids).filter(s => s.downloaded));
      }
      multiSelect.exitSelectionMode();
    } catch {
      alert('Some operations failed.');
    } finally {
      setBatchBusy(false);
    }
  };

  const handleBatchAddToOtherPlaylist = async (targetPlaylistId: string) => {
    const ids = Array.from(multiSelect.selectedIds);
    setBatchBusy(true);
    try {
      for (const songId of ids) {
        await addSongToPlaylist(targetPlaylistId, songId).catch(() => {});
      }
      multiSelect.exitSelectionMode();
      refreshPlaylists();
    } finally {
      setBatchBusy(false);
      setShowPlaylistPicker(false);
    }
  };

  const handleRename = async () => {
    const name = nameValue.trim();
    setEditingName(false);
    if (!name || !playlist || name === playlist.name) return;
    if (!requireOnline()) { setNameValue(playlist.name); return; }
    await updatePlaylist(id, name).catch(() => {});
    setPlaylist({ ...playlist, name });
    refreshPlaylists();
  };

  const handleDelete = async () => {
    if (!requireOnline()) return;
    if (!confirm(`Delete "${playlist?.name}"?`)) return;
    await deletePlaylist(id).catch(() => {});
    refreshPlaylists();
    back();
  };

  const handlePlayAll = () => {
    const playable = plSongs.filter(s => !s.is_blank);
    if (playable.length === 0) return;
    playSong(playable[0], playable);
  };

  const totalDuration = plSongs.reduce((acc, s) => acc + (s.duration || 0), 0);
  const availableSongs = useMemo(() => {
    const inPlaylist = new Set(playlistSongIdList);
    const q = addSearch.toLowerCase();
    return songs.filter(s =>
      !inPlaylist.has(s.id) &&
      (s.title.toLowerCase().includes(q) || (s.artist || '').toLowerCase().includes(q)),
    );
  }, [songs, playlistSongIdList, addSearch]);

  const backBtn = (
    <div className="header-bar">
      <button className="icon-btn" onClick={back} aria-label="Back"><IoChevronBack size={24} /></button>
    </div>
  );

  if (loading || !playlist) {
    return (
      <div className="modal-body" style={{ paddingTop: 'var(--safe-top)' }}>
        {backBtn}
        <div className="muted center" style={{ marginTop: 40 }}>
          {loading ? 'Loading...' : 'Playlist not available offline'}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="modal-body">
        <div className="pl-hero-gradient">
          {backBtn}
          <div className="pl-hero">
            <div className="pl-cover-wrap">
              <CoverImage coverUrl={plSongs[0]?.cover_url} songId={plSongs[0]?.id} size={200} imgVersion={imgVersion} />
            </div>
            {!isWrapped && editingName ? (
              <input className="pl-name-input" value={nameValue} autoFocus
                onChange={e => setNameValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                onBlur={handleRename} />
            ) : (
              <div className="pl-name" onClick={isWrapped ? undefined : () => setEditingName(true)}>{playlist.name}</div>
            )}
            <div className="pl-stats">{plSongs.length} songs {'\u00B7'} {fmtDuration(totalDuration)}</div>
          </div>
        </div>

        <div className="controls-row">
          <div className="controls-left">
            {!isWrapped && (
              <>
                <button className="icon-btn" onClick={() => setShowAddSongs(!showAddSongs)} aria-label="Add songs"
                  style={{ color: Colors.textMuted }}>
                  <IoAddCircleOutline size={28} />
                </button>
                <button className="icon-btn" onClick={() => setEditMode(!editMode)} aria-label="Reorder"
                  style={{ color: editMode ? Colors.accent : Colors.textMuted }}>
                  {editMode ? <IoCheckmarkCircle size={24} /> : <IoPencilOutline size={24} />}
                </button>
                <button className="icon-btn" onClick={handleDelete} aria-label="Delete playlist"
                  style={{ color: Colors.textMuted }}>
                  <IoTrashOutline size={24} />
                </button>
              </>
            )}
          </div>
          <button className="fab-play" onClick={handlePlayAll} disabled={!plSongs.length} aria-label="Play">
            <IoPlay size={28} />
          </button>
        </div>

        {!isWrapped && showAddSongs && (
          <div className="add-section">
            <div className="search-bar" style={{ margin: '0 0 var(--sp-md)' }}>
              <IoSearch size={16} color={Colors.textMuted} />
              <input placeholder="Search songs to add..." value={addSearch} onChange={e => setAddSearch(e.target.value)} />
            </div>
            {availableSongs.slice(0, 15).map(song => (
              <div key={song.id} className="add-item">
                <CoverImage coverUrl={song.cover_url} songId={song.id} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="ellipsis" style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>{song.title}</div>
                  <div className="ellipsis" style={{ fontSize: 11, color: Colors.textMuted }}>{song.artist || 'Unknown'}</div>
                </div>
                <button className="add-btn" onClick={() => handleAddSong(song.id)} aria-label="Add"><IoAdd size={20} /></button>
              </div>
            ))}
            {availableSongs.length === 0 && <div className="muted" style={{ padding: 'var(--sp-md)' }}>No songs to add</div>}
          </div>
        )}

        {editMode && !isWrapped && (
          <div className="edit-banner">
            <IoReorderThree size={20} />
            <span>Drag to reorder songs</span>
            <button className="edit-done" onClick={() => setEditMode(false)}>Done</button>
          </div>
        )}

        <div className="song-list">
          {editMode && !isWrapped ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={playlistSongIdList} strategy={verticalListSortingStrategy}>
                {plSongs.map(song => <SortableSongRow key={song.id} song={song} imgVersion={imgVersion} />)}
              </SortableContext>
            </DndContext>
          ) : (
            plSongs.map((song, idx) => (
              <PlaylistSongRow key={song.id} song={song} imgVersion={imgVersion}
                selectMode={multiSelect.selectionMode}
                selected={multiSelect.isSelected(song.id)}
                isWrapped={isWrapped}
                onPress={multiSelect.selectionMode
                  ? () => multiSelect.toggleSelection(song.id)
                  : () => playSong(song, plSongs)}
                onLongPress={!isWrapped && !multiSelect.selectionMode ? () => multiSelect.enterSelectionMode(song.id) : undefined}
                onMenu={() => { setMenuSong(song); setMenuIndex(idx); }} />
            ))
          )}
          {plSongs.length === 0 && <div className="muted center" style={{ marginTop: 20 }}>No songs in this playlist</div>}
        </div>
      </div>

      {multiSelect.selectionMode && !isWrapped && (
        <SelectionBar
          selectedCount={multiSelect.selectedCount}
          totalCount={playlistSongIdList.length}
          actions={['removeFromPlaylist', 'addToPlaylist', 'download', 'deleteLocal']}
          onAction={handleBatchAction}
          onSelectAll={() => multiSelect.selectAll(playlistSongIdList)}
          onDeselectAll={() => multiSelect.clearSelection()}
          onClose={() => multiSelect.exitSelectionMode()}
          busy={batchBusy}
        />
      )}

      <Sheet open={showPlaylistPicker} onClose={() => setShowPlaylistPicker(false)}
        title={`Add ${multiSelect.selectedCount} song${multiSelect.selectedCount !== 1 ? 's' : ''} to...`}>
        {otherPlaylists.map(p => (
          <SheetItem key={p.id} icon={<IoMusicalNotes size={20} color={Colors.accent} />} label={p.name}
            onClick={() => handleBatchAddToOtherPlaylist(p.id)} disabled={batchBusy} />
        ))}
        {otherPlaylists.length === 0 && <div className="muted" style={{ padding: 'var(--sp-md)' }}>No other playlists</div>}
        <SheetDivider />
        <SheetItem label="Cancel" color={Colors.textMuted} onClick={() => setShowPlaylistPicker(false)} />
      </Sheet>

      <Sheet open={!!menuSong && !multiSelect.selectionMode} onClose={() => setMenuSong(null)} title={menuSong?.title}>
        <SheetItem icon={<IoPlay size={20} />} label="Play Now" onClick={() => {
          if (menuSong) { playSong(menuSong, plSongs); setMenuSong(null); }
        }} />
        <SheetItem icon={<IoList size={20} />} label="Add to Queue" onClick={() => {
          if (menuSong) { addToQueue(menuSong); setMenuSong(null); }
        }} />
        <SheetDivider />
        <SheetItem icon={<IoArrowUp size={20} />} label="Move Up" disabled={menuIndex <= 0}
          onClick={() => handleMoveSong(menuIndex, menuIndex - 1)} />
        <SheetItem icon={<IoArrowDown size={20} />} label="Move Down" disabled={menuIndex >= plSongs.length - 1}
          onClick={() => handleMoveSong(menuIndex, menuIndex + 1)} />
        <SheetDivider />
        <SheetItem icon={<IoTrashOutline size={20} />} label="Remove from Playlist" color={Colors.danger} onClick={() => {
          const s = menuSong;
          setMenuSong(null);
          if (s && confirm(`Remove "${s.title}" from this playlist?`)) handleRemoveSong(s.id);
        }} />
        <SheetDivider />
        <SheetItem label="Cancel" color={Colors.textMuted} onClick={() => setMenuSong(null)} />
      </Sheet>
    </>
  );
}
