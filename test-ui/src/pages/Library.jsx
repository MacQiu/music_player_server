import { useState, useRef } from 'react';
import { uploadCover, addSongToPlaylist } from '../api/client';

export default function Library({ songs, onPlay, addToQueue, playlists, refreshSongs }) {
  const [search, setSearch] = useState('');
  const [menuIdx, setMenuIdx] = useState(null);
  const [showPlaylistSub, setShowPlaylistSub] = useState(null);
  const coverInputRef = useRef(null);
  const [coverSongId, setCoverSongId] = useState(null);

  const filtered = songs.filter((s) => {
    const q = search.toLowerCase();
    return s.title.toLowerCase().includes(q) || (s.artist || '').toLowerCase().includes(q);
  });

  const handleSetCover = (songId) => {
    setCoverSongId(songId);
    setMenuIdx(null);
    setTimeout(() => coverInputRef.current?.click(), 0);
  };

  const handleCoverFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !coverSongId) return;
    try { await uploadCover(coverSongId, file); refreshSongs?.(); } catch { /* ignore */ }
    setCoverSongId(null);
    e.target.value = '';
  };

  const handleAddToPlaylist = async (playlistId, songId) => {
    try { await addSongToPlaylist(playlistId, songId); } catch { /* ignore */ }
    setMenuIdx(null);
    setShowPlaylistSub(null);
  };

  return (
    <div className="page page--library">
      <h2>Library</h2>
      <input type="file" ref={coverInputRef} accept="image/*" style={{ display: 'none' }} onChange={handleCoverFile} />
      <div className="search-bar search-bar--mobile">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
        <input placeholder="Search songs..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {filtered.length === 0 && <p className="muted">No songs found</p>}
      <ul className="song-list">
        {filtered.map((song, idx) => (
          <li key={song.id} className="song-item" onClick={() => onPlay(song)}>
            <div className="song-item__cover">
              {song.cover_url ? <img src={`/api${song.cover_url}`} alt="" /> : <span className="song-item__cover-blank">♪</span>}
            </div>
            <div className="song-item__info">
              <strong>{song.title}</strong>
              <span>{song.artist || 'Unknown Artist'}</span>
            </div>
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
          </li>
        ))}
      </ul>
    </div>
  );
}
