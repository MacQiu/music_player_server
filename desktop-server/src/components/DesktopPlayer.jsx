const ShuffleIcon = ({ active }) => {
  const color = active ? '#1db954' : 'currentColor';
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill={color}>
      <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/>
    </svg>
  );
};

const RepeatIcon = ({ mode }) => {
  const active = mode !== 'none';
  const color = active ? '#1db954' : 'currentColor';
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill={color}>
      <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>
      {mode === 'song' && <text x="12" y="14.5" textAnchor="middle" fontSize="7" fontWeight="bold" fill={color}>1</text>}
    </svg>
  );
};

export default function DesktopPlayer({
  song,
  playing, currentTime, duration, volume, toggle, seek, setVolume,
  repeatMode, shuffleEnabled,
  onNext, onPrevious, onToggleRepeat, onToggleShuffle,
  onToggleQueue, onToggleDetails, onToggleLyrics, online,
  showQueue, showDetails, showLyrics,
  imgVersion,
}) {
  const fmt = (s) => {
    if (!s || !isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  const iv = imgVersion ? `?v=${imgVersion}` : '';
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="dplayer">
      <div className="dplayer__left">
        {song ? (
          <>
            <div className="dplayer__cover" onClick={onToggleDetails} style={{ cursor: 'pointer' }} title="Now Playing">
              {song.cover_url ? <img src={`/api${song.cover_url}${iv}`} alt="" /> : <div className="dplayer__cover-blank">♪</div>}
            </div>
            <div className="dplayer__info">
              <div className="dplayer__title">{song.title}</div>
              <div className="dplayer__artist">{song.artist || 'Unknown Artist'}</div>
            </div>
          </>
        ) : (
          <div className="dplayer__info"><span className="muted">No song selected</span></div>
        )}
      </div>

      <div className="dplayer__center">
        <div className="dplayer__buttons">
          <button className={`dplayer__btn ${shuffleEnabled ? 'dplayer__btn--active' : ''}`} onClick={onToggleShuffle} title="Shuffle">
            <ShuffleIcon active={shuffleEnabled} />
          </button>
          <button className="dplayer__btn" onClick={onPrevious} title="Previous">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
          </button>
          <button className="dplayer__btn dplayer__btn--play" onClick={toggle} title={playing ? 'Pause' : 'Play'}>
            {playing
              ? <svg viewBox="0 0 24 24" width="24" height="24" fill="#000"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
              : <svg viewBox="0 0 24 24" width="24" height="24" fill="#000"><path d="M8 5v14l11-7z"/></svg>}
          </button>
          <button className="dplayer__btn" onClick={onNext} title="Next">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
          </button>
          <button className={`dplayer__btn ${repeatMode !== 'none' ? 'dplayer__btn--active' : ''}`} onClick={onToggleRepeat} title={`Repeat: ${repeatMode}`}>
            <RepeatIcon mode={repeatMode} />
          </button>
        </div>
        <div className="dplayer__seek-row">
          <span className="dplayer__time">{fmt(currentTime)}</span>
          <div className="dplayer__seek-wrap">
            <div className="dplayer__seek-track">
              <div className="dplayer__seek-fill" style={{ width: `${progress}%` }} />
            </div>
            <input type="range" min={0} max={duration || 0} value={currentTime}
              onChange={(e) => seek(Number(e.target.value))} className="dplayer__seek" />
          </div>
          <span className="dplayer__time">{fmt(duration)}</span>
        </div>
      </div>

      <div className="dplayer__right">
        <button className={`dplayer__btn dplayer__btn--extra ${showDetails ? 'dplayer__btn--active' : ''}`} onClick={onToggleDetails} title="Now Playing">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M21 3H3c-1.11 0-2 .89-2 2v14c0 1.11.89 2 2 2h18c1.11 0 2-.89 2-2V5c0-1.11-.89-2-2-2zm0 16H3V5h18v14zM5 15h14v2H5v-2zm0-4h14v2H5v-2zm0-4h14v2H5V7z"/></svg>
          {showDetails && <span className="dplayer__dot" />}
        </button>
        <button className={`dplayer__btn dplayer__btn--extra ${showLyrics ? 'dplayer__btn--active' : ''}`} onClick={onToggleLyrics} title="Lyrics">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 9H7v-2h6v2zm2 4H7v-2h8v2zm-3-8V3.5L18.5 9H13z"/></svg>
          {showLyrics && <span className="dplayer__dot" />}
        </button>
        <button className={`dplayer__btn dplayer__btn--extra ${showQueue ? 'dplayer__btn--active' : ''}`} onClick={onToggleQueue} title="Queue">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18a3 3 0 103 3V8h3V6h-5z"/></svg>
          {showQueue && <span className="dplayer__dot" />}
        </button>
        <div className="dplayer__volume">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 8.5v7a4.47 4.47 0 002.5-3.5zM14 3.23v2.06a6.51 6.51 0 010 13.42v2.06A8.5 8.5 0 0014 3.23z"/></svg>
          <input type="range" min={0} max={1} step={0.01} value={volume}
            onChange={(e) => setVolume(Number(e.target.value))} className="dplayer__volume-slider" />
        </div>
        <span className={`dplayer__status ${online ? 'dplayer__status--on' : 'dplayer__status--off'}`} title={online ? 'Server Online' : 'Server Offline'}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            {online
              ? <path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3a4.24 4.24 0 00-6 0zm-4-4l2 2a7.07 7.07 0 0110 0l2-2C14.34 8.34 9.66 8.34 5 13z"/>
              : <path d="M21 3.41L18.59 1 1 18.59 3.41 21 21 3.41zM1 9l2 2a12.73 12.73 0 013.19-2.58L3.6 5.83A15.06 15.06 0 001 9zm8 8l3 3 3-3a4.24 4.24 0 00-5.29-.6l-.71-.71a4.24 4.24 0 000 1.31zM5 13l2 2a7.94 7.94 0 014.19-2.58L7.1 8.33A10.65 10.65 0 005 13z"/>}
          </svg>
        </span>
      </div>
    </div>
  );
}
