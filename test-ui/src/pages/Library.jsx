import { useState } from 'react';

export default function Library({ songs, onPlay }) {
  const [list, setList] = useState(null);
  const display = list ?? songs;

  const moveUp = (idx) => {
    if (idx === 0) return;
    const next = [...display];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    setList(next);
  };

  const moveDown = (idx) => {
    if (idx === display.length - 1) return;
    const next = [...display];
    [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
    setList(next);
  };

  return (
    <div className="page page--library">
      <h2>Library</h2>
      {display.length === 0 && <p className="muted">No songs. Upload some from the Desktop view!</p>}
      <ul className="song-list">
        {display.map((song, idx) => (
          <li key={song.id} className="song-item">
            <div className="song-item__info">
              <strong>{song.title}</strong>
              <span>{song.artist || 'Unknown Artist'}</span>
            </div>
            <div className="song-item__actions">
              <button className="btn btn--sm" onClick={() => onPlay(song)} title="Play">
                &#9654;
              </button>
              <a
                className="btn btn--sm"
                href={`/api/download/${song.id}`}
                download
                title="Download"
              >
                &#8595;
              </a>
              <button className="btn btn--sm btn--ghost" onClick={() => moveUp(idx)} title="Move up">
                &#8593;
              </button>
              <button className="btn btn--sm btn--ghost" onClick={() => moveDown(idx)} title="Move down">
                &#8595;
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
