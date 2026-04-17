import { useEffect, useRef, useState, useCallback } from 'react';
import { postPlaylog, getDownloadUrl } from '../api/client';

export default function Player({ song, onEnded }) {
  const audioRef = useRef(null);
  const intervalRef = useRef(null);
  const loggedTimeRef = useRef(0);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [src, setSrc] = useState(null);

  // Load audio source whenever the song changes.
  useEffect(() => {
    if (!song) return;
    let cancelled = false;
    getDownloadUrl(song.id).then((url) => {
      if (!cancelled) {
        setSrc(url);
        setPlaying(true);
        loggedTimeRef.current = 0;
      }
    });
    return () => { cancelled = true; };
  }, [song?.id]);

  // Auto-play when src loads.
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !src) return;
    el.load();
    if (playing) el.play().catch(() => {});
  }, [src]);

  // Send play-log every 5 seconds of actual playback.
  const sendLog = useCallback(() => {
    if (!song) return;
    const elapsed = (audioRef.current?.currentTime ?? 0) - loggedTimeRef.current;
    if (elapsed >= 5) {
      postPlaylog(song.id, elapsed).catch(() => {});
      loggedTimeRef.current = audioRef.current?.currentTime ?? 0;
    }
  }, [song]);

  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(sendLog, 5000);
    }
    return () => clearInterval(intervalRef.current);
  }, [playing, sendLog]);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
    } else {
      el.play().catch(() => {});
    }
    setPlaying(!playing);
  };

  const seek = (e) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = Number(e.target.value);
  };

  const handleEnded = () => {
    sendLog();
    setPlaying(false);
    onEnded?.();
  };

  const fmt = (s) => {
    if (!s || !isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  if (!song) {
    return (
      <div className="player player--empty">
        <span>No song selected</span>
      </div>
    );
  }

  return (
    <div className="player">
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
        onEnded={handleEnded}
      />
      <div className="player__info">
        <strong>{song.title}</strong>
        <span>{song.artist || 'Unknown Artist'}</span>
      </div>
      <div className="player__controls">
        <button onClick={toggle} className="btn btn--icon">
          {playing ? '⏸' : '▶'}
        </button>
        <span className="player__time">{fmt(currentTime)}</span>
        <input
          type="range"
          min={0}
          max={duration || 0}
          value={currentTime}
          onChange={seek}
          className="player__seek"
        />
        <span className="player__time">{fmt(duration)}</span>
      </div>
    </div>
  );
}
