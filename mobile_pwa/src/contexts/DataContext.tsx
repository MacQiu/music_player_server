import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  getSongs, getAnalytics, getPlaylists, getArtists, ping, getPlaylist,
  getWrappedAnalytics, toggleDownload, getBaseUrl,
} from '../api/client';
import { kvGet, kvSet } from '../storage/db';
import { flushAll } from '../storage/playlogQueue';
import {
  initSongStorage, getDownloadedIds, subscribeDownloads,
  downloadSong, deleteSongLocal, syncDownloadedSongs,
} from '../storage/songStorage';
import type { Song, Analytics, Artist, Playlist, PlaylistDetail } from '../types';

interface DataState {
  songs: Song[];
  analytics: Analytics | null;
  analyticsLoading: boolean;
  playlists: Playlist[];
  artists: Artist[];
  online: boolean;
  error: string | null;
  imgVersion: number;
  downloadProgress: Record<string, number>;
}

interface DataActions {
  refreshSongs: () => Promise<void>;
  refreshAnalytics: () => Promise<void>;
  refreshPlaylists: () => Promise<void>;
  refreshArtists: () => Promise<void>;
  refreshAll: () => Promise<void>;
  checkOnline: () => Promise<boolean>;
  setSongs: (songs: Song[]) => void;
  bumpImgVersion: () => void;
  loadPlaylist: (id: string) => Promise<PlaylistDetail | null>;
  loadWrapped: (year: number) => Promise<any | null>;
  downloadSongs: (songs: Song[]) => Promise<{ ok: number; failed: number }>;
  removeDownloads: (songs: Song[]) => Promise<void>;
}

type DataContextType = DataState & DataActions;

const DataContext = createContext<DataContextType | null>(null);

