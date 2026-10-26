import { IoPause, IoPlay } from 'react-icons/io5';
import CoverImage from './CoverImage';
import { usePlayer } from '../contexts/PlayerContext';

export default function MiniPlayer({ onPress }: { onPress: () => void }) {
  const { currentSong, playing, toggle, currentTime, duration } = usePlayer();

  if (!currentSong) {
    return (
      <div className="mini-empty">
        <span>No song selected</span>
      </div>
    );
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="mini" onClick={onPress} role="button">
      <CoverImage coverUrl={currentSong.cover_url} songId={currentSong.id} size={44} />
      <div className="mini-info">
        <div className="mini-title ellipsis">{currentSong.title}</div>
        <div className="mini-artist ellipsis">{currentSong.artist || 'Unknown Artist'}</div>
      </div>
      <button className="mini-play" onClick={(e) => { e.stopPropagation(); toggle(); }} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? <IoPause size={22} /> : <IoPlay size={22} />}
      </button>
      <div className="mini-track">
        <div className="mini-fill" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
