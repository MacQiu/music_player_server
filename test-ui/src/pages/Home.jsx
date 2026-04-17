import { useMemo } from 'react';

export default function Home({ songs, analytics, onPlay }) {
  const recentlyPlayed = useMemo(() => {
    const top = analytics?.top_songs ?? [];
    return top.slice(0, 5).map((t) => {
      const song = songs.find((s) => s.id === t.id);
      return song || { ...t, id: t.id };
    });
  }, [analytics, songs]);

  const artists = useMemo(() => {
    const map = {};
    songs.forEach((s) => {
      const key = s.artist || 'Unknown';
      if (!map[key]) map[key] = [];
      map[key].push(s);
    });
    return Object.entries(map);
  }, [songs]);

  const recommendations = analytics?.recommendations ?? [];

  return (
    <div className="page page--home">
      <h2>Home</h2>

      <section>
        <h3>Recently Played</h3>
        {recentlyPlayed.length === 0 && <p className="muted">No plays yet</p>}
        <div className="card-row">
          {recentlyPlayed.map((s) => (
            <button key={s.id} className="card" onClick={() => onPlay(s)}>
              <div className="card__icon">&#9835;</div>
              <div className="card__title">{s.title}</div>
              <div className="card__sub">{s.artist || 'Unknown'}</div>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3>Artists</h3>
        {artists.length === 0 && <p className="muted">No songs yet</p>}
        <div className="card-row">
          {artists.map(([name, tracks]) => (
            <div key={name} className="card">
              <div className="card__icon">&#127908;</div>
              <div className="card__title">{name}</div>
              <div className="card__sub">{tracks.length} song{tracks.length !== 1 ? 's' : ''}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3>Playlists</h3>
        <div className="card-row">
          <div className="card card--add">
            <div className="card__icon">+</div>
            <div className="card__title">New Playlist</div>
          </div>
        </div>
      </section>

      {recommendations.length > 0 && (
        <section>
          <h3>Recommended</h3>
          <div className="card-row">
            {recommendations.map((r) => (
              <button key={r.id} className="card" onClick={() => {
                const s = songs.find((x) => x.id === r.id);
                if (s) onPlay(s);
              }}>
                <div className="card__icon">&#9733;</div>
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
