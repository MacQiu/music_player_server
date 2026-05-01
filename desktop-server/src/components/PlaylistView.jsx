import { useState, useEffect, useRef } from 'react';
import { getPlaylist, removeSongFromPlaylist, addSongToPlaylist, reorderPlaylistSongs, updatePlaylist, deletePlaylist } from '../api/client';
import SongView, { TableHeader } from './SongView';

export default function PlaylistView({
  playlistId, onBack, songs, playSong, addToQueue,
  currentSong, refreshPlaylists, refreshSongs, imgVersion,
}) {
  const [playlist, setPlaylist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddSongs, setShowAddSongs] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [scrolled, setScrolled] = useState(false);
  const [pvDragIdx, setPvDragIdx] = useState(null);
  const [pvDragOverIdx, setPvDragOverIdx] = useState(null);
  const containerRef = useRef(null);
  const nameInputRef = useRef(null);

  const isWrapped = playlist?.is_wrapped || false;
  const iv = imgVersion ? `?v=${imgVersion}` : '';

  const fetchPlaylist = async () => {
    try {
      const data = await getPlaylist(playlistId);
      setPlaylist(data);
      setNameValue(data.name);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { setLoading(true); fetchPlaylist(); }, [playlistId]);

  useEffect(() => {
    const el = containerRef.current?.closest('.desktop__main');
    if (!el) return;
    const onScroll = () => setScrolled(el.scrollTop > 280);
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const handleRemoveSong = async (songId) => {
    await removeSongFromPlaylist(playlistId, songId).catch(() => {});
    fetchPlaylist();
    refreshPlaylists();
  };

  const handleAddSong = async (songId) => {
    await addSongToPlaylist(playlistId, songId).catch(() => {});
    fetchPlaylist();
    refreshPlaylists();
  };

  const handleReorder = async (fromIdx, toIdx) => {
    if (!playlist) return;
    const newSongs = [...playlist.songs];
    const [item] = newSongs.splice(fromIdx, 1);
    newSongs.splice(toIdx, 0, item);
    setPlaylist({ ...playlist, songs: newSongs });
    await reorderPlaylistSongs(playlistId, newSongs.map(s => s.id)).catch(() => {});
  };

  const handleRename = async () => {
    const name = nameValue.trim();
    if (!name || !playlist) return;
    await updatePlaylist(playlistId, name).catch(() => {});
    setPlaylist({ ...playlist, name });
    setEditingName(false);
    refreshPlaylists();
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete playlist "${playlist?.name}"?`)) return;
    await deletePlaylist(playlistId).catch(() => {});
    refreshPlaylists();
    onBack();
  };

  const handlePlayAll = () => {
    if (!playlist || playlist.songs.length === 0) return;
    playSong(playlist.songs[0], playlist.songs);
  };

  const handleDragStart = (e, idx) => {
    setPvDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', idx);
  };
  const handlePvDragOver = (e, idx) => {
    if (pvDragIdx === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setPvDragOverIdx(idx);
  };
  const handleDrop = (e, toIdx) => {
    e.preventDefault();
    const fromIdx = pvDragIdx;
    setPvDragIdx(null);
    setPvDragOverIdx(null);
    if (fromIdx === null || fromIdx === toIdx) return;
    handleReorder(fromIdx, toIdx);
  };
  const handlePvDragEnd = () => { setPvDragIdx(null); setPvDragOverIdx(null); };

  const playlistSongIds = new Set(playlist?.songs?.map(s => s.id) || []);
  const availableSongs = songs.filter(s =>
    !playlistSongIds.has(s.id) &&
    (s.title.toLowerCase().includes(addSearch.toLowerCase()) ||
      (s.artist || '').toLowerCase().includes(addSearch.toLowerCase()))
  );

  const coverSong = playlist?.songs?.find(s => s.cover_url);
  const coverUrl = coverSong?.cover_url ? `/api${coverSong.cover_url}${iv}` : null;

  const fmtDuration = (secs) => {
    if (!secs) return '0:00';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h) return `${h}h ${m}m`;
    return `${m} min ${s} sec`;
  };

  const fmtListeningTime = (secs) => {
    if (!secs) return '0s';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    const parts = [];
    if (h) parts.push(`${h}h`);
    if (m) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
  };

  const totalDuration = playlist?.songs?.reduce((acc, s) => acc + (s.duration || 0), 0) || 0;

  if (loading) {
    return (
      <div className="pv" ref={containerRef}>
        <div className="pv__sticky-header">
          <button className="pv__back" onClick={onBack}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6z"/></svg>
          </button>
        </div>
        <p className="muted" style={{ padding: '4rem', textAlign: 'center' }}>Loading...</p>
      </div>
    );
  }

  return (
    <div className="pv" ref={containerRef}>
      {scrolled && (
        <div className="pv__sticky-header pv__sticky-header--visible">
          <button className="pv__back" onClick={onBack}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6z"/></svg>
          </button>
          <button className="pv__play-circle" onClick={handlePlayAll}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="#000"><path d="M8 5v14l11-7z"/></svg>
          </button>
          <h2 className="pv__sticky-title">{playlist?.name}</h2>
        </div>
      )}

      <div className="pv__hero" style={coverUrl ? { backgroundImage: `linear-gradient(transparent 0, rgba(18,18,18,.6) 100%), url(${coverUrl})` } : {}}>
        <button className="pv__back pv__back--hero" onClick={onBack}>
          <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6z"/></svg>
        </button>
        <div className="pv__hero-inner">
          <div className="pv__cover">
            {coverUrl ? <img src={coverUrl} alt="" /> : <div className="pv__cover-blank">♪</div>}
          </div>
          <div className="pv__meta">
            <span className="pv__type">{isWrapped ? 'Wrapped' : 'Playlist'}</span>
            {!isWrapped && editingName ? (
              <input className="pv__name-input" value={nameValue}
                onChange={e => setNameValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleRename()}
                onBlur={handleRename} autoFocus ref={nameInputRef} />
            ) : (
              <h1 className="pv__name"
                onClick={isWrapped ? undefined : () => setEditingName(true)}
                style={isWrapped ? { cursor: 'default' } : undefined}>{playlist?.name}</h1>
            )}
            <div className="pv__stats">
              {playlist?.songs?.length || 0} songs &middot; {fmtDuration(totalDuration)}
            </div>
          </div>
        </div>
      </div>

      <div className="pv__controls">
        <button className="pv__play-circle pv__play-circle--large" onClick={handlePlayAll} disabled={!playlist?.songs?.length}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="#000"><path d="M8 5v14l11-7z"/></svg>
        </button>
        {!isWrapped && (
          <>
            <button className="btn btn--ghost" onClick={() => setShowAddSongs(!showAddSongs)}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
              Add Songs
            </button>
            <button className="btn btn--ghost btn--danger" onClick={handleDelete} title="Delete Playlist">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </button>
          </>
        )}
      </div>

      {!isWrapped && showAddSongs && (
        <div className="pv__add-section">
          <div className="search-bar" style={{ marginBottom: '.5rem' }}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
            <input placeholder="Search songs to add..." value={addSearch} onChange={e => setAddSearch(e.target.value)} />
          </div>
          <div className="pv__add-list">
            {availableSongs.slice(0, 20).map(song => (
              <div key={song.id} className="pv__add-item">
                <div className="pv__add-cover">
                  {song.cover_url ? <img src={`/api${song.cover_url}${iv}`} alt="" /> : <span>♪</span>}
                </div>
                <div className="pv__add-info">
                  <div className="pv__add-title">{song.title}</div>
                  <div className="pv__add-artist">{song.artist || 'Unknown'}</div>
                </div>
                <button className="btn btn--sm" onClick={() => handleAddSong(song.id)}>+</button>
              </div>
            ))}
            {availableSongs.length === 0 && <p className="muted" style={{ padding: '.5rem' }}>No songs to add</p>}
          </div>
        </div>
      )}

      <TableHeader
        fields={isWrapped ? ['#', 'Title', '', '', 'Plays', 'Time', ''] : ['#', 'Title', 'Artist', 'Album', '', 'Duration', '']}
        weights={isWrapped ? [1, 8, 0, 0, 2, 2, 1] : [1, 8, 5, 5, 1, 2, 1]}
      />

      <div className="pv__songs">
        {(playlist?.songs || []).map((song, idx) => (
          <SongView
            key={song.id}
            song={song}
            index={idx}
            isActive={currentSong?.id === song.id}
            onPlay={() => playSong(song, playlist.songs)}
            onDoubleClick={() => playSong(song, playlist.songs)}
            showArtist={!isWrapped}
            showAlbum={!isWrapped}
            showDuration={!isWrapped}
            weights={isWrapped ? [1, 8, 0, 0, 2, 2, 1] : [1, 8, 5, 5, 1, 2, 1]}
            imgVersion={imgVersion}
            draggable={!isWrapped}
            onDragStart={!isWrapped ? (e) => handleDragStart(e, idx) : undefined}
            onDragOver={!isWrapped ? (e) => handlePvDragOver(e, idx) : undefined}
            onDrop={!isWrapped ? (e) => handleDrop(e, idx) : undefined}
            onDragEnd={!isWrapped ? handlePvDragEnd : undefined}
            isDragging={pvDragIdx === idx}
            dragOverPosition={pvDragOverIdx === idx && pvDragIdx !== null && pvDragIdx !== idx ? (pvDragIdx < idx ? 'below' : 'above') : undefined}
            actions={
              isWrapped ? (
                <div className="pv__song-stats">
                  <span>{song.play_count || 0} plays</span>
                  <span>{fmtListeningTime(song.total_time)}</span>
                </div>
              ) : (
                <div className="sv-actions">
                  <button className="sv-action-btn" onClick={(e) => { e.stopPropagation(); addToQueue(song); }} title="Add to Queue">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18a3 3 0 103 3V8h3V6h-5z"/></svg>
                  </button>
                  <button className="sv-action-btn sv-action-btn--danger" onClick={(e) => { e.stopPropagation(); handleRemoveSong(song.id); }} title="Remove">✕</button>
                </div>
              )
            }
          />
        ))}
        {(!playlist?.songs || playlist.songs.length === 0) && (
          <p className="muted" style={{ padding: '2rem', textAlign: 'center' }}>No songs in this playlist</p>
        )}
      </div>
    </div>
  );
}
