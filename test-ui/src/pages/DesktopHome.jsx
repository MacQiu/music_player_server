import { useMemo, useState, useRef } from 'react';
import { createPlaylist, uploadArtistImage } from '../api/client';

export default function DesktopHome({
  songs, analytics, playlists, artists,
  onPlay, addToQueue, onRefreshPlaylists, setView,
  onOpenPlaylist, refreshArtists,
}) {
  const [showNewPlaylist, setShowNewPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const artistInputRef = useRef(null);
  const [uploadArtistName, setUploadArtistName] = useState(null);

  const recentlyPlayed = useMemo(() => {
    const top = analytics?.top_songs ?? [];
    return top.slice(0, 8).map((t) => {
      const song = songs.find((s) => s.id === t.id);
      return song || { ...t };
    });
  }, [analytics, songs]);

  const recommendations = analytics?.recommendations ?? [];

  const handleCreatePlaylist = async () => {
    const name = newPlaylistName.trim();
    if (!name) return;
    try { await createPlaylist(name); setNewPlaylistName(''); setShowNewPlaylist(false); onRefreshPlaylists(); } catch { /* ignore */ }
  };

  const handleArtistImageClick = (artistName) => {
    setUploadArtistName(artistName);
    setTimeout(() => artistInputRef.current?.click(), 0);
  };

  const handleArtistImageFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !uploadArtistName) return;
    try { await uploadArtistImage(uploadArtistName, file); refreshArtists?.(); } catch { /* ignore */ }
    setUploadArtistName(null);
    e.target.value = '';
  };

  return (
    <div className="dpage">
      <input type="file" ref={artistInputRef} accept="image/*" style={{ display: 'none' }} onChange={handleArtistImageFile} />
      <h2>Home</h2>

      <section className="dpage__section">
        <h3>Recently Played</h3>
        {recentlyPlayed.length === 0 && <p className="muted">No plays yet</p>}
        <div className="dcard-grid">
          {recentlyPlayed.map((s) => (
            <button key={s.id} className="dcard" onClick={() => onPlay(s)}>
              <div className="dcard__img">
                {s.cover_url ? <img src={`/api${s.cover_url}`} alt="" /> : <div className="dcard__img-blank">♪</div>}
              </div>
              <div className="dcard__title">{s.title}</div>
              <div className="dcard__sub">{s.artist || 'Unknown'}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="dpage__section">
        <h3>Artists</h3>
        {artists.length === 0 && <p className="muted">No artists yet</p>}
        <div className="dcard-grid">
          {artists.map((a) => (
            <div key={a.name} className="dcard dcard--round"
              onClick={() => !a.image_url && handleArtistImageClick(a.name)}
              style={!a.image_url ? { cursor: 'pointer' } : {}}>
              <div className="dcard__img dcard__img--round">
                {a.image_url ? <img src={`/api${a.image_url}`} alt="" /> : <div className="dcard__img-blank">🎤</div>}
              </div>
              <div className="dcard__title">{a.name}</div>
              <div className="dcard__sub">
                {a.song_count} song{a.song_count !== 1 ? 's' : ''}
                {!a.image_url && <span style={{ fontSize: '.65rem', marginLeft: '.3rem' }}>(click to add image)</span>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="dpage__section">
        <div className="dpage__section-header"><h3>Playlists</h3></div>
        <div className="dcard-grid">
          {playlists.map((p) => (
            <button key={p.id} className="dcard" onClick={() => onOpenPlaylist(p.id)}>
              <div className="dcard__img">
                {p.cover_url ? <img src={`/api${p.cover_url}`} alt="" /> : <div className="dcard__img-blank">♪</div>}
              </div>
              <div className="dcard__title">{p.name}</div>
              <div className="dcard__sub">{p.song_count} song{p.song_count !== 1 ? 's' : ''}</div>
            </button>
          ))}
          <button className="dcard dcard--add" onClick={() => setShowNewPlaylist(true)}>
            <div className="dcard__img"><div className="dcard__img-blank">+</div></div>
            <div className="dcard__title">New Playlist</div>
          </button>
        </div>
        {showNewPlaylist && (
          <div className="inline-form" style={{ marginTop: '.5rem' }}>
            <input placeholder="Playlist name" value={newPlaylistName} onChange={(e) => setNewPlaylistName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreatePlaylist()} autoFocus />
            <button className="btn btn--sm" onClick={handleCreatePlaylist}>Create</button>
            <button className="btn btn--sm btn--ghost" onClick={() => setShowNewPlaylist(false)}>Cancel</button>
          </div>
        )}
      </section>

      {recommendations.length > 0 && (
        <section className="dpage__section">
          <h3>Recommended</h3>
          <div className="dcard-grid">
            {recommendations.map((r) => (
              <button key={r.id} className="dcard" onClick={() => { const s = songs.find(x => x.id === r.id); if (s) onPlay(s); }}>
                <div className="dcard__img">
                  {r.cover_url ? <img src={`/api${r.cover_url}`} alt="" /> : <div className="dcard__img-blank">★</div>}
                </div>
                <div className="dcard__title">{r.title}</div>
                <div className="dcard__sub">{r.artist || 'Unknown'}</div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