const CACHE_SONGS = 'mp_cached_songs';
const CACHE_PLAYLISTS = 'mp_cached_playlists';
const CACHE_ARTISTS = 'mp_cached_artists';
const CACHE_ANALYTICS = 'mp_cached_analytics';
const playlistKey = (id: string) => `mp_cached_playlist_${id}`;
const wrappedKey = (year: number) => `mp_cached_wrapped_${year}`;

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [rawSongs, setSongsRaw] = useState<Song[]>([]);
  const setSongs = useCallback((val: Song[]) => {
    const list = Array.isArray(val) ? val : [];
    setSongsRaw(list);
    kvSet(CACHE_SONGS, list);
  }, []);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const analyticsRef = useRef<Analytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [playlists, setPlaylistsRaw] = useState<Playlist[]>([]);
  const [artists, setArtistsRaw] = useState<Artist[]>([]);
  const [online, setOnline] = useState(false);
  const onlineRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [imgVersion, setImgVersion] = useState(0);
  const [downloadVersion, setDownloadVersion] = useState(0);
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});

  const bumpImgVersion = useCallback(() => setImgVersion(v => v + 1), []);

  // The local IndexedDB copy is the source of truth for "downloaded", not the server flag.
  useEffect(() => {
    initSongStorage();
    return subscribeDownloads(() => setDownloadVersion(v => v + 1));
  }, []);

  const songs = useMemo(() => {
    const ids = getDownloadedIds();
    return rawSongs.map(s => ({ ...s, downloaded: ids.has(s.id) ? 1 : 0 }));
  }, [rawSongs, downloadVersion]);

  // Load cached data on launch
  useEffect(() => {
    (async () => {
      const [cs, cp, ca, can] = await Promise.all([
        kvGet<Song[]>(CACHE_SONGS),
        kvGet<Playlist[]>(CACHE_PLAYLISTS),
        kvGet<Artist[]>(CACHE_ARTISTS),
        kvGet<Analytics>(CACHE_ANALYTICS),
      ]);
      setSongsRaw(prev => (prev.length === 0 && cs ? cs : prev));
      setPlaylistsRaw(prev => (prev.length === 0 && cp ? cp : prev));
      setArtistsRaw(prev => (prev.length === 0 && ca ? ca : prev));
      if (can && !analyticsRef.current) { setAnalytics(can); analyticsRef.current = can; }
    })();
  }, []);

  const refreshSongs = useCallback(async () => {
    if (!onlineRef.current) return;
    try {
      const data = await getSongs();
      setSongs(data);
      setError(null);
    } catch (err: any) {
      setError(`Failed to load songs: ${err.message}`);
    }
  }, [setSongs]);

  const refreshAnalytics = useCallback(async () => {
    if (!onlineRef.current) return;
    if (!analyticsRef.current) setAnalyticsLoading(true);
    try {
      const data = await getAnalytics();
      setAnalytics(data);
      analyticsRef.current = data;
      kvSet(CACHE_ANALYTICS, data);
    } catch { }
    finally { setAnalyticsLoading(false); }
  }, []);

  const refreshPlaylists = useCallback(async () => {
    if (!onlineRef.current) return;
    try {
      const data = await getPlaylists();
      const list: Playlist[] = Array.isArray(data) ? data : [];
      setPlaylistsRaw(list);
      kvSet(CACHE_PLAYLISTS, list);
      // Cache every playlist's tracks so they open offline even if never viewed.
      for (const p of list) {
        getPlaylist(p.id).then(detail => kvSet(playlistKey(p.id), detail)).catch(() => {});
      }
    } catch { }
  }, []);

  const refreshArtists = useCallback(async () => {
    if (!onlineRef.current) return;
    try {
      const data = await getArtists();
      setArtistsRaw(Array.isArray(data) ? data : []);
      kvSet(CACHE_ARTISTS, data);
    } catch { }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshSongs(), refreshAnalytics(), refreshPlaylists(), refreshArtists()]);
  }, [refreshSongs, refreshAnalytics, refreshPlaylists, refreshArtists]);

  const checkOnline = useCallback(async () => {
    if (!getBaseUrl()) {
      onlineRef.current = false;
      setOnline(false);
      return false;
    }
    try {
      await ping();
      const justCameOnline = !onlineRef.current;
      onlineRef.current = true;
      setOnline(true);
      flushAll().catch(() => {});

      if (justCameOnline) {
        await refreshAll();
        // Re-sync covers and lyrics for downloaded songs in background
        const latest = (await kvGet<Song[]>(CACHE_SONGS)) || [];
        syncDownloadedSongs(latest).catch(() => {});
      }
      return true;
    } catch {
      onlineRef.current = false;
      setOnline(false);
      return false;
    }
  }, [refreshAll]);

  useEffect(() => {
    checkOnline();
    const id = setInterval(checkOnline, 15000);
    const onVisible = () => { if (document.visibilityState === 'visible') checkOnline(); };
    window.addEventListener('online', checkOnline as any);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      window.removeEventListener('online', checkOnline as any);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [checkOnline]);

  const loadPlaylist = useCallback(async (id: string): Promise<PlaylistDetail | null> => {
    if (onlineRef.current) {
      try {
        const data = await getPlaylist(id);
        kvSet(playlistKey(id), data);
        return data;
      } catch { }
    }
    return kvGet<PlaylistDetail>(playlistKey(id));
  }, []);

  const loadWrapped = useCallback(async (year: number) => {
    if (onlineRef.current) {
      try {
        const data = await getWrappedAnalytics(year);
        kvSet(wrappedKey(year), data);
        return data;
      } catch { }
    }
    return kvGet<any>(wrappedKey(year));
  }, []);

  const downloadSongs = useCallback(async (list: Song[]) => {
    let ok = 0;
    let failed = 0;
    const ids = getDownloadedIds();
    for (const song of list) {
      if (ids.has(song.id)) continue;
      setDownloadProgress(p => ({ ...p, [song.id]: 0 }));
      try {
        await downloadSong(song.id, song.cover_url, (f) => {
          setDownloadProgress(p => ({ ...p, [song.id]: f }));
        });
        toggleDownload(song.id, true).catch(() => {});
        ok++;
      } catch {
        failed++;
      } finally {
        setDownloadProgress(p => {
          const next = { ...p };
          delete next[song.id];
          return next;
        });
      }
    }
    return { ok, failed };
  }, []);

  const removeDownloads = useCallback(async (list: Song[]) => {
    for (const song of list) {
      await deleteSongLocal(song.id).catch(() => {});
      if (onlineRef.current) toggleDownload(song.id, false).catch(() => {});
    }
  }, []);

  const value: DataContextType = {
    songs, analytics, analyticsLoading, playlists, artists, online, error, imgVersion, downloadProgress,
    refreshSongs, refreshAnalytics, refreshPlaylists, refreshArtists, refreshAll, checkOnline,
    setSongs, bumpImgVersion, loadPlaylist, loadWrapped, downloadSongs, removeDownloads,
  };

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
