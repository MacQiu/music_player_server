import { useMemo, useState, useRef } from 'react';
import { createPlaylist, uploadArtistImage } from '../api/client';

export default function Home({ songs, analytics, playlists, artists, onPlay, onRefreshPlaylists, addToQueue, onOpenPlaylist, refreshArtists }) {
  const [showNewPlaylist, setShowNewPlaylist] = useState(false);
  const [newName, setNewName] = useState('');
  const artistInputRef = useRef(null);
  const [uploadArtistName, setUploadArtistName] = useState(null);

  const recentlyPlayed = useMemo(() => {
    const top = analytics?.top_songs ?? [];
    return top.slice(0, 5).map((t) => {
      const song = songs.find((s) => s.id === t.id);
      return song || { ...t };
    });
  }, [analytics, songs]);

  const derivedArtists = useMemo(() => {
    if (artists && artists.length > 0) return artists;
    const map = {};
    songs.forEach((s) => {
      const key = s.artist || 'Unknown';
      if (!map[key]) map[key] = { name: key, song_count: 0, image_url: null };
      map[key].song_count++;
    });
    return Object.values(map);
  }, [artists, songs]);

  const recommendations = analytics?.recommendations ?? [];

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    try { await createPlaylist(name); setNewName(''); setShowNewPlaylist(false); onRefreshPlaylists(); } catch { /* ignore */ }
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
    <div className="page page--home">
      <input type="file" ref={artistInputRef} accept="image/*" style={{ display: 'none' }} onChange={handleArtistImageFile} />
      <h2>Home</h2>

      <section>
        <h3>Recently Played</h3>
        {recentlyPlayed.length === 0 && <p className="muted">No plays yet</p>}
        <div className="card-row">
          {recentlyPlayed.map((s) => (
            <button key={s.id} className="card" onClick={() => onPlay(s)}>
              <div className="card__img">
                {s.cover_url ? <img src={`/api${s.cover_url}`} alt="" /> : <div className="card__img-blank">♪</div>}
              </div>
              <div className="card__title">{s.title}</div>
              <div className="card__sub">{s.artist || 'Unknown'}</div>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3>Artists</h3>
        {derivedArtists.length === 0 && <p className="muted">No artists yet</p>}
        <div className="card-row">
          {derivedArtists.map((a) => (
            <div key={a.name} className="card"
              onClick={() => !a.image_url && handleArtistImageClick(a.name)}
              style={!a.image_url ? { cursor: 'pointer' } : {}}>
              <div className="card__img card__img--round">
                {a.image_url ? <img src={`/api${a.image_url}`} alt="" /> : <div className="card__img-blank">🎤</div>}
              </div>
              <div className="card__title">{a.name}</div>
              <div className="card__sub">
                {a.song_count} song{a.song_count !== 1 ? 's' : ''}
                {!a.image_url && <span style={{ fontSize: '.6rem' }}> (tap to add)</span>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3>Playlists</h3>
        <div className="card-row">
          {(playlists || []).map((p) => (
            <button key={p.id} className="card" onClick={() => onOpenPlaylist(p.id)}>
              <div className="card__img">
                {p.cover_url ? <img src={`/api${p.cover_url}`} alt="" /> : <div className="card__img-blank">♪</div>}
              </div>
              <div className="card__title">{p.name}</div>
              <div className="card__sub">{p.song_count} song{p.song_count !== 1 ? 's' : ''}</div>
            </button>
          ))}
          <button className="card card--add" onClick={() => setShowNewPlaylist(true)}>
            <div className="card__img"><div className="card__img-blank">+</div></div>
            <div className="card__title">New Playlist</div>
          </button>
        </div>
        {showNewPlaylist && (
          <div className="inline-form">
            <input placeholder="Playlist name" value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()} autoFocus />
            <button className="btn btn--sm" onClick={handleCreate}>Create</button>
            <button className="btn btn--sm btn--ghost" onClick={() => setShowNewPlaylist(false)}>Cancel</button>
          </div>
        )}
      </section>

      {recommendations.length > 0 && (
        <section>
          <h3>Recommended</h3>
          <div className="card-row">
            {recommendations.map((r) => (
              <button key={r.id} className="card" onClick={() => { const s = songs.find(x => x.id === r.id); if (s) onPlay(s); }}>
                <div className="card__img">
                  {r.cover_url ? <img src={`/api${r.cover_url}`} alt="" /> : <div className="card__img-blank">★</div>}
                </div>
                <div className="card__title">{r.title}</div>
                <div className="card__sub">{r.artist || 'Unknown'}</div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
