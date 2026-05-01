import { useMemo, useState, useRef } from 'react';
import { createPlaylist, uploadArtistImage } from '../api/client';
import GridCard, { HorizontalCard, SectionHeader } from '../components/GridCard';

export default function DesktopHome({
  songs, analytics, playlists, artists,
  onPlay, addToQueue, onRefreshPlaylists,
  onOpenPlaylist, onOpenArtist, refreshArtists,
  imgVersion, bumpImgVersion,
}) {
  const [showNewPlaylist, setShowNewPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const artistInputRef = useRef(null);
  const [uploadArtistName, setUploadArtistName] = useState(null);

  const iv = imgVersion ? `?v=${imgVersion}` : '';

  const recentlyPlayed = useMemo(() => {
    const top = analytics?.top_songs ?? [];
    return top.slice(0, 8).map((t) => {
      const song = songs.find((s) => s.id === t.id);
      return song || { ...t };
    });
  }, [analytics, songs]);

  const recommendations = analytics?.recommendations ?? [];

  const isPlaybackPlaylist = (name) => /^Your \d{4} Playback$/.test(name);
  const userPlaylists = useMemo(() => (playlists || []).filter(p => !isPlaybackPlaylist(p.name)), [playlists]);
  const wrappedPlaylists = useMemo(() => (playlists || []).filter(p => isPlaybackPlaylist(p.name)), [playlists]);

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
    try { await uploadArtistImage(uploadArtistName, file); refreshArtists?.(); bumpImgVersion?.(); } catch { /* ignore */ }
    setUploadArtistName(null);
    e.target.value = '';
  };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  return (
    <div className="home-page">
      <input type="file" ref={artistInputRef} accept="image/*" style={{ display: 'none' }} onChange={handleArtistImageFile} />

      <h1 className="home-page__greeting">{greeting()}</h1>

      {recentlyPlayed.length > 0 && (
        <div className="home-page__top-tracks">
          {recentlyPlayed.slice(0, 8).map((s) => (
            <HorizontalCard key={s.id}
              imgSrc={s.cover_url ? `/api${s.cover_url}${iv}` : null}
              title={s.title}
              onClick={() => onPlay(s)}
              onPlay={() => onPlay(s)}
            />
          ))}
        </div>
      )}

      {recentlyPlayed.length === 0 && (
        <section className="home-page__section">
          <SectionHeader title="Recently Played" />
          <p className="muted">No plays yet</p>
        </section>
      )}

      {artists.length > 0 && (
        <section className="home-page__section">
          <SectionHeader title="Artists" />
          <div className="home-page__grid">
            {artists.map((a) => (
              <GridCard key={a.name}
                imgSrc={a.image_url ? `/api${a.image_url}${iv}` : null}
                title={a.name}
                subtitle={`${a.song_count} song${a.song_count !== 1 ? 's' : ''}`}
                round
                onClick={() => onOpenArtist?.(a.name)}
                placeholder="🎤"
              />
            ))}
          </div>
        </section>
      )}

      <section className="home-page__section">
        <SectionHeader title="Playlists" />
        <div className="home-page__grid">
          {userPlaylists.map((p) => (
            <GridCard key={p.id}
              imgSrc={p.cover_url ? `/api${p.cover_url}${iv}` : null}
              title={p.name}
              subtitle={`${p.song_count} song${p.song_count !== 1 ? 's' : ''}`}
              onClick={() => onOpenPlaylist(p.id)}
            />
          ))}
          <GridCard title="New Playlist" dashed placeholder="+"
            onClick={() => setShowNewPlaylist(true)} />
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

      {wrappedPlaylists.length > 0 && (
        <section className="home-page__section">
          <SectionHeader title="Wrapped" />
          <div className="home-page__grid">
            {wrappedPlaylists.map((p) => (
              <GridCard key={p.id}
                imgSrc={p.cover_url ? `/api${p.cover_url}${iv}` : null}
                title={p.name}
                subtitle={`${p.song_count} song${p.song_count !== 1 ? 's' : ''}`}
                onClick={() => onOpenPlaylist(p.id)}
                placeholder="🎁"
              />
            ))}
          </div>
        </section>
      )}

      {recommendations.length > 0 && (
        <section className="home-page__section">
          <SectionHeader title="Recommended" />
          <div className="home-page__grid">
            {recommendations.map((r) => (
              <GridCard key={r.id}
                imgSrc={r.cover_url ? `/api${r.cover_url}${iv}` : null}
                title={r.title}
                subtitle={r.artist || 'Unknown'}
                onClick={() => { const s = songs.find(x => x.id === r.id); if (s) onPlay(s); }}
                onPlay={() => { const s = songs.find(x => x.id === r.id); if (s) onPlay(s); }}
                placeholder="★"
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
