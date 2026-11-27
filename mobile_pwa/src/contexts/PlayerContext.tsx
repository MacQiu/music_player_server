import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getBaseUrl, getCoverUrl } from '../api/client';
import { kvGet, kvSet } from '../storage/db';
import { getPlayableUri, getLocalImageUrl } from '../storage/songStorage';
import { enqueueLog } from '../storage/playlogQueue';
import type { Song } from '../types';

export type { Song };
type RepeatMode = 'none' | 'playlist' | 'song';

interface PlayerState {
  playing: boolean;
  currentTime: number;
  duration: number;
  currentSong: Song | null;
  sourceList: Song[];
  sourceIndex: number;
  manualQueue: Song[];
  repeatMode: RepeatMode;
  shuffleEnabled: boolean;
  playbackError: string | null;
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

// A single element for the whole app session. iOS only lets a media element start
// playback programmatically (e.g. on track change from the lock screen) once that
// same element has been played from a user gesture.
const audio = new Audio();
audio.preload = 'auto';
audio.setAttribute('playsinline', '');

// 0.1s of silence, used to unlock the element on the first tap.
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

interface ResumeState {
  song: Song;
  position: number;
  sourceList: Song[];
  sourceIndex: number;
  manualQueue: Song[];
  repeatMode: RepeatMode;
  shuffleEnabled: boolean;
  originalSource: Song[] | null;
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const shouldPlayRef = useRef(false);
  const resumeSeekRef = useRef<number | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const originalSourceRef = useRef<Song[] | null>(null);
  const currentSongRef = useRef<Song | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const loadTokenRef = useRef(0);
  const unlockedRef = useRef(false);
  const failStreakRef = useRef(0);
  const restoredRef = useRef(false);

  // Play log accumulation (seconds actually listened, measured from timeupdate deltas)
  const lastTickRef = useRef<number | null>(null);
  const listenedRef = useRef(0);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [sourceList, setSourceList] = useState<Song[]>([]);
  const [sourceIndex, setSourceIndex] = useState(-1);
  const [manualQueue, setManualQueue] = useState<Song[]>([]);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('none');
  const [shuffleEnabled, setShuffleEnabled] = useState(false);

  useEffect(() => { currentSongRef.current = currentSong; }, [currentSong]);

  const flushListened = useCallback((force: boolean) => {
    const song = currentSongRef.current;
    const secs = listenedRef.current;
    if (!song) return;
    if (secs >= 5 || (force && secs >= 1)) {
      enqueueLog(song.id, secs).catch(() => {});
      listenedRef.current = 0;
    }
  }, []);

  // ---- Persisted state ----

  const stateRef = useRef({ sourceList, sourceIndex, manualQueue, repeatMode, shuffleEnabled });
  useEffect(() => {
    stateRef.current = { sourceList, sourceIndex, manualQueue, repeatMode, shuffleEnabled };
  }, [sourceList, sourceIndex, manualQueue, repeatMode, shuffleEnabled]);

  const saveResume = useCallback(() => {
    const song = currentSongRef.current;
    if (!song || !restoredRef.current) return;
    const s = stateRef.current;
    const data: ResumeState = {
      song,
      position: audio.currentTime || resumeSeekRef.current || 0,
      sourceList: s.sourceList,
      sourceIndex: s.sourceIndex,
      manualQueue: s.manualQueue,
      repeatMode: s.repeatMode,
      shuffleEnabled: s.shuffleEnabled,
      originalSource: originalSourceRef.current,
    };
    kvSet(STORAGE_KEY, data);
  }, []);

