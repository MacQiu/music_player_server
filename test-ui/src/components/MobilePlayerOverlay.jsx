import { useRef } from 'react';

const RepeatIcon = ({ mode }) => {
  const active = mode !== 'none';
  const color = active ? '#ff5500' : 'rgba(255,255,255,.5)';
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill={color}>
      <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>
      {mode === 'song' && <text x="12" y="14.5" textAnchor="middle" fontSize="7" fontWeight="bold" fill={color}>1</text>}
    </svg>
  );
};

export default function MobilePlayerOverlay({
  song, onClose, onShowQueue,
  playing, currentTime, duration, toggle, seek,
  repeatMode, shuffleEnabled, playNext, playPrevious, toggleRepeat, toggleShuffle,
}) {
  const touchStartX = useRef(0);

  const fmt = (s) => {
    if (!s || !isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  const handleTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e) => {
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(diff) > 60) { diff > 0 ? playPrevious() : playNext(); }
  };

  const coverUrl = song?.cover_url ? `/api${song.cover_url}` : null;

  return (
    <div className="mobile-overlay" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <div className="mobile-overlay__bg" style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : {}} />
      <div className={`mobile-overlay__bg-tint ${!playing ? 'mobile-overlay__bg-tint--paused' : ''}`} />

      <button className="mobile-overlay__close" onClick={onClose}>
        <svg viewBox="0 0 24 24" width="28" height="28" fill="white"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>
      </button>

      <div className="mobile-overlay__cover-area">
        {coverUrl ? (
          <img src={coverUrl} alt="" className="mobile-overlay__cover-img" />
        ) : (
          <div className="mobile-overlay__cover-blank">♪</div>
        )}
      </div>

      <div className="mobile-overlay__info">
        <div className="mobile-overlay__title">{song.title}</div>
        <div className="mobile-overlay__artist">{song.artist || 'Unknown Artist'}</div>
      </div>

      <div className="mobile-overlay__seek">
        <input type="range" min={0} max={duration || 0} value={currentTime}
          onChange={(e) => seek(Number(e.target.value))} className="mobile-overlay__seek-bar" />
        <div className="mobile-overlay__times">
          <span>{fmt(currentTime)}</span>
          <span>{fmt(duration)}</span>
        </div>
      </div>

      <div className="mobile-overlay__controls">
        <button className="mobile-overlay__btn" onClick={playPrevious}>⏮</button>
        <button className="mobile-overlay__btn mobile-overlay__btn--main" onClick={toggle}>
          {playing ? '⏸' : '▶'}
        </button>
        <button className="mobile-overlay__btn" onClick={playNext}>⏭</button>
      </div>

      <div className="mobile-overlay__bottom">
        <button className={`mobile-overlay__bottom-btn ${shuffleEnabled ? 'mobile-overlay__bottom-btn--active' : ''}`} onClick={toggleShuffle}>
          🔀
        </button>
        <button className="mobile-overlay__bottom-btn" onClick={onShowQueue}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="white"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18a3 3 0 103 3V8h3V6h-5z"/></svg>
        </button>
        <button className={`mobile-overlay__bottom-btn ${repeatMode !== 'none' ? 'mobile-overlay__bottom-btn--active' : ''}`} onClick={toggleRepeat}>
          <RepeatIcon mode={repeatMode} />
        </button>
      </div>
    </div>
  );
}
