import { useState } from 'react';
import { ping, getSongs, syncLogs } from '../api/client';

export default function ServerModal({ onClose, online, onRefreshSongs, onRefreshAnalytics }) {
  const [serverStatus, setServerStatus] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);
  const [fetchStatus, setFetchStatus] = useState(null);

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

  const handleFetch = async () => {
    setFetchStatus({ ok: true, msg: 'Fetching...' });
    try {
      const data = await getSongs();
      onRefreshSongs(data);
      setFetchStatus({ ok: true, msg: `Fetched ${data.length} song(s)` });
    } catch (err) {
      setFetchStatus({ ok: false, msg: err.message });
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h3>Server Controls</h3>
          <button className="modal__close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal__body">
          <div className="server-status-row">
            <span className={`badge ${online ? 'badge--online' : 'badge--offline'}`}>
              {online ? 'Server Online' : 'Server Offline'}
            </span>
          </div>

          <div className="btn-group" style={{ marginTop: '1rem' }}>
            <button className="btn" onClick={handlePing}>Check Server</button>
            <button className="btn" onClick={handleSync}>Trigger Sync</button>
            <button className="btn" onClick={handleFetch}>Fetch Songs</button>
            <button className="btn" onClick={onRefreshAnalytics}>Refresh Analytics</button>
          </div>

          {serverStatus && <p className={serverStatus.ok ? 'msg msg--ok' : 'msg msg--err'}>{serverStatus.msg}</p>}
          {syncStatus && <p className={syncStatus.ok ? 'msg msg--ok' : 'msg msg--err'}>{syncStatus.msg}</p>}
          {fetchStatus && <p className={fetchStatus.ok ? 'msg msg--ok' : 'msg msg--err'}>{fetchStatus.msg}</p>}
        </div>
      </div>
    </div>
  );
}
