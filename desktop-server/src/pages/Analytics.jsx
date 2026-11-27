import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { getWrappedAnalytics } from '../api/client';

export default function Analytics({ analytics, loading }) {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const [wrappedYear, setWrappedYear] = useState(currentYear);
  const [wrapped, setWrapped] = useState(null);
  const [wrappedLoading, setWrappedLoading] = useState(false);

  useEffect(() => {
    setWrappedLoading(true);
    getWrappedAnalytics(wrappedYear)
      .then(data => setWrapped(data))
      .catch(() => setWrapped(null))
      .finally(() => setWrappedLoading(false));
  }, [wrappedYear]);

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

  const songChartData = (analytics.top_songs || []).slice(0, 5).map(s => ({
    name: s.title.length > 12 ? s.title.slice(0, 12) + '\u2026' : s.title, plays: s.play_count,
  }));

  const artistChartData = (analytics.top_artists || []).slice(0, 5).map(a => ({
    name: a.artist.length > 12 ? a.artist.slice(0, 12) + '\u2026' : a.artist, minutes: Math.round((a.total_time || 0) / 60),
  }));

  const years = [];
  for (let y = currentYear; y >= currentYear - 5; y--) years.push(y);

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
        {songChartData.length === 0 ? <p className="muted">No plays yet</p> : (
          <div className="chart-container chart-container--mobile">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={songChartData}>
                <XAxis dataKey="name" tick={{ fill: '#b3b3b3', fontSize: 10 }} />
                <YAxis tick={{ fill: '#b3b3b3', fontSize: 10 }} />
                <Tooltip contentStyle={{ background: '#282828', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12 }} />
                <Bar dataKey="plays" fill="#1db954" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section>
        <h3>Top Artists (min)</h3>
        {artistChartData.length === 0 ? <p className="muted">No artist data</p> : (
          <div className="chart-container chart-container--mobile">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={artistChartData}>
                <XAxis dataKey="name" tick={{ fill: '#b3b3b3', fontSize: 10 }} />
                <YAxis tick={{ fill: '#b3b3b3', fontSize: 10 }} />
                <Tooltip contentStyle={{ background: '#282828', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12 }} />
                <Bar dataKey="minutes" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.4rem' }}>
          <h3>{currentMonth === 11 ? 'Wrapped ' : 'Yearly '}Stats {wrappedYear}</h3>
          <select value={wrappedYear} onChange={e => setWrappedYear(Number(e.target.value))}
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 'var(--radius-sm)', padding: '.2rem .4rem', fontSize: '.78rem' }}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        {wrappedLoading ? <p className="muted">Loading...</p> : wrapped ? (
          <>
            <div className="stats-row">
              <div className="stat-card">
                <div className="stat-card__value">{wrapped.total_plays}</div>
                <div className="stat-card__label">Plays</div>
              </div>
              <div className="stat-card">
                <div className="stat-card__value">{fmtTime(wrapped.total_listening_time)}</div>
                <div className="stat-card__label">Time</div>
              </div>
            </div>
            {(wrapped.top_songs || []).length > 0 && (
              <div className="chart-container chart-container--mobile">
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={(wrapped.top_songs || []).slice(0, 5).map(s => ({
                    name: s.title.length > 10 ? s.title.slice(0, 10) + '\u2026' : s.title, plays: s.play_count,
                  }))}>
                    <XAxis dataKey="name" tick={{ fill: '#b3b3b3', fontSize: 9 }} />
                    <YAxis tick={{ fill: '#b3b3b3', fontSize: 9 }} />
                    <Tooltip contentStyle={{ background: '#282828', border: 'none', borderRadius: 8, color: '#fff', fontSize: 11 }} />
                    <Bar dataKey="plays" fill="#ff5500" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        ) : <p className="muted">No data for {wrappedYear}</p>}
      </section>
    </div>
  );
}
