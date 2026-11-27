import { useCallback, useEffect, useRef, useState } from 'react';
import {
  IoChevronDown, IoPlaySkipBack, IoPlaySkipForward, IoPlay, IoPause,
  IoShuffle, IoMusicalNote, IoList, IoRepeat,
} from 'react-icons/io5';
import { usePlayer } from '../contexts/PlayerContext';
import { useNav } from '../navigation/Navigator';
import { useCachedImage } from '../hooks/useCachedImage';
import { fmtClock } from '../utils/format';
import { Colors } from '../constants/theme';

const SWIPE_THRESHOLD = 100;

function useViewport() {
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return vp;
}

export default function PlayerScreen() {
  const { back, push } = useNav();
  const {
    currentSong, playing, currentTime, duration, playbackError,
    toggle, seek, playNext, playPrevious,
    repeatMode, shuffleEnabled, toggleRepeat, toggleShuffle,
  } = usePlayer();
  const { w, h } = useViewport();
  const maxPan = Math.max(h - w, 0);

  const [coverUri, setCoverUri] = useCachedImage(
    currentSong ? `cover_${currentSong.id}` : null,
    currentSong?.cover_url,
  );

  // ---- Seek slider + panning background ----
  const [sliding, setSliding] = useState(false);
  const [slideValue, setSlideValue] = useState(0);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevTime = useRef(currentTime);
  const [animatePan, setAnimatePan] = useState(false);

  const shownTime = sliding ? slideValue : currentTime;
  const panX = duration > 0 ? -(shownTime / duration) * maxPan : 0;

  useEffect(() => {
    const jump = Math.abs(currentTime - prevTime.current);
    prevTime.current = currentTime;
    setAnimatePan(!sliding && jump <= 2);
  }, [currentTime, sliding]);

  useEffect(() => () => { if (settleTimer.current) clearTimeout(settleTimer.current); }, []);

  const startSlide = () => {
    if (settleTimer.current) { clearTimeout(settleTimer.current); settleTimer.current = null; }
    setSlideValue(currentTime);
    setSliding(true);
  };
  const endSlide = () => {
    if (!sliding) return;
    prevTime.current = slideValue;
    seek(slideValue);
    // Keep the dragged value briefly so the image doesn't jump while the player catches up.
    settleTimer.current = setTimeout(() => { setSliding(false); settleTimer.current = null; }, 500);
  };

  // ---- Swipe down to dismiss ----
  const dragStart = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('input, button')) return;
    dragStart.current = e.clientY;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragStart.current === null) return;
    setDragY(Math.max(0, e.clientY - dragStart.current));
  };
  const onPointerUp = () => {
    if (dragStart.current === null) return;
    dragStart.current = null;
    if (dragY > SWIPE_THRESHOLD) back();
    setDragY(0);
  };

  const dismiss = useCallback(() => back(), [back]);

  useEffect(() => {
    if (!currentSong) dismiss();
  }, [currentSong, dismiss]);

  if (!currentSong) return null;

  const showPanning = playing && !!coverUri;
  const pct = duration > 0 ? (shownTime / duration) * 100 : 0;

  return (
    <div
      className="player"
      style={{ transform: dragY ? `translateY(${dragY}px)` : undefined, transition: dragY ? 'none' : 'transform 0.2s' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {showPanning ? (
        <div className="player-pan">
          <img
            src={coverUri!}
            alt=""
            style={{
              width: h,
              height: h,
              transform: `translateX(${panX}px)`,
              transition: animatePan ? 'transform 1s linear' : 'none',
            }}
          />
        </div>
      ) : coverUri ? (
        <>
          <div className="player-bg-blur" style={{ backgroundImage: `url(${coverUri})` }} />
          <div className="player-bg-dim" />
        </>
      ) : null}

      <div className="player-content">
        <button className="player-close" onClick={dismiss} aria-label="Close player">
          <div className="close-circle"><IoChevronDown size={22} color={Colors.white} /></div>
        </button>

        <div className="player-cover-area">
          <div className="player-cover" style={{ opacity: showPanning ? 0 : 1 }}>
            {coverUri ? (
              <img src={coverUri} alt="" onError={() => setCoverUri(null)} />
            ) : (
              <div className="player-cover-blank">{'\u266A'}</div>
            )}
          </div>
        </div>

        <div className="spacer" />

        <div className="player-info">
          <div className="player-title ellipsis">{currentSong.title}</div>
          <div className="player-artist ellipsis">{currentSong.artist || 'Unknown Artist'}</div>
        </div>
        {playbackError && <div className="player-error">{playbackError}</div>}

        <div className="seek-area">
          <input
            type="range"
            className="range"
            min={0}
            max={duration || 1}
            step={0.1}
            value={shownTime}
            style={{ ['--pct' as any]: `${pct}%` }}
            onPointerDown={startSlide}
            onTouchStart={startSlide}
            onChange={e => { if (!sliding) startSlide(); setSlideValue(Number(e.target.value)); }}
            onPointerUp={endSlide}
            onTouchEnd={endSlide}
            onKeyUp={endSlide}
          />
          <div className="times">
            <span>{fmtClock(shownTime)}</span>
            <span>{fmtClock(duration)}</span>
          </div>
        </div>

        <div className="controls">
          <button className="ctrl-btn" onClick={playPrevious} aria-label="Previous">
            <div className={`btn-circle ${showPanning ? 'bg' : ''}`}><IoPlaySkipBack size={30} /></div>
          </button>
          <button className="ctrl-btn" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
            <div className={`play-inner ${showPanning ? 'panning' : ''}`}>
              {playing ? <IoPause size={32} /> : <IoPlay size={32} style={{ marginLeft: 3 }} />}
            </div>
          </button>
          <button className="ctrl-btn" onClick={playNext} aria-label="Next">
            <div className={`btn-circle ${showPanning ? 'bg' : ''}`}><IoPlaySkipForward size={30} /></div>
          </button>
        </div>

        <div className="bottom-row">
          <button className="ctrl-btn" onClick={toggleShuffle} aria-label="Shuffle">
            <div className={`btn-circle ${showPanning ? 'bg' : ''}`}>
              <IoShuffle size={22} color={shuffleEnabled ? Colors.orange : 'rgba(255,255,255,0.5)'} />
            </div>
          </button>
          <button className="ctrl-btn" onClick={() => push({ name: 'lyrics' })} aria-label="Lyrics">
            <div className={`btn-circle ${showPanning ? 'bg' : ''}`}><IoMusicalNote size={22} /></div>
          </button>
          <button className="ctrl-btn" onClick={() => push({ name: 'queue' })} aria-label="Queue">
            <div className={`btn-circle ${showPanning ? 'bg' : ''}`}><IoList size={22} /></div>
          </button>
          <button className="ctrl-btn" onClick={toggleRepeat} aria-label="Repeat">
            <div className={`btn-circle ${showPanning ? 'bg' : ''}`}>
              <IoRepeat size={22} color={repeatMode !== 'none' ? Colors.orange : 'rgba(255,255,255,0.5)'} />
              {repeatMode === 'song' && <span className="repeat-one">1</span>}
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
