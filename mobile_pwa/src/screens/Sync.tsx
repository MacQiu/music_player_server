import { useState, useCallback, useEffect, type ReactNode } from 'react';
import {
  IoCheckmarkCircle, IoCloseCircle, IoInformationCircle, IoSync, IoCloudDownload,
  IoRefresh, IoSettings, IoCloudUpload, IoDownload, IoServer,
} from 'react-icons/io5';
import CoverImage from '../components/CoverImage';
import ScrollPage from '../components/ScrollPage';
import { useData } from '../contexts/DataContext';
import { useNav } from '../navigation/Navigator';
import { getSongs, getBaseUrl } from '../api/client';
import { flushAll, getQueueSize } from '../storage/playlogQueue';
import { getStorageEstimate, requestPersistentStorage } from '../storage/db';
import { getDownloadedBytes } from '../storage/songStorage';
import { fmtBytes } from '../utils/format';
import { Colors } from '../constants/theme';
import type { Song } from '../types';
import WrappedSyncBanner from '../components/WrappedSyncBanner';

export default function SyncScreen() {
  const {
    online, songs, setSongs, refreshAnalytics, refreshAll, checkOnline,
    downloadSongs, downloadProgress,
  } = useData();
  const { push } = useNav();
  const [serverOk, setServerOk] = useState<boolean | null>(online || null);
  const [syncOk, setSyncOk] = useState<boolean | null>(null);
  const [fetchResult, setFetchResult] = useState<{ ok: boolean; songs: Song[] } | null>(null);
  const [loading, setLoading] = useState({ server: false, sync: false, fetch: false, downloadAll: false });
  const [pendingLogs, setPendingLogs] = useState(0);
  const [storage, setStorage] = useState<{ usage: number; quota: number; persisted: boolean; songsBytes: number } | null>(null);
  const [downloadAllResult, setDownloadAllResult] = useState<string | null>(null);

  const downloadedCount = songs.filter(s => s.downloaded).length;
  const activeDownloads = Object.keys(downloadProgress).length;

  const refreshStorage = useCallback(async () => {
    const [est, songsBytes, queued] = await Promise.all([getStorageEstimate(), getDownloadedBytes(), getQueueSize()]);
    setPendingLogs(queued);
    if (est) setStorage({ ...est, songsBytes });
  }, []);

  useEffect(() => { refreshStorage(); }, [refreshStorage, downloadedCount, online]);
  useEffect(() => { setServerOk(online); }, [online]);

  const checkServer = async () => {
    setLoading(l => ({ ...l, server: true }));
    setServerOk(await checkOnline());
    setLoading(l => ({ ...l, server: false }));
  };

  const doSync = async () => {
    setLoading(l => ({ ...l, sync: true }));
    try { await flushAll(); setSyncOk(true); }
    catch { setSyncOk(false); }
    await refreshStorage();
    setLoading(l => ({ ...l, sync: false }));
  };

  const fetchSongsAction = async () => {
    setLoading(l => ({ ...l, fetch: true }));
    try {
      const data = await getSongs();
      const safeSongs = Array.isArray(data) ? data : [];
      setSongs(safeSongs);
      setFetchResult({ ok: true, songs: safeSongs });
    } catch {
      setFetchResult({ ok: false, songs: [] });
    }
    setLoading(l => ({ ...l, fetch: false }));
  };

  const refreshAllSync = async () => {
    await checkServer();
    await fetchSongsAction();
    await refreshAnalytics();
  };

  const downloadAll = async () => {
    if (!online) { alert('Connect to the server to download songs.'); return; }
    const missing = songs.filter(s => !s.downloaded && !s.is_blank);
    if (missing.length === 0) { setDownloadAllResult('Everything is already downloaded'); return; }
    if (!confirm(`Download ${missing.length} song${missing.length !== 1 ? 's' : ''} to this device?`)) return;
    setLoading(l => ({ ...l, downloadAll: true }));
    setDownloadAllResult(null);
    await requestPersistentStorage();
    const res = await downloadSongs(missing);
    setDownloadAllResult(res.failed ? `${res.ok} downloaded, ${res.failed} failed` : `${res.ok} downloaded`);
    setLoading(l => ({ ...l, downloadAll: false }));
    refreshStorage();
  };

  const onRefresh = useCallback(async () => {
    await refreshAll();
    await checkServer();
    await refreshStorage();
  }, [refreshAll, refreshStorage]);

  const statusIcon = (busy: boolean, ok: boolean | null, fallback: ReactNode) => {
    if (busy) return <div className="spinner spinning" />;
    if (ok === true) return <IoCheckmarkCircle size={24} color={Colors.success} />;
    if (ok === false) return <IoCloseCircle size={24} color={Colors.danger} />;
    return fallback;
  };

  const overall = songs.length > 0
    ? (songs.length - songs.filter(s => !s.downloaded).length) / songs.length
    : 0;

  return (
    <ScrollPage onRefresh={onRefresh}>
      <div className="page-pad">
        <h1 className="heading">Sync</h1>
        <WrappedSyncBanner />

        <div className="rows">
          <button className="row-card" onClick={checkServer} disabled={loading.server}>
            <div className="row-icon">{statusIcon(loading.server, serverOk, <IoInformationCircle size={24} color={Colors.textMuted} />)}</div>
            <div className="row-text">
              <div className="row-title">Server Status</div>
              <div className="row-sub">
                {loading.server ? 'Checking...' : serverOk === true ? 'Server Online' : serverOk === false ? 'Server Offline (playing from device)' : 'Tap to check'}
              </div>
            </div>
          </button>

          <button className="row-card" onClick={doSync} disabled={loading.sync}>
            <div className="row-icon">{statusIcon(loading.sync, syncOk, <IoSync size={24} color={Colors.textMuted} />)}</div>
            <div className="row-text">
              <div className="row-title">Sync Status</div>
              <div className="row-sub">
                {loading.sync ? 'Syncing...' : syncOk === true ? 'Sync Complete' : syncOk === false ? 'Sync Failed' : 'Tap to sync'}
                {pendingLogs > 0 ? ` \u00B7 ${pendingLogs} play log${pendingLogs !== 1 ? 's' : ''} waiting` : ''}
              </div>
            </div>
          </button>

          <button className="row-card" onClick={fetchSongsAction} disabled={loading.fetch}>
            <div className="row-icon">{statusIcon(loading.fetch, fetchResult?.ok ?? null, <IoCloudDownload size={24} color={Colors.textMuted} />)}</div>
            <div className="row-text">
              <div className="row-title">Fetch Songs</div>
              <div className="row-sub">
                {loading.fetch ? 'Fetching...' : fetchResult?.ok ? `All Songs Up to Date (${fetchResult.songs.length})` : fetchResult && !fetchResult.ok ? 'Fetch Failed' : 'Tap to fetch'}
              </div>
            </div>
          </button>

          <button className="row-card" onClick={downloadAll} disabled={loading.downloadAll}>
            <div className="row-icon">{loading.downloadAll ? <div className="spinner spinning" /> : <IoDownload size={24} color={Colors.accent} />}</div>
            <div className="row-text">
              <div className="row-title">Download All for Offline</div>
              <div className="row-sub">
                {loading.downloadAll
                  ? `Downloading... ${activeDownloads ? `(${downloadedCount}/${songs.length})` : ''}`
                  : downloadAllResult || `${downloadedCount} of ${songs.length} songs on this device`}
              </div>
              {songs.length > 0 && (
                <div className="progress-bar"><div style={{ width: `${Math.round(overall * 100)}%` }} /></div>
              )}
            </div>
          </button>

          <div className="row-card">
            <div className="row-icon"><IoServer size={24} color={Colors.textMuted} /></div>
            <div className="row-text">
              <div className="row-title">Device Storage</div>
              <div className="row-sub">
                {storage
                  ? `${fmtBytes(storage.songsBytes)} in songs \u00B7 ${fmtBytes(storage.usage)} used of ${fmtBytes(storage.quota)}`
                  : 'Unavailable'}
              </div>
              {storage && (
                <div className="row-sub">{storage.persisted ? 'Persistent storage granted' : 'Persistent storage not granted (add to Home Screen)'}</div>
              )}
            </div>
          </div>

          <button className="row-card" onClick={refreshAllSync}>
            <div className="row-icon"><IoRefresh size={24} color={Colors.accent} /></div>
            <div className="row-text">
              <div className="row-title">Refresh All</div>
              <div className="row-sub">Check server, fetch songs &amp; analytics</div>
            </div>
          </button>

          <button className="row-card" onClick={() => push({ name: 'settings' })}>
            <div className="row-icon"><IoSettings size={24} color={Colors.textMuted} /></div>
            <div className="row-text">
              <div className="row-title">Server Settings</div>
              <div className="row-sub ellipsis">{getBaseUrl() || 'Not configured'}</div>
            </div>
          </button>

          <button className="row-card" onClick={() => push({ name: 'upload' })}>
            <div className="row-icon"><IoCloudUpload size={24} color={Colors.textMuted} /></div>
            <div className="row-text">
              <div className="row-title">Upload Song</div>
              <div className="row-sub">Upload audio and cover art</div>
            </div>
          </button>
        </div>

        {fetchResult?.ok && fetchResult.songs.length > 0 && (
          <div className="song-preview">
            {fetchResult.songs.slice(0, 8).map(s => (
              <div key={s.id} className="song-preview-row">
                <CoverImage coverUrl={s.cover_url} songId={s.id} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="song-preview-title ellipsis">{s.title}</div>
                  <div className="song-preview-artist ellipsis">{s.artist || 'Unknown'}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ height: 120 }} />
      </div>
    </ScrollPage>
  );
}
