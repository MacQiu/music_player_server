import React, { useMemo, useState, useCallback } from 'react';
import CoverImage from '../components/CoverImage';
import ScrollPage from '../components/ScrollPage';
import { useData } from '../contexts/DataContext';
import { usePlayer } from '../contexts/PlayerContext';
import { useNav } from '../navigation/Navigator';
import { createPlaylist } from '../api/client';
import { isPlaybackPlaylist } from '../utils/format';
import WrappedSyncBanner from '../components/WrappedSyncBanner';

function HorizontalCard({ title, coverUrl, songId, onPress, imgVersion }: any) {
  return (
    <div className="hcard" onClick={onPress}>
      <CoverImage coverUrl={coverUrl} songId={songId} size={56} imgVersion={imgVersion} />
      <div className="hcard-title ellipsis">{title}</div>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <div className="section-hdr"><h2>{title}</h2></div>;
}

interface CardProps {
  title: string;
  subtitle: string;
  coverUrl?: string | null;
  songId?: string;
  cacheKey?: string;
  placeholder?: React.ReactNode;
  round?: boolean;
  onPress: () => void;
  imgVersion?: number;
  dashed?: boolean;
}

const CARD_IMG_SIZE = 150 - 8 * 2;

function Card({ title, subtitle, coverUrl, songId, cacheKey, placeholder = '\u266A', round, onPress, imgVersion, dashed }: CardProps) {
  return (
    <div className={`card ${dashed ? 'dashed' : ''}`} onClick={onPress}>
      <div className="card-img" style={round ? { borderRadius: '50%' } : undefined}>
        <CoverImage coverUrl={coverUrl} songId={songId} cacheKey={cacheKey} size={CARD_IMG_SIZE}
          round={round} placeholder={placeholder} imgVersion={imgVersion} />
      </div>
      <div className="card-title ellipsis">{title}</div>
      <div className="card-sub ellipsis">{subtitle}</div>
    </div>
  );
}

function CardRow({ children }: { children: React.ReactNode }) {
  return <div className="card-row">{children}</div>;
}

export default function HomeScreen() {
  const { songs, analytics, playlists, artists, imgVersion, refreshPlaylists, refreshAll, online } = useData();
  const { playSong } = usePlayer();
  const { push } = useNav();
  const [showNewPlaylist, setShowNewPlaylist] = useState(false);
  const [newName, setNewName] = useState('');

  const onRefresh = useCallback(async () => { await refreshAll(); }, [refreshAll]);

  const safeSongs = songs || [];

  const topTracks = useMemo(() => {
    const top = analytics?.top_songs ?? [];
    return top.slice(0, 8).map((t: any) => {
      const song = safeSongs.find(s => s.id === t.id);
      return song || { ...t };
    });
  }, [analytics, safeSongs]);

  const derivedArtists = useMemo(() => {
    if (artists && artists.length > 0) return artists;
    const map: Record<string, any> = {};
    safeSongs.forEach(s => {
      const key = s.artist || 'Unknown';
      if (!map[key]) map[key] = { name: key, song_count: 0, image_url: null };
      map[key].song_count++;
    });
    return Object.values(map);
  }, [artists, safeSongs]);

  const recommendations = analytics?.recommendations ?? [];
  const userPlaylists = useMemo(() => (playlists || []).filter(p => !isPlaybackPlaylist(p.name)), [playlists]);
  const wrappedPlaylists = useMemo(() => (playlists || []).filter(p => isPlaybackPlaylist(p.name)), [playlists]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    if (!online) { alert('Connect to the server to create playlists.'); return; }
    try {
      await createPlaylist(name);
      setNewName('');
      setShowNewPlaylist(false);
      refreshPlaylists();
    } catch { }
  };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  return (
    <ScrollPage onRefresh={onRefresh}>
      <div style={{ padding: '0 16px 16px' }}>
        <div className="greeting-gradient">
          <div className="greeting">{greeting()}</div>
        </div>
        <WrappedSyncBanner />

        {topTracks.length > 0 && (
          <div className="top-grid">
            {topTracks.slice(0, 8).map((s: any) => (
              <HorizontalCard key={s.id} title={s.title}
                coverUrl={s.cover_url} songId={s.id} imgVersion={imgVersion}
                onPress={() => playSong(s, safeSongs)} />
            ))}
          </div>
        )}

        {topTracks.length === 0 && (
          <>
            <SectionHeader title="Recently Played" />
            <div className="muted">No plays yet</div>
          </>
        )}

        {derivedArtists.length > 0 && (
          <>
            <SectionHeader title="Artists" />
            <CardRow>
              {derivedArtists.map((a: any) => (
                <Card key={a.name} title={a.name}
                  subtitle={`${a.song_count} song${a.song_count !== 1 ? 's' : ''}`}
                  coverUrl={a.image_url} cacheKey={`artist_${a.name}`} round placeholder={'\uD83C\uDFA4'}
                  imgVersion={imgVersion}
                  onPress={() => push({ name: 'artist', artist: a.name })} />
              ))}
            </CardRow>
          </>
        )}

        <SectionHeader title="Playlists" />
        <CardRow>
          {userPlaylists.map(p => (
            <Card key={p.id} title={p.name}
              subtitle={`${p.song_count} song${p.song_count !== 1 ? 's' : ''}`}
              coverUrl={p.cover_url} cacheKey={`playlist_${p.id}`} imgVersion={imgVersion}
              onPress={() => push({ name: 'playlist', id: p.id })} />
          ))}
          <Card title="New Playlist" subtitle="" placeholder="+"
            dashed onPress={() => setShowNewPlaylist(true)} />
        </CardRow>
        {showNewPlaylist && (
          <div className="inline-form">
            <input className="input" placeholder="Playlist name" value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }} autoFocus />
            <button className="btn-primary" onClick={handleCreate}>Create</button>
            <button className="btn-ghost" onClick={() => setShowNewPlaylist(false)}>Cancel</button>
          </div>
        )}

        {wrappedPlaylists.length > 0 && (
          <>
            <SectionHeader title="Wrapped" />
            <CardRow>
              {wrappedPlaylists.map(p => (
                <Card key={p.id} title={p.name}
                  subtitle={`${p.song_count} song${p.song_count !== 1 ? 's' : ''}`}
                  coverUrl={p.cover_url} cacheKey={`playlist_${p.id}`} imgVersion={imgVersion} placeholder={'\uD83C\uDF81'}
                  onPress={() => push({ name: 'playlist', id: p.id })} />
              ))}
            </CardRow>
          </>
        )}

        {recommendations.length > 0 && (
          <>
            <SectionHeader title="Recommended" />
            <CardRow>
              {recommendations.map((r: any) => {
                const full = safeSongs.find(x => x.id === r.id);
                return (
                  <Card key={r.id} title={r.title} subtitle={r.artist || 'Unknown'}
                    coverUrl={r.cover_url} songId={r.id} imgVersion={imgVersion} placeholder={'\u2605'}
                    onPress={() => { if (full) playSong(full, safeSongs); }} />
                );
              })}
            </CardRow>
          </>
        )}

        <div style={{ height: 100 }} />
      </div>
    </ScrollPage>
  );
}
