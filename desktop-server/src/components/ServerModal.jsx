import { useEffect, useRef, useState } from 'react';
import { ping, getSongs, syncLogs, exportLibrary, importLibrary, getWrappedStatus } from '../api/client';

export default function ServerModal({ onClose, online, onRefreshSongs, onRefreshAnalytics }) {
  const [serverStatus, setServerStatus] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);
  const [fetchStatus, setFetchStatus] = useState(null);
  const [transferStatus, setTransferStatus] = useState(null);
  const [wrappedNote, setWrappedNote] = useState(null);
  const importRef = useRef(null);

  useEffect(() => {
    getWrappedStatus().then(d => setWrappedNote(d.should_notify ? d.message : null)).catch(() => {});
  }, []);

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

  const handleExport = async () => {
    setTransferStatus({ ok: true, msg: 'Preparing export...' });
    try {
      await exportLibrary();
      setTransferStatus({ ok: true, msg: 'Download started' });
    } catch (err) {
      setTransferStatus({ ok: false, msg: err.message });
    }
  };

  const handleImportPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!window.confirm('Replace this library with the imported one? This overwrites songs, stats, and files on this laptop.')) return;
    setTransferStatus({ ok: true, msg: 'Importing...' });
    try {
      await importLibrary(file);
      setTransferStatus({ ok: true, msg: 'Library imported. Refreshing...' });
      const data = await getSongs();
      onRefreshSongs(data);
      onRefreshAnalytics();
    } catch (err) {
      setTransferStatus({ ok: false, msg: err.message });
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

          {wrappedNote && (
            <p className="msg" style={{ background: '#3a2a00', color: '#ffe08a', padding: '.6rem .8rem', borderRadius: 8 }}>
              {wrappedNote}
            </p>
          )}

          <div className="btn-group" style={{ marginTop: '1rem' }}>
            <button className="btn" onClick={handlePing}>Check Server</button>
            <button className="btn" onClick={handleSync}>Trigger Sync</button>
            <button className="btn" onClick={handleFetch}>Fetch Songs</button>
            <button className="btn" onClick={onRefreshAnalytics}>Refresh Analytics</button>
            <button className="btn" onClick={handleExport}>Export Library</button>
            <button className="btn" onClick={() => importRef.current?.click()}>Import Library</button>
            <input ref={importRef} type="file" accept=".zip,application/zip" style={{ display: 'none' }} onChange={handleImportPick} />
          </div>

          {serverStatus && <p className={serverStatus.ok ? 'msg msg--ok' : 'msg msg--err'}>{serverStatus.msg}</p>}
          {syncStatus && <p className={syncStatus.ok ? 'msg msg--ok' : 'msg msg--err'}>{syncStatus.msg}</p>}
          {fetchStatus && <p className={fetchStatus.ok ? 'msg msg--ok' : 'msg msg--err'}>{fetchStatus.msg}</p>}
          {transferStatus && <p className={transferStatus.ok ? 'msg msg--ok' : 'msg msg--err'}>{transferStatus.msg}</p>}
        </div>
      </div>
    </div>
  );
}
