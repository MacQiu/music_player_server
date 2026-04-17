import { useState } from 'react';
import { ping, getSongs, syncLogs } from '../api/client';
import StatusBadge from '../components/StatusBadge';

export default function Sync({ online, onRefreshSongs }) {
  const [log, setLog] = useState([]);

  const append = (msg) => setLog((prev) => [...prev, { ts: new Date().toLocaleTimeString(), msg }]);

  const checkServer = async () => {
    try {
      const data = await ping();
      append(`Server OK — ${data.time}`);
    } catch (err) {
      append(`Server unreachable: ${err.message}`);
    }
  };

  const fetchSongs = async () => {
    try {
      const data = await getSongs();
      append(`Fetched ${data.length} song(s)`);
      onRefreshSongs(data);
    } catch (err) {
      append(`Failed to fetch songs: ${err.message}`);
    }
  };

  const syncAnalytics = async () => {
    try {
      const res = await syncLogs([]);
      append(`Sync complete — inserted: ${res.inserted}, skipped: ${res.skipped}`);
    } catch (err) {
      append(`Sync failed: ${err.message}`);
    }
  };

  return (
    <div className="page page--sync">
      <h2>Sync</h2>
      <StatusBadge online={online} />

      <div className="btn-group">
        <button className="btn" onClick={checkServer}>Check Server</button>
        <button className="btn" onClick={fetchSongs}>Fetch Songs</button>
        <button className="btn" onClick={syncAnalytics}>Sync Analytics</button>
      </div>

      <div className="log-box">
        {log.length === 0 && <p className="muted">No activity yet</p>}
        {log.map((entry, i) => (
          <div key={i} className="log-entry">
            <span className="log-ts">[{entry.ts}]</span> {entry.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
