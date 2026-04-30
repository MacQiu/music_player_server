import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { createAudioPlayer, setAudioModeAsync, AudioPlayer, AudioStatus } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDownloadUrl, postPlaylog, getCoverUrl } from '../api/client';

export interface Song {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  duration?: number;
  file_path?: string;
  cover_path?: string;
  cover_url?: string;
  sort_order?: number;
  downloaded?: number;
  date_added?: string;
  play_count?: number;
  total_time?: number;
  position?: number;
}

interface PlayerState {
  playing: boolean;
  currentTime: number;
  duration: number;
  currentSong: Song | null;
  sourceList: Song[];
  sourceIndex: number;
  manualQueue: Song[];
  repeatMode: 'none' | 'playlist' | 'song';
  shuffleEnabled: boolean;
}

interface PlayerActions {
  playSong: (song: Song, contextSongs?: Song[]) => void;
  toggle: () => void;
  seek: (time: number) => void;
  playNext: () => void;
  playPrevious: () => void;
  addToQueue: (song: Song) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (fromIdx: number, toIdx: number) => void;
  toggleRepeat: () => void;
  toggleShuffle: () => void;
  jumpToQueueIndex: (index: number, section: 'above' | 'manual' | 'below') => void;
}

type PlayerContextType = PlayerState & PlayerActions;

const PlayerContext = createContext<PlayerContextType | null>(null);

