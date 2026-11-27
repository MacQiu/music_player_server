import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts';
import { getWrappedAnalytics, getPeriodAnalytics } from '../api/client';

export default function DesktopAnalytics({ analytics }) {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const [wrappedYear, setWrappedYear] = useState(currentYear);
  const [wrapped, setWrapped] = useState(null);
  const [wrappedLoading, setWrappedLoading] = useState(false);
  const [period, setPeriod] = useState('all');
  const [periodKey, setPeriodKey] = useState('');
  const [periodData, setPeriodData] = useState(null);
  const [periodKeys, setPeriodKeys] = useState([]);

  useEffect(() => {
    setWrappedLoading(true);
    getWrappedAnalytics(wrappedYear)
      .then(data => setWrapped(data))
      .catch(() => setWrapped(null))
      .finally(() => setWrappedLoading(false));
  }, [wrappedYear]);

  useEffect(() => {
    if (period === 'all') return;
    let cancelled = false;
    getPeriodAnalytics(period, periodKey || undefined)
      .then(data => {
        if (cancelled) return;
        setPeriodKeys(data.keys || []);
        setPeriodData(data.snapshot);
        if (data.key && data.key !== periodKey) setPeriodKey(data.key);
      })
      .catch(() => { if (!cancelled) setPeriodData(null); });
    return () => { cancelled = true; };
  }, [period, periodKey]);

  if (!analytics) return <div className="dpage"><p className="muted">Loading analytics...</p></div>;

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

  const songSource = period === 'all' ? (analytics.top_songs || []) : (periodData?.top_songs || []);
  const artistSource = period === 'all' ? (analytics.top_artists || []) : (periodData?.top_artists || []);

  const songChartData = songSource.map(s => ({
    name: s.title.length > 18 ? s.title.slice(0, 18) + '...' : s.title,
    plays: s.play_count, time: Math.round((s.total_time || 0) / 60),
  }));

  const artistChartData = artistSource.map(a => ({
    name: (a.artist || '').length > 18 ? a.artist.slice(0, 18) + '...' : (a.artist || ''),
    plays: a.play_count, time: Math.round((a.total_time || 0) / 60),
  }));

  const historyData = (analytics.play_history || []).map(h => ({
    date: h.date, plays: h.plays, minutes: Math.round((h.total_time || 0) / 60),
  }));

  const ct = { text: '#b3b3b3', grid: 'rgba(255,255,255,0.1)', bar: '#1db954', bar2: '#1ed760', line: '#1db954' };

  const years = [];
  for (let y = currentYear; y >= currentYear - 5; y--) years.push(y);

  return (
    <div className="dpage">
      <h2>Analytics</h2>

      <div className="chips-row" style={{ display: 'flex', gap: '.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {[['all', 'All-time'], ['week', 'Week'], ['month', 'Month'], ['year', 'Year']].map(([id, label]) => (
          <button key={id} className={`chip ${period === id ? 'active' : ''}`}
            onClick={() => { setPeriod(id); setPeriodKey(''); setPeriodData(null); }}
            style={{ padding: '.3rem .7rem', borderRadius: 999, border: '1px solid var(--border)', background: period === id ? 'var(--accent, #1db954)' : 'transparent', color: period === id ? '#000' : 'inherit', cursor: 'pointer' }}>
            {label}
          </button>
        ))}
        {period !== 'all' && periodKeys.length > 0 && (
          <select value={periodKey} onChange={e => setPeriodKey(e.target.value)}
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 'var(--radius-sm)', padding: '.3rem .5rem' }}>
            {periodKeys.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        )}
      </div>

      {period !== 'all' && (
        <div className="stats-row" style={{ marginBottom: '1.5rem' }}>
          <div className="stat-card">
            <div className="stat-card__value">{periodData?.total_plays ?? 0}</div>
            <div className="stat-card__label">Plays ({periodKey || period})</div>
          </div>
          <div className="stat-card">
            <div className="stat-card__value">{fmtTime(periodData?.total_listening_time)}</div>
            <div className="stat-card__label">Listening Time</div>
          </div>
        </div>
      )}

      {period === 'all' && <div className="stats-row" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="stat-card__value">{analytics.total_plays}</div>
          <div className="stat-card__label">Total Plays</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__value">{fmtTime(analytics.total_listening_time)}</div>
          <div className="stat-card__label">Listening Time</div>
        </div>
      </div>}

      {period === 'all' && historyData.length > 0 && (
        <section className="dpage__section">
          <h3>Listening Activity (Last 30 Days)</h3>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={historyData}>
                <CartesianGrid stroke={ct.grid} strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fill: ct.text, fontSize: 11 }} />
                <YAxis tick={{ fill: ct.text, fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#282828', border: 'none', borderRadius: 8, color: '#fff' }} />
                <Line type="monotone" dataKey="plays" stroke={ct.line} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <section className="dpage__section">
        <h3>Top Songs by Play Count</h3>
        {songChartData.length === 0 ? <p className="muted">No play data yet</p> : (
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={songChartData} layout="vertical" margin={{ left: 100 }}>
                <XAxis type="number" tick={{ fill: ct.text, fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: ct.text, fontSize: 11 }} width={100} />
                <Tooltip contentStyle={{ background: '#282828', border: 'none', borderRadius: 8, color: '#fff' }} />
                <Bar dataKey="plays" fill={ct.bar} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="dpage__section">
        <h3>Top Artists by Listening Time (min)</h3>
        {artistChartData.length === 0 ? <p className="muted">No artist data</p> : (
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={artistChartData} layout="vertical" margin={{ left: 100 }}>
                <XAxis type="number" tick={{ fill: ct.text, fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: ct.text, fontSize: 11 }} width={100} />
                <Tooltip contentStyle={{ background: '#282828', border: 'none', borderRadius: 8, color: '#fff' }} />
                <Bar dataKey="time" fill={ct.bar2} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="dpage__section">
        <div className="dpage__section-header">
          <h3>{currentMonth === 11 ? 'Wrapped ' : 'Yearly '}Stats {wrappedYear}</h3>
          <select value={wrappedYear} onChange={e => setWrappedYear(Number(e.target.value))}
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 'var(--radius-sm)', padding: '.3rem .5rem', fontSize: '.82rem' }}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        {wrappedLoading ? <p className="muted">Loading...</p> : wrapped ? (
          <>
            <div className="stats-row" style={{ marginBottom: '1rem' }}>
              <div className="stat-card">
                <div className="stat-card__value">{wrapped.total_plays}</div>
                <div className="stat-card__label">Plays ({wrappedYear})</div>
              </div>
              <div className="stat-card">
                <div className="stat-card__value">{fmtTime(wrapped.total_listening_time)}</div>
                <div className="stat-card__label">Time ({wrappedYear})</div>
              </div>
            </div>
            {(wrapped.top_songs || []).length > 0 && (
              <div className="chart-container">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={(wrapped.top_songs || []).slice(0, 5).map(s => ({
                    name: s.title.length > 15 ? s.title.slice(0, 15) + '...' : s.title, plays: s.play_count,
                  }))} layout="vertical" margin={{ left: 100 }}>
                    <XAxis type="number" tick={{ fill: ct.text, fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fill: ct.text, fontSize: 11 }} width={100} />
                    <Tooltip contentStyle={{ background: '#282828', border: 'none', borderRadius: 8, color: '#fff' }} />
                    <Bar dataKey="plays" fill="#ff5500" radius={[0, 4, 4, 0]} />
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
