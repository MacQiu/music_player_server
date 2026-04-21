import { useState, useRef, useMemo, useCallback } from 'react';
import { uploadCover, addSongToPlaylist, reorderLibrary } from '../api/client';

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

export default function Library({ songs, onPlay, addToQueue, playlists, refreshSongs, imgVersion, bumpImgVersion }) {
  const [search, setSearch] = useState('');
  const [menuIdx, setMenuIdx] = useState(null);
  const [showPlaylistSub, setShowPlaylistSub] = useState(null);
  const coverInputRef = useRef(null);
  const [coverSongId, setCoverSongId] = useState(null);
  const [sortField, setSortField] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [reorderMode, setReorderMode] = useState(false);
  const [localSongs, setLocalSongs] = useState(null);

  const displaySongs = localSongs || songs;
  const isSearching = search.trim().length > 0;
  const isSorting = sortField !== null;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const list = displaySongs.filter((s) =>
      s.title.toLowerCase().includes(q) || (s.artist || '').toLowerCase().includes(q)
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

  const moveItem = useCallback(async (fromIdx, toIdx) => {
    if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0 || toIdx >= displaySongs.length) return;
    const reordered = [...displaySongs];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    setLocalSongs(reordered);
    try {
      await reorderLibrary(reordered.map(s => s.id));
      refreshSongs?.();
    } catch { /* ignore */ }
    finally { setLocalSongs(null); }
  }, [displaySongs, refreshSongs]);

  const handleSetCover = (songId) => {
    setCoverSongId(songId);
    setMenuIdx(null);
    setTimeout(() => coverInputRef.current?.click(), 0);
  };

  const handleCoverFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !coverSongId) return;
    try { await uploadCover(coverSongId, file); refreshSongs?.(); bumpImgVersion?.(); } catch { /* ignore */ }
    setCoverSongId(null);
    e.target.value = '';
  };

  const iv = imgVersion ? `?v=${imgVersion}` : '';

  const handleAddToPlaylist = async (playlistId, songId) => {
    try { await addSongToPlaylist(playlistId, songId); } catch { /* ignore */ }
    setMenuIdx(null);
    setShowPlaylistSub(null);
  };

  const canReorder = reorderMode && !isSearching && !isSorting;

  return (
    <div className="page page--library">
      <h2>Library</h2>
      <input type="file" ref={coverInputRef} accept="image/*" style={{ display: 'none' }} onChange={handleCoverFile} />
      <div className="search-bar search-bar--mobile">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
        <input placeholder="Search songs..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="sort-pills">
        {[['title', 'Title'], ['artist', 'Artist'], ['duration', 'Duration']].map(([f, label]) => (
          <button key={f}
            className={`sort-pill ${sortField === f ? 'sort-pill--active' : ''}`}
            onClick={() => handleSort(f)}>
            {label}{sortField === f ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
          </button>
        ))}
        <button
          className={`sort-pill ${reorderMode ? 'sort-pill--active' : ''}`}
          onClick={() => setReorderMode(m => !m)}>
          Reorder
        </button>
      </div>
      {filtered.length === 0 && <p className="muted">No songs found</p>}
      <ul className="song-list">
        {filtered.map((song, idx) => (
          <li key={song.id} className="song-item" onClick={() => !canReorder && onPlay(song)}>
            {canReorder && (
              <div className="song-item__reorder">
                <button className="song-item__reorder-btn" onClick={(e) => { e.stopPropagation(); moveItem(idx, idx - 1); }}
                  disabled={idx === 0}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/></svg>
                </button>
                <button className="song-item__reorder-btn" onClick={(e) => { e.stopPropagation(); moveItem(idx, idx + 1); }}
                  disabled={idx === filtered.length - 1}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>
                </button>
              </div>
            )}
            <div className="song-item__cover">
              {song.cover_url ? <img src={`/api${song.cover_url}${iv}`} alt="" /> : <span className="song-item__cover-blank">♪</span>}
            </div>
            <div className="song-item__info">
              <strong>{song.title}</strong>
              <span>{song.artist || 'Unknown Artist'}</span>
            </div>
            {!canReorder && (
              <div className="song-item__actions">
                <button className="btn btn--sm btn--ghost"
                  onClick={(e) => { e.stopPropagation(); setMenuIdx(menuIdx === idx ? null : idx); setShowPlaylistSub(null); }}
                  title="More">⋯</button>
                {menuIdx === idx && (
                  <div className="song-item__menu" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => { onPlay(song); setMenuIdx(null); }}>Play Now</button>
                    <button onClick={() => { addToQueue(song); setMenuIdx(null); }}>Add to Queue</button>
                    <button onClick={() => handleSetCover(song.id)}>Set Cover</button>
                    {playlists && playlists.length > 0 && (
                      <>
                        <button onClick={() => setShowPlaylistSub(showPlaylistSub ? null : song.id)}>
                          Add to Playlist ▸
                        </button>
                        {showPlaylistSub === song.id && playlists.map(p => (
                          <button key={p.id} style={{ paddingLeft: '1.2rem' }} onClick={() => handleAddToPlaylist(p.id, song.id)}>
                            {p.name}
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
