export default function Analytics({ analytics, loading }) {
  if (loading) return <div className="page"><p>Loading analytics...</p></div>;
  if (!analytics) return <div className="page"><p className="muted">No analytics data</p></div>;

  const fmtTime = (secs) => {
    if (!secs) return '0s';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    const parts = [];
    if (h) parts.push(`${h}h`);
    if (m) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
  };

  return (
    <div className="page page--analytics">
      <h2>Analytics</h2>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-card__value">{analytics.total_plays}</div>
          <div className="stat-card__label">Total Plays</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__value">{fmtTime(analytics.total_listening_time)}</div>
          <div className="stat-card__label">Listening Time</div>
        </div>
      </div>

      <section>
        <h3>Top Songs</h3>
        {analytics.top_songs.length === 0 && <p className="muted">No plays yet</p>}
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th><th>Title</th><th>Artist</th><th>Plays</th><th>Time</th>
            </tr>
          </thead>
          <tbody>
            {analytics.top_songs.map((s, i) => (
              <tr key={s.id}>
                <td>{i + 1}</td>
                <td>{s.title}</td>
                <td>{s.artist || '—'}</td>
                <td>{s.play_count}</td>
                <td>{fmtTime(s.total_time)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3>Top Artists</h3>
        {analytics.top_artists.length === 0 && <p className="muted">No artist data</p>}
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th><th>Artist</th><th>Plays</th><th>Time</th>
            </tr>
          </thead>
          <tbody>
            {analytics.top_artists.map((a, i) => (
              <tr key={a.artist}>
                <td>{i + 1}</td>
                <td>{a.artist}</td>
                <td>{a.play_count}</td>
                <td>{fmtTime(a.total_time)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
