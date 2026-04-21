import { useState, useEffect, useCallback, useRef } from 'react';
import { getSongs, getAnalytics, getPlaylists, getArtists, ping, getDownloadUrl, postPlaylog } from './api/client';

import DesktopLayout from './components/DesktopLayout';
import Player from './components/Player';
import MobilePlayerOverlay from './components/MobilePlayerOverlay';
import MobileQueueOverlay from './components/MobileQueueOverlay';
import PlaylistOverlay from './components/PlaylistOverlay';
import ArtistOverlay from './components/ArtistOverlay';
import Home from './pages/Home';
import Library from './pages/Library';
import Analytics from './pages/Analytics';
import Sync from './pages/Sync';

const MOBILE_TABS = ['Home', 'Library', 'Analytics', 'Sync'];
const STORAGE_KEY = 'mp_resume';

export default function App() {
  const [mode, setMode] = useState('desktop');
  const [tab, setTab] = useState('Home');

  const [songs, setSongs] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [playlists, setPlaylists] = useState([]);
  const [artists, setArtists] = useState([]);
  const [online, setOnline] = useState(false);
  const [error, setError] = useState(null);

  // Shared audio
  const audioRef = useRef(null);
  const loggedTimeRef = useRef(0);
  const logIntervalRef = useRef(null);
  const shouldPlayRef = useRef(false);
  const resumePositionRef = useRef(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [audioSrc, setAudioSrc] = useState(null);

  // Queue state (sourceList model)
  const [currentSong, setCurrentSong] = useState(null);
  const [sourceList, setSourceList] = useState([]);
  const [sourceIndex, setSourceIndex] = useState(-1);
  const [manualQueue, setManualQueue] = useState([]);
  const [repeatMode, setRepeatMode] = useState('none');
  const [shuffleEnabled, setShuffleEnabled] = useState(false);
  const originalSourceRef = useRef(null);

  // Overlay states
  const [showMobileOverlay, setShowMobileOverlay] = useState(false);
  const [showMobileQueue, setShowMobileQueue] = useState(false);
  const [openPlaylistId, setOpenPlaylistId] = useState(null);
  const [openArtistName, setOpenArtistName] = useState(null);
  const [imgVersion, setImgVersion] = useState(0);
  const bumpImgVersion = useCallback(() => setImgVersion(v => v + 1), []);

  // ---- Data fetching ----

  const refreshSongs = useCallback(async () => {
    try { const data = await getSongs(); setSongs(data); setError(null); }
    catch (err) { setError(`Failed to load songs: ${err.message}`); }
  }, []);

  const refreshAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try { const data = await getAnalytics(); setAnalytics(data); }
    catch { /* not fatal */ }
    finally { setAnalyticsLoading(false); }
  }, []);

  const refreshPlaylists = useCallback(async () => {
    try { const data = await getPlaylists(); setPlaylists(data); } catch { }
  }, []);

  const refreshArtists = useCallback(async () => {
    try { const data = await getArtists(); setArtists(data); } catch { }
  }, []);

  const checkOnline = useCallback(async () => {
    try { await ping(); setOnline(true); } catch { setOnline(false); }
  }, []);

  useEffect(() => {
    checkOnline(); refreshSongs(); refreshAnalytics(); refreshPlaylists(); refreshArtists();
    const id = setInterval(checkOnline, 15000);
    return () => clearInterval(id);
  }, [checkOnline, refreshSongs, refreshAnalytics, refreshPlaylists, refreshArtists]);

  // ---- Audio controller ----

  useEffect(() => {
    if (!currentSong) { setAudioSrc(null); return; }
    let cancelled = false;
    getDownloadUrl(currentSong.id).then(url => {
      if (!cancelled) { setAudioSrc(url); loggedTimeRef.current = 0; }
    });
    return () => { cancelled = true; };
  }, [currentSong?.id]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !audioSrc) return;
    el.load();
    if (shouldPlayRef.current) el.play().catch(() => {});
  }, [audioSrc]);

  useEffect(() => {
    const el = audioRef.current;
    if (el) el.loop = repeatMode === 'song';
  }, [repeatMode]);

  useEffect(() => {
    const el = audioRef.current;
    if (el) el.volume = volume;
  }, [volume]);

  const sendLog = useCallback(() => {
    if (!currentSong) return;
    const el = audioRef.current;
    const elapsed = (el?.currentTime ?? 0) - loggedTimeRef.current;
    if (elapsed >= 5) {
      postPlaylog(currentSong.id, elapsed).catch(() => {});
      loggedTimeRef.current = el?.currentTime ?? 0;
    }
  }, [currentSong]);

  useEffect(() => {
    if (playing) logIntervalRef.current = setInterval(sendLog, 5000);
    return () => clearInterval(logIntervalRef.current);
  }, [playing, sendLog]);

  // Persist resume state
  useEffect(() => {
    if (!currentSong) return;
    const save = () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        songId: currentSong.id,
        position: audioRef.current?.currentTime ?? 0,
      }));
    };
    save();
    const iv = setInterval(save, 2000);
    return () => clearInterval(iv);
  }, [currentSong, currentTime]);

  // Restore on first load (paused)
  const resumedRef = useRef(false);
  useEffect(() => {
    if (resumedRef.current || songs.length === 0) return;
    resumedRef.current = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const { songId, position } = JSON.parse(raw);
      const song = songs.find(s => s.id === songId);
      if (!song) return;
      setCurrentSong(song);
      setSourceList(songs);
      setSourceIndex(songs.findIndex(s => s.id === songId));
      shouldPlayRef.current = false;
      resumePositionRef.current = position || 0;
    } catch { /* ignore corrupt data */ }
  }, [songs]);

  const handleLoadedMetadata = useCallback(() => {
    setDuration(audioRef.current?.duration ?? 0);
    if (resumePositionRef.current !== null) {
      audioRef.current.currentTime = resumePositionRef.current;
      resumePositionRef.current = null;
    }
  }, []);

  const audioToggle = useCallback(() => {
    const el = audioRef.current;
    if (!el || !audioSrc) return;
    if (playing) el.pause(); else el.play().catch(() => {});
  }, [playing, audioSrc]);

  const audioSeek = useCallback((time) => {
    const el = audioRef.current;
    if (el) el.currentTime = time;
  }, []);

  // ---- Queue operations ----

  const playSong = useCallback((song, contextSongs = null) => {
    const list = contextSongs || songs;
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
  }, [songs]);

  const playNext = useCallback(() => {
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

  const playPrevious = useCallback(() => {
    const el = audioRef.current;
    if (el && el.currentTime > 3) { el.currentTime = 0; return; }
    if (sourceIndex > 0) {
      const prevIdx = sourceIndex - 1;
      setSourceIndex(prevIdx);
      setCurrentSong(sourceList[prevIdx]);
      shouldPlayRef.current = true;
    }
  }, [sourceIndex, sourceList]);

  const handleSongEnd = useCallback(() => {
    sendLog();
    if (repeatMode === 'song') return;
    playNext();
  }, [sendLog, repeatMode, playNext]);

  const addToQueue = useCallback((song) => {
    setManualQueue(prev => [...prev, song]);
  }, []);

  const removeFromQueue = useCallback((index) => {
    setManualQueue(prev => prev.filter((_, i) => i !== index));
  }, []);

  const reorderQueue = useCallback((fromIdx, toIdx) => {
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

  const jumpToQueueIndex = useCallback((index, section) => {
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

  // ---- Prop bundles ----

  const audioProps = { playing, currentTime, duration, volume, toggle: audioToggle, seek: audioSeek, setVolume };
  const queueProps = {
    currentSong, sourceList, sourceIndex, manualQueue,
    repeatMode, shuffleEnabled,
    playSong, playNext, playPrevious, addToQueue, removeFromQueue,
    reorderQueue, toggleRepeat, toggleShuffle, handleSongEnd, jumpToQueueIndex,
  };

  // ---- Render ----

  const renderMobileTab = () => {
    switch (tab) {
      case 'Home':
        return <Home songs={songs} analytics={analytics} playlists={playlists} artists={artists}
          onPlay={song => playSong(song, songs)} onRefreshPlaylists={refreshPlaylists}
          addToQueue={addToQueue} onOpenPlaylist={setOpenPlaylistId} onOpenArtist={setOpenArtistName}
          refreshArtists={refreshArtists} imgVersion={imgVersion} bumpImgVersion={bumpImgVersion} />;
      case 'Library':
        return <Library songs={songs} onPlay={song => playSong(song, songs)}
          addToQueue={addToQueue} playlists={playlists} refreshSongs={refreshSongs}
          imgVersion={imgVersion} bumpImgVersion={bumpImgVersion} />;
      case 'Analytics':
        return <Analytics analytics={analytics} loading={analyticsLoading} />;
      case 'Sync':
        return <Sync online={online} onRefreshSongs={d => setSongs(d)} />;
      default: return null;
    }
  };

  return (
    <div className="app">
      <audio
        ref={audioRef}
        src={audioSrc}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleSongEnd}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />

      <header className="app-header">
        <h1 className="app-header__title">KillerTunes</h1>
        <div className="mode-toggle">
          <button className={`btn ${mode === 'mobile' ? 'btn--active' : ''}`} onClick={() => setMode('mobile')}>Mobile</button>
          <button className={`btn ${mode === 'desktop' ? 'btn--active' : ''}`} onClick={() => setMode('desktop')}>Desktop</button>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      {mode === 'mobile' ? (
        <div className="phone-frame">
          <div className="phone-frame__screen">
            <div className="phone-frame__content">{renderMobileTab()}</div>
            <div onClick={() => currentSong && setShowMobileOverlay(true)}>
              <Player song={currentSong} {...audioProps} />
            </div>
            <nav className="tab-bar">
              {MOBILE_TABS.map(t => (
                <button key={t} className={`tab-bar__item ${tab === t ? 'tab-bar__item--active' : ''}`} onClick={() => setTab(t)}>{t}</button>
              ))}
            </nav>

            {showMobileOverlay && currentSong && (
              <MobilePlayerOverlay song={currentSong} onClose={() => setShowMobileOverlay(false)}
                onShowQueue={() => setShowMobileQueue(true)} audioRef={audioRef} {...audioProps} {...queueProps} />
            )}
            {showMobileQueue && <MobileQueueOverlay onClose={() => setShowMobileQueue(false)} {...queueProps} />}
            {openPlaylistId && (
              <div style={{ position: 'absolute', inset: 0, zIndex: 85 }}>
                <PlaylistOverlay playlistId={openPlaylistId} onClose={() => setOpenPlaylistId(null)}
                  songs={songs} playSong={playSong} addToQueue={addToQueue}
                  refreshPlaylists={refreshPlaylists} refreshSongs={refreshSongs} />
              </div>
            )}
            {openArtistName && (
              <div style={{ position: 'absolute', inset: 0, zIndex: 85 }}>
                <ArtistOverlay artistName={openArtistName} songs={songs} artists={artists}
                  onClose={() => setOpenArtistName(null)} playSong={playSong}
                  addToQueue={addToQueue} refreshArtists={refreshArtists}
                  imgVersion={imgVersion} />
              </div>
            )}
          </div>
        </div>
      ) : (
        <DesktopLayout
          songs={songs} analytics={analytics} playlists={playlists} artists={artists} online={online}
          onRefreshSongs={d => setSongs(d)} onRefreshAnalytics={refreshAnalytics}
          onRefreshPlaylists={refreshPlaylists} onRefreshArtists={refreshArtists}
          refreshSongs={refreshSongs} refreshArtists={refreshArtists}
          openPlaylistId={openPlaylistId} setOpenPlaylistId={setOpenPlaylistId}
          openArtistName={openArtistName} setOpenArtistName={setOpenArtistName}
          imgVersion={imgVersion} bumpImgVersion={bumpImgVersion}
          audioRef={audioRef}
          {...audioProps} {...queueProps}
        />
      )}
    </div>
  );
}
