import { useState, useEffect, useRef } from 'react';
import { getPlaylist, removeSongFromPlaylist, addSongToPlaylist, reorderPlaylistSongs, updatePlaylist, deletePlaylist } from '../api/client';

export default function PlaylistOverlay({
  playlistId, onClose, songs, playSong, addToQueue,
  refreshPlaylists, refreshSongs,
}) {
  const [playlist, setPlaylist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddSongs, setShowAddSongs] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const nameInputRef = useRef(null);

  const fetchPlaylist = async () => {
    try {
      const data = await getPlaylist(playlistId);
      setPlaylist(data);
      setNameValue(data.name);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchPlaylist(); }, [playlistId]);

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
    onClose();
  };

  const handlePlayAll = () => {
    if (!playlist || playlist.songs.length === 0) return;
    playSong(playlist.songs[0], playlist.songs);
  };

  const handlePlaySong = (song) => {
    playSong(song, playlist.songs);
  };

  const handleDragStart = (e, idx) => { e.dataTransfer.setData('text/plain', idx); };
  const handleDrop = (e, toIdx) => {
    e.preventDefault();
    const fromIdx = Number(e.dataTransfer.getData('text/plain'));
    if (fromIdx !== toIdx) handleReorder(fromIdx, toIdx);
  };

  const playlistSongIds = new Set(playlist?.songs?.map(s => s.id) || []);
  const availableSongs = songs.filter(s =>
    !playlistSongIds.has(s.id) &&
    (s.title.toLowerCase().includes(addSearch.toLowerCase()) ||
     (s.artist || '').toLowerCase().includes(addSearch.toLowerCase()))
  );

  const coverUrl = playlist?.songs?.[0]?.cover_url ? `/api${playlist.songs[0].cover_url}` : null;

  const fmtDuration = (secs) => {
    if (!secs) return '0:00';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const totalDuration = playlist?.songs?.reduce((acc, s) => acc + (s.duration || 0), 0) || 0;

  if (loading) {
    return (
      <div className="playlist-overlay">
        <div className="playlist-overlay__header-bar">
          <button className="playlist-overlay__back" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6z"/></svg>
          </button>
        </div>
        <p className="muted" style={{ padding: '2rem', textAlign: 'center' }}>Loading...</p>
      </div>
    );
  }

  return (
    <div className="playlist-overlay">
      <div className="playlist-overlay__header-bar">
        <button className="playlist-overlay__back" onClick={onClose}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6z"/></svg>
        </button>
      </div>

      <div className="playlist-overlay__hero">
        <div className="playlist-overlay__cover">
          {coverUrl ? <img src={coverUrl} alt="" /> : <div className="playlist-overlay__cover-blank">♪</div>}
        </div>
        <div className="playlist-overlay__meta">
          {editingName ? (
            <input className="playlist-overlay__name-input" value={nameValue}
              onChange={e => setNameValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleRename()}
              onBlur={handleRename} autoFocus ref={nameInputRef} />
          ) : (
            <h2 className="playlist-overlay__name" onClick={() => setEditingName(true)}>{playlist?.name}</h2>
          )}
          <div className="playlist-overlay__stats">
            {playlist?.songs?.length || 0} tracks &middot; {fmtDuration(totalDuration)}
          </div>
        </div>
      </div>

      <div className="playlist-overlay__actions">
        <button className="btn btn--primary" onClick={handlePlayAll} disabled={!playlist?.songs?.length}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          Play All
        </button>
        <button className="btn btn--ghost" onClick={() => setShowAddSongs(!showAddSongs)}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
          Add Songs
        </button>
        <button className="btn btn--ghost btn--danger" onClick={handleDelete} title="Delete Playlist">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      </div>

      {showAddSongs && (
        <div className="playlist-overlay__add-section">
          <div className="search-bar" style={{ marginBottom: '.5rem' }}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
            <input placeholder="Search songs to add..." value={addSearch} onChange={e => setAddSearch(e.target.value)} />
          </div>
          <div className="playlist-overlay__add-list">
            {availableSongs.slice(0, 20).map(song => (
              <div key={song.id} className="playlist-overlay__add-item">
                <div className="playlist-overlay__add-cover">
                  {song.cover_url ? <img src={`/api${song.cover_url}`} alt="" /> : <span>♪</span>}
                </div>
                <div className="playlist-overlay__add-info">
                  <div className="playlist-overlay__add-title">{song.title}</div>
                  <div className="playlist-overlay__add-artist">{song.artist || 'Unknown'}</div>
                </div>
                <button className="btn btn--sm" onClick={() => handleAddSong(song.id)}>+</button>
              </div>
            ))}
            {availableSongs.length === 0 && <p className="muted" style={{ padding: '.5rem' }}>No songs to add</p>}
          </div>
        </div>
      )}

      <div className="playlist-overlay__songs">
        {(playlist?.songs || []).map((song, idx) => (
          <div key={song.id} className="playlist-overlay__song-row"
            draggable onDragStart={e => handleDragStart(e, idx)}
            onDragOver={e => e.preventDefault()} onDrop={e => handleDrop(e, idx)}>
            <div className="playlist-overlay__song-cover" onClick={() => handlePlaySong(song)}>
              {song.cover_url ? <img src={`/api${song.cover_url}`} alt="" /> : <span>♪</span>}
            </div>
            <div className="playlist-overlay__song-info" onClick={() => handlePlaySong(song)}>
              <div className="playlist-overlay__song-title">{song.title}</div>
              <div className="playlist-overlay__song-artist">{song.artist || 'Unknown'}</div>
            </div>
            <button className="btn btn--sm btn--ghost" onClick={() => addToQueue(song)} title="Add to Queue">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18a3 3 0 103 3V8h3V6h-5z"/></svg>
            </button>
            <button className="btn btn--sm btn--ghost" onClick={() => handleRemoveSong(song.id)} title="Remove">✕</button>
            <span className="playlist-overlay__drag">☰</span>
          </div>
        ))}
        {(!playlist?.songs || playlist.songs.length === 0) && (
          <p className="muted" style={{ padding: '1rem', textAlign: 'center' }}>No songs in this playlist</p>
        )}
      </div>
    </div>
  );
}
