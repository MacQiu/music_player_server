import { useState, useMemo } from 'react';
import { createPlaylist } from '../api/client';

const isPlaybackPlaylist = (name) => /^Your \d{4} Playback$/.test(name);

export default function Sidebar({
  view, navigateTo, playlists, artists, songs,
  onRefreshPlaylists, onOpenPlaylist, onOpenArtist,
  devMode, collapsed, onToggleCollapse,
  imgVersion, currentSong,
}) {
  const [filter, setFilter] = useState(null);
  const [showNewPlaylist, setShowNewPlaylist] = useState(false);
  const [newName, setNewName] = useState('');

  const iv = imgVersion ? `?v=${imgVersion}` : '';

  const userPlaylists = useMemo(() => (playlists || []).filter(p => !isPlaybackPlaylist(p.name)), [playlists]);
  const wrappedPlaylists = useMemo(() => (playlists || []).filter(p => isPlaybackPlaylist(p.name)), [playlists]);

  const libraryItems = useMemo(() => {
    const items = [];
    if (!filter || filter === 'playlists') {
      userPlaylists.forEach(p => items.push({ type: 'playlist', id: p.id, name: p.name, count: p.song_count, coverUrl: p.cover_url }));
    }
    if (!filter || filter === 'wrapped') {
      wrappedPlaylists.forEach(p => items.push({ type: 'wrapped', id: p.id, name: p.name, count: p.song_count, coverUrl: p.cover_url }));
    }
    if (!filter || filter === 'artists') {
      (artists || []).forEach(a => items.push({ type: 'artist', name: a.name, count: a.song_count, imageUrl: a.image_url }));
    }
    return items;
  }, [filter, userPlaylists, wrappedPlaylists, artists]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await createPlaylist(name);
      setNewName('');
      setShowNewPlaylist(false);
      onRefreshPlaylists();
    } catch { /* ignore */ }
  };

  const handleItemClick = (item) => {
    if (item.type === 'artist') onOpenArtist(item.name);
    else onOpenPlaylist(item.id);
  };

  if (collapsed) {
    return (
      <aside className="sidebar sidebar--collapsed">
        <button className="sidebar__collapse-btn" onClick={onToggleCollapse} title="Expand library">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/></svg>
        </button>
        <div className="sidebar__collapsed-items">
          {libraryItems.slice(0, 30).map((item, i) => {
            const imgUrl = item.type === 'artist'
              ? (item.imageUrl ? `/api${item.imageUrl}${iv}` : null)
              : (item.coverUrl ? `/api${item.coverUrl}${iv}` : null);
            return (
              <button key={`${item.type}-${item.id || item.name}-${i}`}
                className="sidebar__collapsed-card"
                onClick={() => handleItemClick(item)} title={item.name}>
                <div className={`sidebar__collapsed-thumb ${item.type === 'artist' ? 'sidebar__collapsed-thumb--round' : ''}`}>
                  {imgUrl ? <img src={imgUrl} alt="" /> : <span>{item.type === 'artist' ? '🎤' : '♪'}</span>}
                </div>
              </button>
            );
          })}
        </div>
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      <div className="sidebar__lib-header">
        <button className="sidebar__lib-title" onClick={onToggleCollapse}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/></svg>
          Your Library
        </button>
        <button className="sidebar__icon-btn" onClick={() => setShowNewPlaylist(true)} title="Create playlist">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
        </button>
      </div>

      <div className="sidebar__filters">
        {[['playlists', 'Playlists'], ['artists', 'Artists'], ['wrapped', 'Wrapped']].map(([f, label]) => (
          <button key={f}
            className={`sidebar__chip ${filter === f ? 'sidebar__chip--active' : ''}`}
            onClick={() => setFilter(prev => prev === f ? null : f)}>
            {label}
          </button>
        ))}
        {devMode && (
          <button className={`sidebar__chip ${view.page === 'dev' ? 'sidebar__chip--active' : ''}`}
            onClick={() => navigateTo('dev')}>Dev</button>
        )}
      </div>

      {showNewPlaylist && (
        <div className="sidebar__new-playlist">
          <input placeholder="Playlist name" value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()} autoFocus />
          <button className="btn btn--sm" onClick={handleCreate}>Add</button>
          <button className="btn btn--sm btn--ghost" onClick={() => setShowNewPlaylist(false)}>✕</button>
        </div>
      )}

      <div className="sidebar__lib-list">
        {libraryItems.map((item, i) => {
          const imgUrl = item.type === 'artist'
            ? (item.imageUrl ? `/api${item.imageUrl}${iv}` : null)
            : (item.coverUrl ? `/api${item.coverUrl}${iv}` : null);
          const isCurrentContext = item.type === 'artist'
            ? currentSong?.artist === item.name
            : false;

          return (
            <button key={`${item.type}-${item.id || item.name}-${i}`}
              className={`sidebar__lib-card ${isCurrentContext ? 'sidebar__lib-card--playing' : ''}`}
              onClick={() => handleItemClick(item)}>
              <div className={`sidebar__lib-thumb ${item.type === 'artist' ? 'sidebar__lib-thumb--round' : ''}`}>
                {imgUrl ? <img src={imgUrl} alt="" /> : <span>{item.type === 'artist' ? '🎤' : '♪'}</span>}
              </div>
              <div className="sidebar__lib-info">
                <div className="sidebar__lib-name">{item.name}</div>
                <div className="sidebar__lib-type">
                  {item.type === 'artist' ? 'Artist' :
                    item.type === 'wrapped' ? `Wrapped · ${item.count} songs` :
                      `Playlist · ${item.count} songs`}
                </div>
              </div>
            </button>
          );
        })}
        {libraryItems.length === 0 && (
          <p className="muted" style={{ padding: '.5rem', fontSize: '.82rem' }}>No items yet</p>
        )}
      </div>
    </aside>
  );
}
