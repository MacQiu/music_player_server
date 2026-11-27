export default function Player({ song, playing, currentTime, duration, toggle }) {
  if (!song) {
    return <div className="player player--empty"><span>No song selected</span></div>;
  }

  return (
    <div className="player">
      <div className="player__cover">
        {song.cover_url ? (
          <img src={`/api${song.cover_url}`} alt="" />
        ) : (
          <span className="player__cover-blank">♪</span>
        )}
      </div>
      <div className="player__info">
        <strong>{song.title}</strong>
        <span>{song.artist || 'Unknown Artist'}</span>
      </div>
      <div className="player__controls">
        <button onClick={(e) => { e.stopPropagation(); toggle(); }} className="btn btn--icon">
          {playing ? '⏸' : '▶'}
        </button>
      </div>
      <div className="player__progress">
        <div className="player__progress-fill" style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }} />
      </div>
    </div>
  );
}
