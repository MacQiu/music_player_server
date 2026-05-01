import { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import {
  getWrappedAnalytics, generateTestPlaylogs, createWrappedPlaylist,
  deleteTestPlaylogs, createEmptyPlaybackPlaylist,
} from '../api/client';

export default function DesktopDevTools({ songs, onRefreshAnalytics, onRefreshPlaylists }) {
  const currentYear = new Date().getFullYear();
  const [wrappedYear, setWrappedYear] = useState(currentYear);
  const [wrapped, setWrapped] = useState(null);
  const [wrappedLoading, setWrappedLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [pbYear, setPbYear] = useState(currentYear);
  const [pbSearch, setPbSearch] = useState('');
  const [pbSelected, setPbSelected] = useState([]);
  const [pbCreating, setPbCreating] = useState(false);
  const [pbMsg, setPbMsg] = useState('');

  const years = [];
  for (let y = currentYear; y >= currentYear - 10; y--) years.push(y);

  useEffect(() => {
    setWrappedLoading(true);
    getWrappedAnalytics(wrappedYear)
      .then(data => setWrapped(data))
      .catch(() => setWrapped(null))
      .finally(() => setWrappedLoading(false));
  }, [wrappedYear]);

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

  const ct = { text: '#8b8d9a', bar: '#ff5500' };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await generateTestPlaylogs(wrappedYear, 200);
      const data = await getWrappedAnalytics(wrappedYear);
      setWrapped(data);
      onRefreshAnalytics?.();
    } catch { /* ignore */ }
    finally { setGenerating(false); }
  };

  const handleCreatePlaylist = async () => {
    setCreatingPlaylist(true);
    try {
      await createWrappedPlaylist(wrappedYear);
      onRefreshPlaylists?.();
    } catch { /* ignore */ }
    finally { setCreatingPlaylist(false); }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete all play log data for the ${wrappedYear} wrapped period?`)) return;
    setDeleting(true);
    try {
      await deleteTestPlaylogs(wrappedYear);
      const data = await getWrappedAnalytics(wrappedYear);
      setWrapped(data);
      onRefreshAnalytics?.();
    } catch { /* ignore */ }
    finally { setDeleting(false); }
  };

  const availableSongs = useMemo(() => {
    if (!songs) return [];
    const selectedIds = new Set(pbSelected.map(s => s.id));
    return songs.filter(s =>
      !selectedIds.has(s.id) &&
      (s.title.toLowerCase().includes(pbSearch.toLowerCase()) ||
       (s.artist || '').toLowerCase().includes(pbSearch.toLowerCase()))
    );
  }, [songs, pbSearch, pbSelected]);

  const handlePbAdd = (song) => {
    setPbSelected(prev => [...prev, song]);
  };

  const handlePbRemove = (idx) => {
    setPbSelected(prev => prev.filter((_, i) => i !== idx));
  };

  const handlePbMoveUp = (idx) => {
    if (idx === 0) return;
    setPbSelected(prev => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  };

  const handlePbMoveDown = (idx) => {
    setPbSelected(prev => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  };

  const handlePbCreate = async () => {
    if (pbSelected.length === 0) { setPbMsg('Select at least one song'); return; }
    setPbCreating(true);
    setPbMsg('');
    try {
      const res = await createEmptyPlaybackPlaylist(pbYear, pbSelected.map(s => s.id));
      setPbMsg(`Created "${res.name}" with ${res.song_count} songs`);
      setPbSelected([]);
      onRefreshPlaylists?.();
    } catch (e) { setPbMsg(`Error: ${e.message}`); }
    finally { setPbCreating(false); }
  };

  return (
    <div className="dpage">
      <h2>Developer Tools</h2>

      <section className="dpage__section">
        <div className="dpage__section-header">
          <h3>Wrapped Test Data</h3>
          <select value={wrappedYear} onChange={e => setWrappedYear(Number(e.target.value))}
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 'var(--radius-sm)', padding: '.3rem .5rem', fontSize: '.82rem' }}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <button className="btn btn--sm btn--primary" onClick={handleGenerate} disabled={generating}>
            {generating ? 'Generating...' : 'Generate Test Data'}
          </button>
          <button className="btn btn--sm" onClick={handleDelete} disabled={deleting}
            style={{ background: '#e74c3c', color: '#fff' }}>
            {deleting ? 'Deleting...' : 'Delete Test Data'}
          </button>
          <button className="btn btn--sm btn--primary" onClick={handleCreatePlaylist} disabled={creatingPlaylist}>
            {creatingPlaylist ? 'Creating...' : `Create Your ${wrappedYear} Playback`}
          </button>
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
                    <Tooltip contentStyle={{ background: '#1a1d27', border: '1px solid #2d3142', borderRadius: 8, color: '#e8e8ed' }} />
                    <Bar dataKey="plays" fill={ct.bar} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        ) : <p className="muted">No data for {wrappedYear}</p>}
      </section>

      <section className="dpage__section">
        <h3>Create Empty Playback Playlist</h3>
        <p className="muted" style={{ marginBottom: '.75rem', fontSize: '.82rem' }}>
          Manually create a "Your YYYY Playback" playlist without needing actual play data.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.75rem' }}>
          <label style={{ fontSize: '.82rem' }}>Year:</label>
          <select value={pbYear} onChange={e => setPbYear(Number(e.target.value))}
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 'var(--radius-sm)', padding: '.3rem .5rem', fontSize: '.82rem' }}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {pbSelected.length > 0 && (
          <div style={{ marginBottom: '.75rem' }}>
            <h4 style={{ fontSize: '.82rem', marginBottom: '.4rem' }}>Selected Songs ({pbSelected.length})</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {pbSelected.map((song, idx) => (
                <div key={song.id + '-' + idx} className="dev-song-row">
                  <span className="dev-song-row__pos">{idx + 1}</span>
                  <div className="dev-song-row__cover">
                    {song.cover_url ? <img src={`/api${song.cover_url}`} alt="" /> : <span>♪</span>}
                  </div>
                  <div className="dev-song-row__info">
                    <div className="dev-song-row__title">{song.title}</div>
                    <div className="dev-song-row__artist">{song.artist || 'Unknown'}</div>
                  </div>
                  <button className="btn btn--sm btn--ghost" onClick={() => handlePbMoveUp(idx)} disabled={idx === 0} title="Move up">▲</button>
                  <button className="btn btn--sm btn--ghost" onClick={() => handlePbMoveDown(idx)} disabled={idx === pbSelected.length - 1} title="Move down">▼</button>
                  <button className="btn btn--sm btn--ghost" onClick={() => handlePbRemove(idx)} title="Remove" style={{ color: '#e74c3c' }}>✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="search-bar" style={{ marginBottom: '.5rem' }}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
          <input placeholder="Search songs to add..." value={pbSearch} onChange={e => setPbSearch(e.target.value)} />
        </div>

        <div style={{ maxHeight: '250px', overflow: 'auto', marginBottom: '.75rem' }}>
          {availableSongs.slice(0, 30).map(song => (
            <div key={song.id} className="dev-song-row" style={{ cursor: 'pointer' }} onClick={() => handlePbAdd(song)}>
              <div className="dev-song-row__cover">
                {song.cover_url ? <img src={`/api${song.cover_url}`} alt="" /> : <span>♪</span>}
              </div>
              <div className="dev-song-row__info">
                <div className="dev-song-row__title">{song.title}</div>
                <div className="dev-song-row__artist">{song.artist || 'Unknown'}</div>
              </div>
              <span style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>+ Add</span>
            </div>
          ))}
          {availableSongs.length === 0 && <p className="muted" style={{ padding: '.5rem' }}>No songs available</p>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
          <button className="btn btn--primary" onClick={handlePbCreate} disabled={pbCreating || pbSelected.length === 0}>
            {pbCreating ? 'Creating...' : `Create Your ${pbYear} Playback`}
          </button>
          {pbMsg && <span style={{ fontSize: '.82rem', color: pbMsg.startsWith('Error') ? '#e74c3c' : '#22c55e' }}>{pbMsg}</span>}
        </div>
      </section>
    </div>
  );
}
