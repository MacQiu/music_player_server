import { useState, useRef, useMemo, useCallback } from 'react';
import { deleteSong, addSongToPlaylist, uploadCover, reorderLibrary } from '../api/client';

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

export default function DesktopLibrary({ songs, onPlay, addToQueue, onRefreshSongs, playlists, manualQueue, removeFromQueue, imgVersion, bumpImgVersion }) {
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
      if (sortDir === 'desc') {
        setSortField(null);
        setSortDir('asc');
      } else {
        setSortDir('desc');
      }
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const SortArrow = ({ field }) => {
    if (sortField !== field) return null;
    return <span className="sort-arrow">{sortDir === 'asc' ? ' ▲' : ' ▼'}</span>;
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
      onRefreshSongs();
    } catch { /* ignore */ }
    finally { setLocalSongs(null); }
  }, [dragIdx, displaySongs, onRefreshSongs]);

  const handleDragEnd = useCallback(() => {
    setDragIdx(null);
    setDragOverIdx(null);
  }, []);

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

  const iv = imgVersion ? `?v=${imgVersion}` : '';

  const isInManualQueue = (songId) => manualQueue?.some(s => s.id === songId);
  const handleRemoveFromQueue = (songId) => {
    const idx = manualQueue?.findIndex(s => s.id === songId);
    if (idx >= 0) removeFromQueue(idx);
    closeContext();
  };

  const fmtTime = (secs) => {
    if (!secs) return '—';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="dpage" onClick={closeContext}>
      <input type="file" ref={coverInputRef} accept="image/*" style={{ display: 'none' }} onChange={handleCoverFile} />
      <div className="dpage__header-row">
        <h2>Library</h2>
        <div className="search-bar">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
          <input placeholder="Search songs..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <table className="dtable">
        <thead>
          <tr>
            <th style={{ width: 40 }}>#</th>
            <th style={{ width: 48 }}></th>
            <th className="dtable__sortable" onClick={() => handleSort('title')}>Title<SortArrow field="title" /></th>
            <th className="dtable__sortable" onClick={() => handleSort('artist')}>Artist<SortArrow field="artist" /></th>
            <th className="dtable__sortable" onClick={() => handleSort('album')}>Album<SortArrow field="album" /></th>
            <th className="dtable__sortable" style={{ width: 70 }} onClick={() => handleSort('duration')}>Duration<SortArrow field="duration" /></th>
            <th style={{ width: 80 }}></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((s, i) => (
            <tr key={s.id}
              draggable={canDrag}
              onDragStart={(e) => handleDragStart(e, i)}
              onDragOver={(e) => handleDragOver(e, i)}
              onDrop={(e) => handleDrop(e, i)}
              onDragEnd={handleDragEnd}
              onDoubleClick={() => onPlay(s)}
              onContextMenu={(e) => handleContext(e, s)}
              className={`dtable__row ${dragIdx === i ? 'dtable__row--dragging' : ''} ${dragOverIdx === i && dragIdx !== i ? 'dtable__row--drag-over' : ''}`}>
              <td className="muted" style={{ cursor: canDrag ? 'grab' : 'default' }}>
                {canDrag ? (
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style={{ opacity: .4, verticalAlign: 'middle' }}>
                    <path d="M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                  </svg>
                ) : (i + 1)}
              </td>
              <td>
                <div className="dtable__cover">
                  {s.cover_url ? <img src={`/api${s.cover_url}${iv}`} alt="" /> : <span className="dtable__cover-blank">♪</span>}
                </div>
              </td>
              <td><strong>{s.title}</strong></td>
              <td className="muted">{s.artist || '—'}</td>
              <td className="muted">{s.album || '—'}</td>
              <td className="muted">{fmtTime(s.duration)}</td>
              <td>
                <a className="dtable__action" href={`/api/download/${s.id}`} download title="Download">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                </a>
                <button className="dtable__action dtable__action--danger" onClick={() => handleDelete(s.id, s.title)} title="Delete">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

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
