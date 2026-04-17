import { useState } from 'react';
import { uploadSong, deleteSong, ping, syncLogs, getSongs } from '../api/client';

export default function Dashboard({ songs, analytics, onRefreshSongs, onRefreshAnalytics }) {
  const [uploadStatus, setUploadStatus] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);
  const [serverStatus, setServerStatus] = useState(null);

  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [file, setFile] = useState(null);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) {
      setUploadStatus({ ok: false, msg: 'Select a file first' });
      return;
    }
    setUploadStatus({ ok: true, msg: 'Uploading...' });
    try {
      const data = await uploadSong(file, { title, artist, album });
      setUploadStatus({ ok: true, msg: `Uploaded "${data.title}" (${data.id})` });
      setTitle(''); setArtist(''); setAlbum(''); setFile(null);
      e.target.reset();
      const fresh = await getSongs();
      onRefreshSongs(fresh);
    } catch (err) {
      setUploadStatus({ ok: false, msg: err.message });
    }
  };

  const handleDelete = async (id, songTitle) => {
    if (!window.confirm(`Delete "${songTitle}"?`)) return;
    try {
      await deleteSong(id);
      const fresh = await getSongs();
      onRefreshSongs(fresh);
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const handlePing = async () => {
    try {
      const d = await ping();
      setServerStatus({ ok: true, msg: `OK — ${d.time}` });
    } catch (err) {
      setServerStatus({ ok: false, msg: err.message });
    }
  };

  const handleSync = async () => {
    setSyncStatus({ ok: true, msg: 'Syncing...' });
    try {
      const res = await syncLogs([]);
      setSyncStatus({ ok: true, msg: `Inserted: ${res.inserted}, Skipped: ${res.skipped}` });
      onRefreshAnalytics();
    } catch (err) {
      setSyncStatus({ ok: false, msg: err.message });
    }
  };

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
    <div className="dashboard">
      <div className="dashboard__sidebar">
        <h2>Dashboard</h2>
        <nav>
          <a href="#upload">Upload</a>
          <a href="#songs">Songs</a>
          <a href="#analytics">Analytics</a>
          <a href="#server">Server</a>
        </nav>
      </div>

      <div className="dashboard__main">
        {/* Upload */}
        <section id="upload" className="dash-section">
          <h3>Upload Song</h3>
          <form onSubmit={handleUpload} className="upload-form">
            <input type="file" accept=".mp3,.wav" onChange={(e) => setFile(e.target.files[0])} />
            <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <input placeholder="Artist" value={artist} onChange={(e) => setArtist(e.target.value)} />
            <input placeholder="Album" value={album} onChange={(e) => setAlbum(e.target.value)} />
            <button type="submit" className="btn">Upload</button>
          </form>
          {uploadStatus && (
            <p className={uploadStatus.ok ? 'msg msg--ok' : 'msg msg--err'}>{uploadStatus.msg}</p>
          )}
        </section>

        {/* Song list */}
        <section id="songs" className="dash-section">
          <h3>All Songs ({songs.length})</h3>
          {songs.length === 0 && <p className="muted">No songs yet</p>}
          <table className="data-table">
            <thead>
              <tr>
                <th>Title</th><th>Artist</th><th>Album</th><th>Duration</th><th>Added</th><th></th>
              </tr>
            </thead>
            <tbody>
              {songs.map((s) => (
                <tr key={s.id}>
                  <td>{s.title}</td>
                  <td>{s.artist || '—'}</td>
                  <td>{s.album || '—'}</td>
                  <td>{s.duration ? fmtTime(s.duration) : '—'}</td>
                  <td>{s.date_added ? new Date(s.date_added).toLocaleDateString() : '—'}</td>
                  <td>
                    <a className="btn btn--sm" href={`/api/download/${s.id}`} download>DL</a>
                    <button className="btn btn--sm btn--danger" onClick={() => handleDelete(s.id, s.title)}>
                      Del
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Analytics */}
        <section id="analytics" className="dash-section">
          <h3>Analytics</h3>
          {analytics ? (
            <>
              <div className="stats-row">
                <div className="stat-card"><div className="stat-card__value">{analytics.total_plays}</div><div className="stat-card__label">Total Plays</div></div>
                <div className="stat-card"><div className="stat-card__value">{fmtTime(analytics.total_listening_time)}</div><div className="stat-card__label">Listening Time</div></div>
              </div>
              <table className="data-table">
                <thead><tr><th>#</th><th>Title</th><th>Artist</th><th>Plays</th><th>Time</th></tr></thead>
                <tbody>
                  {analytics.top_songs.map((s, i) => (
                    <tr key={s.id}><td>{i + 1}</td><td>{s.title}</td><td>{s.artist || '—'}</td><td>{s.play_count}</td><td>{fmtTime(s.total_time)}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p className="muted">Loading...</p>
          )}
        </section>

        {/* Server */}
        <section id="server" className="dash-section">
          <h3>Server Controls</h3>
          <div className="btn-group">
            <button className="btn" onClick={handlePing}>Check Server</button>
            <button className="btn" onClick={handleSync}>Trigger Sync</button>
            <button className="btn" onClick={onRefreshAnalytics}>Refresh Analytics</button>
          </div>
          {serverStatus && (
            <p className={serverStatus.ok ? 'msg msg--ok' : 'msg msg--err'}>{serverStatus.msg}</p>
          )}
          {syncStatus && (
            <p className={syncStatus.ok ? 'msg msg--ok' : 'msg msg--err'}>{syncStatus.msg}</p>
          )}
        </section>
      </div>
    </div>
  );
}
