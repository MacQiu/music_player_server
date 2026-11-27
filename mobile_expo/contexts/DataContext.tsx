import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSongs, getAnalytics, getPlaylists, getArtists, ping } from '../api/client';
import { flushAll } from '../utils/playlogQueue';
import { syncDownloadedSongs } from '../utils/songStorage';
import type { Song } from './PlayerContext';

interface Analytics {
  top_songs: any[];
  top_artists: any[];
  total_listening_time: number;
  total_plays: number;
  recommendations: any[];
  play_history: any[];
}

interface Artist {
  name: string;
  image_path?: string;
  image_url?: string;
  created_at?: string;
  song_count: number;
}

interface Playlist {
  id: string;
  name: string;
  created_at?: string;
  song_count: number;
  cover_url?: string;
}

interface DataState {
  songs: Song[];
  analytics: Analytics | null;
  analyticsLoading: boolean;
  playlists: Playlist[];
  artists: Artist[];
  online: boolean;
  error: string | null;
  imgVersion: number;
}

interface DataActions {
  refreshSongs: () => Promise<void>;
  refreshAnalytics: () => Promise<void>;
  refreshPlaylists: () => Promise<void>;
  refreshArtists: () => Promise<void>;
  refreshAll: () => Promise<void>;
  setSongs: (songs: Song[]) => void;
  bumpImgVersion: () => void;
  updateLocalAnalytics: (patch: Partial<Analytics>) => void;
}

type DataContextType = DataState & DataActions;

const DataContext = createContext<DataContextType | null>(null);

const CACHE_SONGS = 'mp_cached_songs';
const CACHE_PLAYLISTS = 'mp_cached_playlists';
const CACHE_ARTISTS = 'mp_cached_artists';
const CACHE_ANALYTICS = 'mp_cached_analytics';

async function loadCached<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function saveCache(key: string, data: any): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(data));
  } catch { }
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [songs, setSongsRaw] = useState<Song[]>([]);
  const setSongs = useCallback((val: Song[]) => {
    setSongsRaw(Array.isArray(val) ? val : []);
  }, []);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const analyticsRef = useRef<Analytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [playlists, setPlaylistsRaw] = useState<Playlist[]>([]);
  const setPlaylists = useCallback((val: Playlist[]) => {
    setPlaylistsRaw(Array.isArray(val) ? val : []);
  }, []);
  const [artists, setArtistsRaw] = useState<Artist[]>([]);
  const setArtists = useCallback((val: Artist[]) => {
    setArtistsRaw(Array.isArray(val) ? val : []);
  }, []);
  const [online, setOnline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgVersion, setImgVersion] = useState(0);

  const bumpImgVersion = useCallback(() => setImgVersion(v => v + 1), []);

  // Load cached data on launch
  useEffect(() => {
    (async () => {
      const [cs, cp, ca, can] = await Promise.all([
        loadCached<Song[]>(CACHE_SONGS),
        loadCached<Playlist[]>(CACHE_PLAYLISTS),
        loadCached<Artist[]>(CACHE_ARTISTS),
        loadCached<Analytics>(CACHE_ANALYTICS),
      ]);
      if (cs && cs.length > 0) setSongs(cs);
      if (cp && cp.length > 0) setPlaylists(cp);
      if (ca && ca.length > 0) setArtists(ca);
      if (can) { setAnalytics(can); analyticsRef.current = can; }
    })();
  }, []);

  const refreshSongs = useCallback(async () => {
    try {
      const data = await getSongs();
      setSongs(data);
      saveCache(CACHE_SONGS, data);
      setError(null);
    } catch (err: any) {
      setError(`Failed to load songs: ${err.message}`);
    }
  }, [setSongs]);

  const refreshAnalytics = useCallback(async () => {
    if (!analyticsRef.current) setAnalyticsLoading(true);
    try {
      const data = await getAnalytics();
      setAnalytics(data);
      analyticsRef.current = data;
      saveCache(CACHE_ANALYTICS, data);
    } catch { }
    finally { setAnalyticsLoading(false); }
  }, []);

  const refreshPlaylists = useCallback(async () => {
    try {
      const data = await getPlaylists();
      setPlaylists(data);
      saveCache(CACHE_PLAYLISTS, data);
    } catch { }
  }, [setPlaylists]);

  const refreshArtists = useCallback(async () => {
    try {
      const data = await getArtists();
      setArtists(data);
      saveCache(CACHE_ARTISTS, data);
    } catch { }
  }, [setArtists]);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshSongs(), refreshAnalytics(), refreshPlaylists(), refreshArtists()]);
  }, [refreshSongs, refreshAnalytics, refreshPlaylists, refreshArtists]);

  const updateLocalAnalytics = useCallback((patch: Partial<Analytics>) => {
    setAnalytics(prev => {
      const merged: Analytics = {
        top_songs: patch.top_songs ?? prev?.top_songs ?? [],
        top_artists: patch.top_artists ?? prev?.top_artists ?? [],
        total_listening_time: (prev?.total_listening_time ?? 0) + (patch.total_listening_time ?? 0),
        total_plays: (prev?.total_plays ?? 0) + (patch.total_plays ?? 0),
        recommendations: patch.recommendations ?? prev?.recommendations ?? [],
        play_history: patch.play_history ?? prev?.play_history ?? [],
      };
      analyticsRef.current = merged;
      saveCache(CACHE_ANALYTICS, merged);
      return merged;
    });
  }, []);

  const wasOnlineRef = useRef(false);

  const checkOnline = useCallback(async () => {
    try {
      await ping();
      const justCameOnline = !wasOnlineRef.current;
      wasOnlineRef.current = true;
      setOnline(true);
      flushAll().catch(() => {});

      if (justCameOnline) {
        refreshAll();
        // Re-sync covers and lyrics for downloaded songs in background
        syncDownloadedSongs().catch(() => {});
      }
    } catch {
      wasOnlineRef.current = false;
      setOnline(false);
    }
  }, [refreshAll]);

  useEffect(() => {
    checkOnline();
    refreshSongs();
    refreshAnalytics();
    refreshPlaylists();
    refreshArtists();
    const id = setInterval(checkOnline, 15000);
    return () => clearInterval(id);
  }, []);

  const value: DataContextType = {
    songs, analytics, analyticsLoading, playlists, artists, online, error, imgVersion,
    refreshSongs, refreshAnalytics, refreshPlaylists, refreshArtists, refreshAll,
    setSongs, bumpImgVersion, updateLocalAnalytics,
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
