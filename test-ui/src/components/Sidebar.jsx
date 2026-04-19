import { useState } from 'react';
import { createPlaylist } from '../api/client';

export default function Sidebar({
  view, setView, playlists,
  onOpenUpload, onOpenServer,
  onRefreshPlaylists, onOpenPlaylist,
}) {
  const [showNewPlaylist, setShowNewPlaylist] = useState(false);
  const [newName, setNewName] = useState('');

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

  return (
    <aside className="sidebar">
      <div className="sidebar__top">
        <nav className="sidebar__nav">
          <button className={`sidebar__link ${view === 'home' ? 'sidebar__link--active' : ''}`} onClick={() => setView('home')}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 3l9 8h-3v9h-5v-6h-2v6H6v-9H3l9-8z"/></svg>
            Home
          </button>
          <button className={`sidebar__link ${view === 'library' ? 'sidebar__link--active' : ''}`} onClick={() => setView('library')}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/></svg>
            Library
          </button>
          <button className={`sidebar__link ${view === 'analytics' ? 'sidebar__link--active' : ''}`} onClick={() => setView('analytics')}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z"/></svg>
            Analytics
          </button>
        </nav>
      </div>

      <div className="sidebar__divider" />

      <div className="sidebar__playlists">
        <div className="sidebar__section-header">
          <span>Playlists</span>
          <button className="sidebar__icon-btn" onClick={() => setShowNewPlaylist(true)} title="New Playlist">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
          </button>
        </div>

        {showNewPlaylist && (
          <div className="sidebar__new-playlist">
            <input placeholder="Playlist name" value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()} autoFocus />
            <button className="btn btn--sm" onClick={handleCreate}>Add</button>
            <button className="btn btn--sm btn--ghost" onClick={() => setShowNewPlaylist(false)}>Cancel</button>
          </div>
        )}

        <ul className="sidebar__playlist-list">
          {playlists.map((p) => (
            <li key={p.id}>
              <button className="sidebar__playlist-item" onClick={() => onOpenPlaylist(p.id)}>
                {p.name}
                <span className="sidebar__playlist-count">{p.song_count}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="sidebar__bottom">
        <button className="sidebar__icon-btn" onClick={onOpenUpload} title="Upload Song">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/></svg>
        </button>
        <button className="sidebar__icon-btn" onClick={onOpenServer} title="Server Controls">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1115.6 12 3.611 3.611 0 0112 15.6z"/></svg>
        </button>
      </div>
    </aside>
  );
}
