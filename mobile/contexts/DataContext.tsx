import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getSongs, getAnalytics, getPlaylists, getArtists, ping } from '../api/client';
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
  setSongs: (songs: Song[]) => void;
  bumpImgVersion: () => void;
}

type DataContextType = DataState & DataActions;

const DataContext = createContext<DataContextType | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [songs, setSongs] = useState<Song[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [online, setOnline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgVersion, setImgVersion] = useState(0);

  const bumpImgVersion = useCallback(() => setImgVersion(v => v + 1), []);

  const refreshSongs = useCallback(async () => {
    try {
      const data = await getSongs();
      setSongs(data);
      setError(null);
    } catch (err: any) {
      setError(`Failed to load songs: ${err.message}`);
    }
  }, []);

  const refreshAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const data = await getAnalytics();
      setAnalytics(data);
    } catch { /* not fatal */ }
    finally { setAnalyticsLoading(false); }
  }, []);

  const refreshPlaylists = useCallback(async () => {
    try {
      const data = await getPlaylists();
      setPlaylists(data);
    } catch { }
  }, []);

  const refreshArtists = useCallback(async () => {
    try {
      const data = await getArtists();
      setArtists(data);
    } catch { }
  }, []);

  const checkOnline = useCallback(async () => {
    try {
      await ping();
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, []);

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
    refreshSongs, refreshAnalytics, refreshPlaylists, refreshArtists,
    setSongs, bumpImgVersion,
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