const STORAGE_KEY = 'mp_resume';

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const playerRef = useRef<AudioPlayer | null>(null);
  const loggedTimeRef = useRef(0);
  const logIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const shouldPlayRef = useRef(false);
  const originalSourceRef = useRef<Song[] | null>(null);
  const resumedRef = useRef(false);
  const currentSongRef = useRef<Song | null>(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [sourceList, setSourceList] = useState<Song[]>([]);
  const [sourceIndex, setSourceIndex] = useState(-1);
  const [manualQueue, setManualQueue] = useState<Song[]>([]);
  const [repeatMode, setRepeatMode] = useState<'none' | 'playlist' | 'song'>('none');
  const [shuffleEnabled, setShuffleEnabled] = useState(false);

  // Keep a ref in sync so the status listener can read the latest song
  useEffect(() => { currentSongRef.current = currentSong; }, [currentSong]);

  // Configure audio mode once
  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    });
  }, []);

  // Create a persistent AudioPlayer and subscribe to status updates
  useEffect(() => {
    const player = createAudioPlayer();
    playerRef.current = player;

    const subscription = player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
      if (!status.isLoaded) return;
      setPlaying(status.playing);
      setCurrentTime(status.currentTime);
      setDuration(status.duration);

      if (status.didJustFinish) {
        handleSongEndRef.current();
      }
    });

    return () => {
      subscription.remove();
      player.remove();
      playerRef.current = null;
    };
  }, []);

  // Load and play a song
  const loadSong = useCallback((song: Song, autoPlay: boolean, seekTo?: number) => {
    const player = playerRef.current;
    if (!player) return;

    const url = getDownloadUrl(song.id);
    player.replace({ uri: url });
    player.loop = repeatMode === 'song';
    loggedTimeRef.current = 0;

    if (seekTo && seekTo > 0) {
      player.seekTo(seekTo);
    }

    if (autoPlay) {
      player.play();
    }

    player.setActiveForLockScreen(true, {
      title: song.title,
      artist: song.artist || 'Unknown',
      albumTitle: song.album || '',
      artworkUrl: song.cover_url ? getCoverUrl(song.id) : undefined,
    });
  }, [repeatMode]);

  // Update loop mode when repeat changes
  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.loop = repeatMode === 'song';
    }
  }, [repeatMode]);

  // Play log interval
  const sendLog = useCallback(() => {
    if (!currentSongRef.current || !playerRef.current) return;
    const elapsed = currentTime - loggedTimeRef.current;
    if (elapsed >= 5) {
      postPlaylog(currentSongRef.current.id, elapsed).catch(() => {});
      loggedTimeRef.current = currentTime;
    }
  }, [currentTime]);

  useEffect(() => {
    if (playing) {
      logIntervalRef.current = setInterval(sendLog, 5000);
    }
    return () => {
      if (logIntervalRef.current) clearInterval(logIntervalRef.current);
    };
  }, [playing, sendLog]);

  // Persist resume state
  useEffect(() => {
    if (!currentSong) return;
    const save = () => {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
        songId: currentSong.id,
        position: currentTime,
      })).catch(() => {});
    };
    save();
    const iv = setInterval(save, 2000);
    return () => clearInterval(iv);
  }, [currentSong, currentTime]);

  // --- Queue operations ---

  const playNextInner = useCallback(() => {
    if (manualQueue.length > 0) {
      const next = manualQueue[0];
      setManualQueue(prev => prev.slice(1));
      setCurrentSong(next);
      shouldPlayRef.current = true;
      return;
    }
    const nextIdx = sourceIndex + 1;
    if (nextIdx < sourceList.length) {
      setSourceIndex(nextIdx);
      setCurrentSong(sourceList[nextIdx]);
      shouldPlayRef.current = true;
    } else if (repeatMode === 'playlist' && sourceList.length > 0) {
      setSourceIndex(0);
      setCurrentSong(sourceList[0]);
      shouldPlayRef.current = true;
    } else {
      setPlaying(false);
    }
  }, [manualQueue, sourceIndex, sourceList, repeatMode]);

  const handleSongEndRef = useRef(playNextInner);
  useEffect(() => {
    handleSongEndRef.current = () => {
      sendLog();
      if (repeatMode === 'song') return;
      playNextInner();
    };
  }, [sendLog, repeatMode, playNextInner]);

  // Load song when currentSong changes
  useEffect(() => {
    if (!currentSong) return;
    loadSong(currentSong, shouldPlayRef.current);
  }, [currentSong?.id]);

  const playSong = useCallback((song: Song, contextSongs?: Song[]) => {
    const list = contextSongs || sourceList;
    const idx = list.findIndex(s => s.id === song.id);
    setSourceList(list);
    setSourceIndex(idx >= 0 ? idx : 0);
    setCurrentSong(song);
    setManualQueue([]);
    if (contextSongs) {
      setShuffleEnabled(false);
      originalSourceRef.current = null;
    }
    shouldPlayRef.current = true;
  }, [sourceList]);

  const toggle = useCallback(() => {
    if (!playerRef.current) return;
    if (playing) {
      playerRef.current.pause();
    } else {
      playerRef.current.play();
    }
  }, [playing]);

  const seek = useCallback((time: number) => {
    if (playerRef.current) {
      playerRef.current.seekTo(time);
    }
  }, []);

  const playPrevious = useCallback(() => {
    if (currentTime > 3) {
      seek(0);
      return;
    }
    if (sourceIndex > 0) {
      const prevIdx = sourceIndex - 1;
      setSourceIndex(prevIdx);
      setCurrentSong(sourceList[prevIdx]);
      shouldPlayRef.current = true;
    }
  }, [currentTime, sourceIndex, sourceList, seek]);

  const addToQueue = useCallback((song: Song) => {
    setManualQueue(prev => [...prev, song]);
  }, []);

  const removeFromQueue = useCallback((index: number) => {
    setManualQueue(prev => prev.filter((_, i) => i !== index));
  }, []);

  const reorderQueue = useCallback((fromIdx: number, toIdx: number) => {
    setManualQueue(prev => {
      const next = [...prev];
      const [item] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, item);
      return next;
    });
  }, []);

  const toggleRepeat = useCallback(() => {
    setRepeatMode(prev => prev === 'none' ? 'playlist' : prev === 'playlist' ? 'song' : 'none');
  }, []);

  const toggleShuffle = useCallback(() => {
    setShuffleEnabled(prev => {
      if (!prev) {
        originalSourceRef.current = sourceList;
        const before = sourceList.slice(0, sourceIndex + 1);
        const after = [...sourceList.slice(sourceIndex + 1)];
        for (let i = after.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [after[i], after[j]] = [after[j], after[i]];
        }
        setSourceList([...before, ...after]);
      } else {
        if (originalSourceRef.current) {
          const orig = originalSourceRef.current;
          const idx = orig.findIndex(s => s.id === currentSong?.id);
          setSourceList(orig);
          setSourceIndex(idx >= 0 ? idx : 0);
          originalSourceRef.current = null;
        }
      }
      return !prev;
    });
  }, [sourceList, sourceIndex, currentSong]);

  const jumpToQueueIndex = useCallback((index: number, section: 'above' | 'manual' | 'below') => {
    if (section === 'above') {
      setSourceIndex(index);
      setCurrentSong(sourceList[index]);
    } else if (section === 'manual') {
      const song = manualQueue[index];
      setManualQueue(prev => prev.filter((_, i) => i !== index));
      setCurrentSong(song);
    } else if (section === 'below') {
      const actualIdx = sourceIndex + 1 + index;
      setSourceIndex(actualIdx);
      setCurrentSong(sourceList[actualIdx]);
    }
    shouldPlayRef.current = true;
  }, [sourceList, sourceIndex, manualQueue]);

  // Restore from storage
  const restoreResume = useCallback(async (songs: Song[]) => {
    if (resumedRef.current || songs.length === 0) return;
    resumedRef.current = true;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const { songId, position } = JSON.parse(raw);
      const song = songs.find(s => s.id === songId);
      if (!song) return;
      setCurrentSong(song);
      setSourceList(songs);
      setSourceIndex(songs.findIndex(s => s.id === songId));
      shouldPlayRef.current = false;
      loadSong(song, false, position || 0);
    } catch { /* ignore corrupt data */ }
  }, [loadSong]);

  const value: PlayerContextType = {
    playing, currentTime, duration,
    currentSong, sourceList, sourceIndex, manualQueue,
    repeatMode, shuffleEnabled,
    playSong, toggle, seek,
    playNext: playNextInner, playPrevious,
    addToQueue, removeFromQueue, reorderQueue,
    toggleRepeat, toggleShuffle, jumpToQueueIndex,
  };

  return (
    <PlayerContext.Provider value={value}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
}

export { PlayerContext };
