import { useState, useRef, useMemo, useCallback } from 'react';
import { deleteSong, addSongToPlaylist, uploadCover, reorderLibrary } from '../api/client';
import SongView, { TableHeader } from '../components/SongView';

function sortSongs(list, field, dir) {
  const cmp = (a, b) => {
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

export default function DesktopLibrary({
  songs, onPlay, addToQueue, onRefreshSongs, playlists,
  manualQueue, removeFromQueue, currentSong,
  imgVersion, bumpImgVersion,
}) {
  const [search, setSearch] = useState('');
  const [contextMenu, setContextMenu] = useState(null);
  const coverInputRef = useRef(null);
  const [coverSongId, setCoverSongId] = useState(null);
  const [sortField, setSortField] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [localSongs, setLocalSongs] = useState(null);
  const displaySongs = localSongs || songs;

  const isSearching = search.trim().length > 0;
  const isSorting = sortField !== null;
  const canDrag = !isSearching && !isSorting;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const list = displaySongs.filter((s) =>
      s.title.toLowerCase().includes(q) || (s.artist || '').toLowerCase().includes(q) || (s.album || '').toLowerCase().includes(q)
    );
    if (sortField) return sortSongs(list, sortField, sortDir);
    return list;
  }, [displaySongs, search, sortField, sortDir]);

  const handleSort = (field) => {
    if (sortField === field) {
      if (sortDir === 'desc') { setSortField(null); setSortDir('asc'); }
      else { setSortDir('desc'); }
    } else { setSortField(field); setSortDir('asc'); }
  };

  const handleDragStart = useCallback((e, idx) => {
    if (!canDrag) return;
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', idx.toString());
  }, [canDrag]);

  const handleDragOver = useCallback((e, idx) => {
    if (dragIdx === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIdx(idx);
  }, [dragIdx]);

  const handleDrop = useCallback(async (e, toIdx) => {
    e.preventDefault();
    const fromIdx = dragIdx;
    setDragIdx(null);
    setDragOverIdx(null);
    if (fromIdx === null || fromIdx === toIdx) return;
    const reordered = [...displaySongs];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    setLocalSongs(reordered);
    try {
      await reorderLibrary(reordered.map(s => s.id));
      await onRefreshSongs();
    } catch { /* ignore */ }
    setLocalSongs(null);
  }, [dragIdx, displaySongs, onRefreshSongs]);

  const handleDragEnd = useCallback(() => { setDragIdx(null); setDragOverIdx(null); }, []);

  const handleDelete = async (id, title) => {
    if (!window.confirm(`Delete "${title}"?`)) return;
    try { await deleteSong(id); onRefreshSongs(); } catch (err) { alert(`Delete failed: ${err.message}`); }
  };

  const handleContext = (e, song) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, song });
  };

  const closeContext = () => setContextMenu(null);

  const handleAddToPlaylist = async (playlistId, songId) => {
    try { await addSongToPlaylist(playlistId, songId); } catch { /* ignore */ }
    closeContext();
  };

  const handleSetCover = (songId) => {
    setCoverSongId(songId);
    closeContext();
    setTimeout(() => coverInputRef.current?.click(), 0);
  };

  const handleCoverFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !coverSongId) return;
    try { await uploadCover(coverSongId, file); onRefreshSongs(); bumpImgVersion?.(); } catch { /* ignore */ }
    setCoverSongId(null);
    e.target.value = '';
  };

  const isInManualQueue = (songId) => manualQueue?.some(s => s.id === songId);
  const handleRemoveFromQueue = (songId) => {
    const idx = manualQueue?.findIndex(s => s.id === songId);
    if (idx >= 0) removeFromQueue(idx);
    closeContext();
  };

  return (
    <div className="lib-page" onClick={closeContext}>
      <input type="file" ref={coverInputRef} accept="image/*" style={{ display: 'none' }} onChange={handleCoverFile} />

      <div className="lib-page__header">
        <h1 className="lib-page__title">All Songs</h1>
        <div className="search-bar">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
          <input placeholder="Search songs..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="lib-page__count muted">{filtered.length} song{filtered.length !== 1 ? 's' : ''}</div>

      <TableHeader onSort={handleSort} sortField={sortField} sortDir={sortDir} />

      <div className="lib-page__list">
        {filtered.map((s, i) => (
          <SongView
            key={s.id}
            song={s}
            index={i}
            isActive={currentSong?.id === s.id}
            onPlay={() => onPlay(s)}
            onDoubleClick={() => onPlay(s)}
            onContextMenu={(e) => handleContext(e, s)}
            imgVersion={imgVersion}
            draggable={canDrag}
            onDragStart={(e) => handleDragStart(e, i)}
            onDragOver={(e) => handleDragOver(e, i)}
            onDrop={(e) => handleDrop(e, i)}
            onDragEnd={handleDragEnd}
            isDragging={dragIdx === i}
            dragOverPosition={dragOverIdx === i && dragIdx !== null && dragIdx !== i ? (dragIdx < i ? 'below' : 'above') : undefined}
            actions={
              <div className="sv-actions">
                <a className="sv-action-btn" href={`/api/download/${s.id}`} download title="Download" onClick={e => e.stopPropagation()}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                </a>
                <button className="sv-action-btn sv-action-btn--danger" onClick={(e) => { e.stopPropagation(); handleDelete(s.id, s.title); }} title="Delete">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                </button>
              </div>
            }
          />
        ))}
      </div>

      {contextMenu && (
        <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => { onPlay(contextMenu.song); closeContext(); }}>Play</button>
          <button onClick={() => { addToQueue(contextMenu.song); closeContext(); }}>Add to Queue</button>
          {isInManualQueue(contextMenu.song.id) && (
            <button onClick={() => handleRemoveFromQueue(contextMenu.song.id)}>Remove from Queue</button>
          )}
          <button onClick={() => handleSetCover(contextMenu.song.id)}>Set Cover</button>
          {playlists.length > 0 && (
            <>
              <div className="context-menu__divider" />
              {playlists.map((p) => (
                <button key={p.id} onClick={() => handleAddToPlaylist(p.id, contextMenu.song.id)}>
                  Add to &ldquo;{p.name}&rdquo;
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
