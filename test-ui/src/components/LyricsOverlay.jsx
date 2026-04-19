import { useState, useEffect } from 'react';
import { getLyrics } from '../api/client';

export default function LyricsOverlay({ song, onClose }) {
  const [lyrics, setLyrics] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!song) return;
    setLyrics(null);
    setError(null);
    getLyrics(song.id)
      .then((data) => setLyrics(data.lyrics))
      .catch(() => setError('No lyrics available'));
  }, [song?.id]);

  return (
    <div className="lyrics-overlay">
      <div className="lyrics-overlay__header">
        <h3>{song.title} — Lyrics</h3>
        <button className="modal__close" onClick={onClose}>&times;</button>
      </div>
      <div className="lyrics-overlay__body">
        {lyrics ? (
          <pre className="lyrics-overlay__text">{lyrics}</pre>
        ) : error ? (
          <p className="muted">{error}</p>
        ) : (
          <p className="muted">Loading...</p>
        )}
      </div>
    </div>
  );
}