  useEffect(() => {
    saveResume();
  }, [currentSong, sourceList, sourceIndex, manualQueue, repeatMode, shuffleEnabled, saveResume]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') { flushListened(true); saveResume(); }
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', saveResume);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', saveResume);
    };
  }, [saveResume, flushListened]);

  // Restore the last session (paused, at the saved position)
  useEffect(() => {
    (async () => {
      const data = await kvGet<ResumeState>(STORAGE_KEY);
      if (data?.song && !currentSongRef.current) {
        setSourceList(data.sourceList || [data.song]);
        setSourceIndex(data.sourceIndex ?? 0);
        setManualQueue(data.manualQueue || []);
        setRepeatMode(data.repeatMode || 'none');
        setShuffleEnabled(!!data.shuffleEnabled);
        originalSourceRef.current = data.originalSource || null;
        shouldPlayRef.current = false;
        resumeSeekRef.current = data.position || 0;
        setCurrentTime(data.position || 0);
        setDuration(data.song.duration || 0);
        setCurrentSong(data.song);
      }
      restoredRef.current = true;
    })();
  }, []);

  // ---- Media Session (lock screen / Control Center) ----

  const updateMediaSession = useCallback(async (song: Song) => {
    if (!('mediaSession' in navigator)) return;
    let artwork: MediaImage[] = [];
    if (song.cover_url) {
      const local = await getLocalImageUrl(`cover_${song.id}`);
      const src = local || (getBaseUrl() ? getCoverUrl(song.id) : null);
      if (src) artwork = [{ src, sizes: '512x512' }];
    }
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title,
        artist: song.artist || 'Unknown',
        album: song.album || '',
        artwork,
      });
    } catch { }
  }, []);

  const updatePositionState = useCallback(() => {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
    const d = audio.duration;
    if (!d || !isFinite(d)) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: d,
        position: Math.min(audio.currentTime, d),
        playbackRate: audio.playbackRate || 1,
      });
    } catch { }
  }, []);

  // ---- Loading ----

  const loadSong = useCallback(async (song: Song, autoPlay: boolean, seekTo?: number | null) => {
    const token = ++loadTokenRef.current;
    setPlaybackError(null);
    const playable = await getPlayableUri(song.id);
    if (token !== loadTokenRef.current) {
      if (playable?.local) URL.revokeObjectURL(playable.uri);
      return;
    }

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    if (!playable) {
      audio.removeAttribute('src');
      audio.load();
      setPlaying(false);
      setPlaybackError('This song is not downloaded and the server is unreachable.');
      if (autoPlay) skipUnavailableRef.current();
      return;
    }

    if (playable.local) objectUrlRef.current = playable.uri;
    pendingSeekRef.current = seekTo && seekTo > 0 ? seekTo : null;
    lastTickRef.current = null;
    listenedRef.current = 0;
    audio.src = playable.uri;
    audio.loop = stateRef.current.repeatMode === 'song';
    setDuration(song.duration || 0);
    if (!pendingSeekRef.current) setCurrentTime(0);

    if (autoPlay) {
      audio.play().then(() => {
        unlockedRef.current = true;
        failStreakRef.current = 0;
      }).catch(() => {});
    }
    updateMediaSession(song);
  }, [updateMediaSession]);

  // ---- Audio element events ----

  const handleSongEndRef = useRef<() => void>(() => {});
  const skipUnavailableRef = useRef<() => void>(() => {});

  useEffect(() => {
    let lastPosUpdate = 0;
    let lastSave = 0;
    const onPlay = () => setPlaying(true);
    const onPause = () => {
      setPlaying(false);
      lastTickRef.current = null;
      flushListened(true);
      saveResume();
    };
    const onTime = () => {
      const t = audio.currentTime;
      setCurrentTime(t);
      if (!audio.paused) {
        const prev = lastTickRef.current;
        if (prev !== null) {
          const delta = t - prev;
          if (delta > 0 && delta < 2) listenedRef.current += delta;
        }
        lastTickRef.current = t;
        if (listenedRef.current >= 5) flushListened(false);
      }
      const now = Date.now();
      if (now - lastPosUpdate > 5000) { lastPosUpdate = now; updatePositionState(); }
      if (now - lastSave > 2000) { lastSave = now; saveResume(); }
    };
    const onMeta = () => {
      if (isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration);
      if (pendingSeekRef.current !== null) {
        audio.currentTime = pendingSeekRef.current;
        pendingSeekRef.current = null;
      }
      updatePositionState();
    };
    const onEnded = () => {
      flushListened(true);
      handleSongEndRef.current();
    };
    const onError = () => {
      if (!audio.getAttribute('src') || audio.src === SILENT_WAV) return;
      setPlaying(false);
      setPlaybackError('Could not play this song.');
      if (shouldPlayRef.current) skipUnavailableRef.current();
    };

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('durationchange', onMeta);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('durationchange', onMeta);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [flushListened, saveResume, updatePositionState]);

  // Unlock the shared element on the first tap so later async play() calls are allowed.
  // Runs in the bubble phase so handlers that already call play() directly win.
  useEffect(() => {
    const unlock = () => {
      if (unlockedRef.current) return;
      unlockedRef.current = true;
      if (!audio.paused) return;
      const hadSrc = !!audio.getAttribute('src');
      const t = audio.currentTime;
      if (!hadSrc) audio.src = SILENT_WAV;
      const unlockSrc = audio.src;
      audio.muted = true;
      audio.play().then(() => {
        // If a real track was loaded meanwhile, leave it playing.
        if (audio.src === unlockSrc) {
          audio.pause();
          if (hadSrc) audio.currentTime = t;
          else { audio.removeAttribute('src'); audio.load(); }
        }
        audio.muted = false;
      }).catch(() => {
        audio.muted = false;
        unlockedRef.current = false;
      });
    };
    document.addEventListener('touchend', unlock);
    document.addEventListener('click', unlock);
    return () => {
      document.removeEventListener('touchend', unlock);
      document.removeEventListener('click', unlock);
    };
  }, []);

  useEffect(() => {
    audio.loop = repeatMode === 'song';
  }, [repeatMode]);

  // --- Queue operations ---

  const playNextInner = useCallback(() => {
    const queuedIdx = manualQueue.findIndex(s => !s.is_blank);
    if (queuedIdx >= 0) {
      const next = manualQueue[queuedIdx];
      setManualQueue(prev => prev.filter((_, i) => i !== queuedIdx));
      shouldPlayRef.current = true;
      setCurrentSong(next);
      return;
    }
    const advance = (from: number) => {
      for (let i = from; i < sourceList.length; i++) {
        if (!sourceList[i].is_blank) return i;
      }
      return -1;
    };
    let nextIdx = advance(sourceIndex + 1);
    if (nextIdx < 0 && repeatMode === 'playlist') nextIdx = advance(0);
    if (nextIdx >= 0 && sourceList[nextIdx] && !sourceList[nextIdx].is_blank) {
      setSourceIndex(nextIdx);
      shouldPlayRef.current = true;
      setCurrentSong(sourceList[nextIdx]);
      return;
    }
    shouldPlayRef.current = false;
    setPlaying(false);
  }, [manualQueue, sourceIndex, sourceList, repeatMode]);

  useEffect(() => {
    handleSongEndRef.current = () => {
      if (repeatMode === 'song') return;
      playNextInner();
    };
    // Offline and not downloaded: move on, but give up after one full pass.
    skipUnavailableRef.current = () => {
      failStreakRef.current += 1;
      if (failStreakRef.current > Math.max(sourceList.length, 1) + manualQueue.length) {
        failStreakRef.current = 0;
        shouldPlayRef.current = false;
        return;
      }
      setTimeout(() => playNextInner(), 0);
    };
  }, [repeatMode, playNextInner, sourceList.length, manualQueue.length]);

  // Load song when currentSong changes
  useEffect(() => {
    if (!currentSong) return;
    const seekTo = resumeSeekRef.current;
    resumeSeekRef.current = null;
    loadSong(currentSong, shouldPlayRef.current, seekTo);
  }, [currentSong?.id]);

  const playSong = useCallback((song: Song, contextSongs?: Song[]) => {
    if (song?.is_blank) return;
    const list = contextSongs || sourceList;
    const idx = list.findIndex(s => s.id === song.id);
    flushListened(true);
    failStreakRef.current = 0;
    setSourceList(list.length ? list : [song]);
    setSourceIndex(idx >= 0 ? idx : 0);
    setManualQueue([]);
    if (contextSongs) {
      setShuffleEnabled(false);
      originalSourceRef.current = null;
    }
    shouldPlayRef.current = true;
    if (currentSongRef.current?.id === song.id && audio.getAttribute('src')) {
      unlockedRef.current = true;
      audio.currentTime = 0;
      audio.play().catch(() => {});
    } else {
      setCurrentSong(song);
    }
  }, [sourceList, flushListened]);

  const toggle = useCallback(() => {
    const song = currentSongRef.current;
    if (!song) return;
    if (!audio.paused) {
      shouldPlayRef.current = false;
      audio.pause();
      return;
    }
    shouldPlayRef.current = true;
    if (!audio.getAttribute('src') || audio.src === SILENT_WAV) {
      loadSong(song, true, currentTime);
      return;
    }
    unlockedRef.current = true;
    audio.play().catch(() => {});
  }, [loadSong, currentTime]);

  const seek = useCallback((time: number) => {
    lastTickRef.current = null;
    if (audio.readyState >= 1) audio.currentTime = time;
    else pendingSeekRef.current = time;
    setCurrentTime(time);
    updatePositionState();
  }, [updatePositionState]);

  const playPrevious = useCallback(() => {
    if (audio.currentTime > 3) {
      seek(0);
      return;
    }
    let prevIdx = -1;
    for (let i = sourceIndex - 1; i >= 0; i--) {
      if (!sourceList[i].is_blank) { prevIdx = i; break; }
    }
    if (prevIdx >= 0) {
      flushListened(true);
      setSourceIndex(prevIdx);
      shouldPlayRef.current = true;
      setCurrentSong(sourceList[prevIdx]);
    } else {
      seek(0);
    }
  }, [sourceIndex, sourceList, seek, flushListened]);

  const playNext = useCallback(() => {
    flushListened(true);
    failStreakRef.current = 0;
    playNextInner();
  }, [playNextInner, flushListened]);

  const addToQueue = useCallback((song: Song) => {
    if (song?.is_blank) return;
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
    flushListened(true);
    failStreakRef.current = 0;
    shouldPlayRef.current = true;
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
  }, [sourceList, sourceIndex, manualQueue, flushListened]);

  // Lock screen controls always call the latest handlers
  const actionsRef = useRef({ toggle, playNext, playPrevious, seek });
  useEffect(() => { actionsRef.current = { toggle, playNext, playPrevious, seek }; }, [toggle, playNext, playPrevious, seek]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const set = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try { ms.setActionHandler(action, handler); } catch { }
    };
    set('play', () => { if (audio.paused) actionsRef.current.toggle(); });
    set('pause', () => { if (!audio.paused) actionsRef.current.toggle(); });
    set('previoustrack', () => actionsRef.current.playPrevious());
    set('nexttrack', () => actionsRef.current.playNext());
    set('seekto', (d) => { if (d.seekTime != null) actionsRef.current.seek(d.seekTime); });
    set('seekbackward', null);
    set('seekforward', null);
  }, []);

  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
    }
  }, [playing]);

  const value: PlayerContextType = {
    playing, currentTime, duration, playbackError,
    currentSong, sourceList, sourceIndex, manualQueue,
    repeatMode, shuffleEnabled,
    playSong, toggle, seek,
    playNext, playPrevious,
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
