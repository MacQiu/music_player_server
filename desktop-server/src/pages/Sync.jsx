import { useState } from 'react';
import { ping, getSongs, syncLogs } from '../api/client';

export default function Sync({ online, onRefreshSongs }) {
  const [serverOk, setServerOk] = useState(online ? true : null);
  const [syncOk, setSyncOk] = useState(null);
  const [fetchResult, setFetchResult] = useState(null);
  const [loading, setLoading] = useState({ server: false, sync: false, fetch: false });

  const checkServer = async () => {
    setLoading((l) => ({ ...l, server: true }));
    try {
      await ping();
      setServerOk(true);
    } catch {
      setServerOk(false);
    }
    setLoading((l) => ({ ...l, server: false }));
  };

  const doSync = async () => {
    setLoading((l) => ({ ...l, sync: true }));
    try {
      await syncLogs([]);
      setSyncOk(true);
    } catch {
      setSyncOk(false);
    }
    setLoading((l) => ({ ...l, sync: false }));
  };

  const fetchSongs = async () => {
    setLoading((l) => ({ ...l, fetch: true }));
    try {
      const data = await getSongs();
      onRefreshSongs(data);
      setFetchResult({ ok: true, songs: data });
    } catch {
      setFetchResult({ ok: false, songs: [] });
    }
    setLoading((l) => ({ ...l, fetch: false }));
  };

  return (
    <div className="page page--sync">
      <h2>Sync</h2>

      <div className="sync-rows">
        {/* Server Status */}
        <button className="sync-row" onClick={checkServer} disabled={loading.server}>
          <div className="sync-row__icon">
            {loading.server ? (
              <span className="sync-row__spinner" />
            ) : serverOk === true ? (
              <svg viewBox="0 0 24 24" width="24" height="24" fill="#22c55e"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
            ) : serverOk === false ? (
              <svg viewBox="0 0 24 24" width="24" height="24" fill="#ef4444"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="24" height="24" fill="#8b8d9a"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
            )}
          </div>
          <div className="sync-row__text">
            <div className="sync-row__title">Server Status</div>
            <div className="sync-row__sub">
              {loading.server ? 'Checking...' : serverOk === true ? 'Server Online' : serverOk === false ? 'Server Offline' : 'Tap to check'}
            </div>
          </div>
        </button>

        {/* Sync Status */}
        <button className="sync-row" onClick={doSync} disabled={loading.sync}>
          <div className="sync-row__icon">
            {loading.sync ? (
              <span className="sync-row__spinner" />
            ) : syncOk === true ? (
              <svg viewBox="0 0 24 24" width="24" height="24" fill="#22c55e"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
            ) : syncOk === false ? (
              <svg viewBox="0 0 24 24" width="24" height="24" fill="#ef4444"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="24" height="24" fill="#8b8d9a"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0020 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 004 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>
            )}
          </div>
          <div className="sync-row__text">
            <div className="sync-row__title">Sync Status</div>
            <div className="sync-row__sub">
              {loading.sync ? 'Syncing...' : syncOk === true ? 'Sync Complete' : syncOk === false ? 'Sync Failed' : 'Tap to sync'}
            </div>
          </div>
        </button>

        {/* Fetch Songs */}
        <button className="sync-row" onClick={fetchSongs} disabled={loading.fetch}>
          <div className="sync-row__icon">
            {loading.fetch ? (
              <span className="sync-row__spinner" />
            ) : fetchResult?.ok ? (
              <svg viewBox="0 0 24 24" width="24" height="24" fill="#22c55e"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
            ) : fetchResult && !fetchResult.ok ? (
              <svg viewBox="0 0 24 24" width="24" height="24" fill="#ef4444"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="24" height="24" fill="#8b8d9a"><path d="M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/></svg>
            )}
          </div>
          <div className="sync-row__text">
            <div className="sync-row__title">Fetch Songs</div>
            <div className="sync-row__sub">
              {loading.fetch
                ? 'Fetching...'
                : fetchResult?.ok
                  ? `All Songs Up to Date (${fetchResult.songs.length})`
                  : fetchResult && !fetchResult.ok
                    ? 'Fetch Failed'
                    : 'Tap to fetch'}
            </div>
          </div>
        </button>
      </div>

      {/* Show recently fetched songs */}
      {fetchResult?.ok && fetchResult.songs.length > 0 && (
        <div className="sync-songs">
          {fetchResult.songs.slice(0, 10).map((s) => (
            <div key={s.id} className="sync-song-row">
              <div className="sync-song-row__cover">
                {s.cover_url ? (
                  <img src={`/api${s.cover_url}`} alt="" />
                ) : (
                  <span>♪</span>
                )}
              </div>
              <div className="sync-song-row__info">
                <strong>{s.title}</strong>
                <span>{s.artist || 'Unknown'}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
