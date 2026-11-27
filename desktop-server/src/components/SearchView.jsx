import { useState, useMemo, useEffect } from 'react';
import SongView from './SongView';
import GridCard, { SectionHeader } from './GridCard';

export default function SearchView({
  songs, artists, playlists, onPlay, addToQueue,
  onOpenPlaylist, onOpenArtist, imgVersion, initialQuery,
}) {
  const [query, setQuery] = useState(initialQuery || '');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (initialQuery !== undefined && initialQuery !== null) {
      setQuery(initialQuery);
    }
  }, [initialQuery]);

  const iv = imgVersion ? `?v=${imgVersion}` : '';
  const q = query.toLowerCase().trim();

  const results = useMemo(() => {
    if (!q) return { songs: [], artists: [], playlists: [] };
    return {
      songs: songs.filter(s => s.title.toLowerCase().includes(q) || (s.artist || '').toLowerCase().includes(q) || (s.album || '').toLowerCase().includes(q)),
      artists: (artists || []).filter(a => a.name.toLowerCase().includes(q)),
      playlists: (playlists || []).filter(p => p.name.toLowerCase().includes(q)),
    };
  }, [q, songs, artists, playlists]);

  const topResult = results.songs[0] || null;
  const filters = ['all', 'songs', 'artists', 'playlists'];

  return (
    <div className="search-page">
      <div className="search-page__header">
        <div className="search-bar search-bar--large">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
          <input placeholder="What do you want to listen to?" value={query}
            onChange={(e) => setQuery(e.target.value)} autoFocus />
        </div>
        {q && (
          <div className="search-page__filters">
            {filters.map(f => (
              <button key={f} className={`sidebar__chip ${filter === f ? 'sidebar__chip--active' : ''}`}
                onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        )}
      </div>

      {!q && (
        <div className="search-page__empty">
          <p className="muted">Search for songs, artists, or playlists</p>
        </div>
      )}

      {q && (filter === 'all' || filter === 'songs') && (
        <>
          {topResult && filter === 'all' && (
            <div className="search-page__top-row">
              <div className="search-page__top-result">
                <h3 className="search-page__section-title">Top result</h3>
                <div className="search-page__top-card" onClick={() => onPlay(topResult)}>
                  <div className="search-page__top-img">
                    {topResult.cover_url ? <img src={`/api${topResult.cover_url}${iv}`} alt="" /> : <div className="gc__img-blank">♪</div>}
                  </div>
                  <h2 className="search-page__top-name">{topResult.title}</h2>
                  <p className="search-page__top-type">{topResult.artist || 'Song'}</p>
                  <button className="gc__play gc__play--visible" onClick={(e) => { e.stopPropagation(); onPlay(topResult); }}>
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="#000"><path d="M8 5v14l11-7z"/></svg>
                  </button>
                </div>
              </div>
              <div className="search-page__songs-col">
                <h3 className="search-page__section-title">Songs</h3>
                {results.songs.slice(0, 4).map((s, i) => (
                  <SongView key={s.id} song={s} index={i} onPlay={() => onPlay(s)} onDoubleClick={() => onPlay(s)}
                    showAlbum={false} showDuration weights={[1, 10, 0, 0, 0, 2, 0]} imgVersion={imgVersion}
                    actions={
                      <button className="sv-action-btn" onClick={(e) => { e.stopPropagation(); addToQueue(s); }} title="Add to Queue">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18a3 3 0 103 3V8h3V6h-5z"/></svg>
                      </button>
                    } />
                ))}
              </div>
            </div>
          )}

          {filter === 'songs' && (
            <section>
              <SectionHeader title="Songs" />
              {results.songs.slice(0, 20).map((s, i) => (
                <SongView key={s.id} song={s} index={i} onPlay={() => onPlay(s)} onDoubleClick={() => onPlay(s)}
                  imgVersion={imgVersion}
                  actions={
                    <button className="sv-action-btn" onClick={(e) => { e.stopPropagation(); addToQueue(s); }} title="Add to Queue">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18a3 3 0 103 3V8h3V6h-5z"/></svg>
                    </button>
                  } />
              ))}
            </section>
          )}
        </>
      )}

      {q && (filter === 'all' || filter === 'artists') && results.artists.length > 0 && (
        <section className="home-page__section">
          <SectionHeader title="Artists" />
          <div className="home-page__grid">
            {results.artists.slice(0, filter === 'all' ? 6 : 20).map(a => (
              <GridCard key={a.name}
                imgSrc={a.image_url ? `/api${a.image_url}${iv}` : null}
                title={a.name} subtitle="Artist" round
                onClick={() => onOpenArtist(a.name)} placeholder="🎤" />
            ))}
          </div>
        </section>
      )}

      {q && (filter === 'all' || filter === 'playlists') && results.playlists.length > 0 && (
        <section className="home-page__section">
          <SectionHeader title="Playlists" />
          <div className="home-page__grid">
            {results.playlists.slice(0, filter === 'all' ? 6 : 20).map(p => (
              <GridCard key={p.id}
                imgSrc={p.cover_url ? `/api${p.cover_url}${iv}` : null}
                title={p.name} subtitle={`${p.song_count} songs`}
                onClick={() => onOpenPlaylist(p.id)} />
            ))}
          </div>
        </section>
      )}

      {q && results.songs.length === 0 && results.artists.length === 0 && results.playlists.length === 0 && (
        <div className="search-page__empty">
          <p className="muted">No results found for &ldquo;{query}&rdquo;</p>
        </div>
      )}
    </div>
  );
}
