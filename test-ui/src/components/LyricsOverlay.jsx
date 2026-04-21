import { useState, useEffect, useRef, useMemo } from 'react';
import { getLyrics } from '../api/client';
import LyricsEditor from './LyricsEditor';

function parseLrc(text) {
  const lines = text.split('\n');
  const result = [];
  let hasTimes = false;
  for (const line of lines) {
    const m = line.match(/^\[(\d{2}):(\d{2})\.(\d{2,3})\]\s?(.*)/);
    if (m) {
      const mins = parseInt(m[1], 10);
      const secs = parseInt(m[2], 10);
      const ms = parseInt(m[3].padEnd(3, '0'), 10);
      result.push({ time: mins * 60 + secs + ms / 1000, text: m[4] });
      hasTimes = true;
    } else if (line.trim()) {
      result.push({ time: null, text: line.trim() });
    }
  }
  return { lines: result, hasTimes };
}

export default function LyricsOverlay({ song, onClose, currentTime, audioRef, readOnly = false }) {
  const [rawLyrics, setRawLyrics] = useState(null);
  const [error, setError] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const lineRefs = useRef([]);

  const fetchLyrics = () => {
    if (!song) return;
    setRawLyrics(null);
    setError(null);
    getLyrics(song.id)
      .then((data) => setRawLyrics(data.lyrics))
      .catch(() => setError('No lyrics available'));
  };

  useEffect(() => { fetchLyrics(); }, [song?.id]);

  const parsed = useMemo(() => {
    if (!rawLyrics) return null;
    return parseLrc(rawLyrics);
  }, [rawLyrics]);

  const lastTimedIdx = useMemo(() => {
    if (!parsed || !parsed.hasTimes) return -1;
    let last = -1;
    for (let i = 0; i < parsed.lines.length; i++) {
      if (parsed.lines[i].time !== null) last = i;
    }
    return last;
  }, [parsed]);

  const activeIdx = useMemo(() => {
    if (!parsed || !parsed.hasTimes || currentTime == null) return -1;
    let idx = -1;
    for (let i = 0; i < parsed.lines.length; i++) {
      if (parsed.lines[i].time !== null && parsed.lines[i].time <= currentTime) {
        idx = i;
      }
    }
    return idx;
  }, [parsed, currentTime]);

  useEffect(() => {
    if (activeIdx >= 0 && activeIdx <= lastTimedIdx && lineRefs.current[activeIdx]) {
      lineRefs.current[activeIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeIdx, lastTimedIdx]);

  if (!readOnly && showEditor) {
    return (
      <LyricsEditor
        song={song}
        audioRef={audioRef}
        onClose={() => setShowEditor(false)}
        onSaved={() => { setShowEditor(false); fetchLyrics(); }}
      />
    );
  }

  return (
    <div className="lyrics-overlay">
      <div className="lyrics-overlay__header">
        <h3>{song.title} — Lyrics</h3>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
          {!readOnly && (
            <button className="btn btn--sm btn--ghost" onClick={() => setShowEditor(true)} title="Edit Lyrics">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 000-1.42l-2.34-2.34a1.003 1.003 0 00-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"/></svg>
            </button>
          )}
          <button className="modal__close" onClick={onClose}>&times;</button>
        </div>
      </div>
      <div className="lyrics-overlay__body">
        {parsed && parsed.hasTimes ? (
          <div className="lyrics-synced">
            {parsed.lines.map((line, i) => (
              <div
                key={i}
                ref={el => lineRefs.current[i] = el}
                className={`lyrics-synced__line ${i === activeIdx ? 'lyrics-synced__line--active' : ''} ${i < activeIdx && parsed.lines[i].time !== null ? 'lyrics-synced__line--past' : ''}`}
              >
                {line.text}
              </div>
            ))}
          </div>
        ) : parsed && !parsed.hasTimes ? (
          <pre className="lyrics-overlay__text">{rawLyrics}</pre>
        ) : error ? (
          <div style={{ textAlign: 'center' }}>
            <p className="muted">{error}</p>
            {!readOnly && (
              <button className="btn btn--sm btn--ghost" style={{ marginTop: '.5rem' }} onClick={() => setShowEditor(true)}>
                Add Lyrics
              </button>
            )}
          </div>
        ) : (
          <p className="muted">Loading...</p>
        )}
      </div>
    </div>
  );
}
