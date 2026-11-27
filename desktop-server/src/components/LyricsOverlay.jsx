import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { getLyricSets, getLyricSetText, getLegend, getSetColors } from '../api/client';
import LyricsEditor from './LyricsEditor';
import { SINGER_COLORS } from '../constants/colors';

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
      const raw = m[4].replace(/<[a-z ]+>(.*?)<\/[a-z ]+>/g, '$1');
      result.push({ time: mins * 60 + secs + ms / 1000, text: raw });
      hasTimes = true;
    } else if (line.trim()) {
      const raw = line.trim().replace(/<[a-z ]+>(.*?)<\/[a-z ]+>/g, '$1');
      result.push({ time: null, text: raw });
    }
  }
  return { lines: result, hasTimes };
}

function buildColoredSegments(text, colorEntry) {
  if (!colorEntry) return [{ text, color: null }];
  if (typeof colorEntry === 'string') return [{ text, color: colorEntry }];
  if (!Array.isArray(colorEntry) || colorEntry.length === 0) return [{ text, color: null }];
  const segments = [];
  let lastEnd = 0;
  const sorted = [...colorEntry].sort((a, b) => a.s - b.s);
  for (const { s, e, c } of sorted) {
    if (s > lastEnd) segments.push({ text: text.slice(lastEnd, s), color: null });
    segments.push({ text: text.slice(s, Math.min(e, text.length)), color: c });
    lastEnd = Math.min(e, text.length);
  }
  if (lastEnd < text.length) segments.push({ text: text.slice(lastEnd), color: null });
  return segments;
}

function getSegmentColor(colorName, state) {
  if (!colorName) {
    if (state === 'active') return '#ffffff';
    if (state === 'past') return 'rgba(255,255,255,.7)';
    return '#666';
  }
  const hex = SINGER_COLORS[colorName] || '#ffffff';
  if (state === 'active') return hex;
  if (state === 'past') return hex + 'aa';
  return '#666';
}

export default function LyricsOverlay({ song, onClose, currentTime, audioRef, readOnly = false }) {
  const [sets, setSets] = useState([]);
  const [activeSetId, setActiveSetId] = useState(null);
  const [rawLyrics, setRawLyrics] = useState(null);
  const [colorMap, setColorMap] = useState({});
  const [legend, setLegend] = useState({});
  const [showLegend, setShowLegend] = useState(false);
  const [error, setError] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const lineRefs = useRef([]);

  const fetchSets = useCallback(() => {
    if (!song) return;
    setError(null);
    getLyricSets(song.id)
      .then((data) => {
        const s = data.sets || [];
        setSets(s);
        if (s.length > 0) {
          setActiveSetId(prev => {
            if (prev && s.find(x => x.id === prev)) return prev;
            return s[0].id;
          });
        } else {
          setActiveSetId(null);
          setRawLyrics(null);
          setError('No lyrics available');
        }
      })
      .catch(() => setError('No lyrics available'));
    getLegend(song.id).then(setLegend).catch(() => setLegend({}));
  }, [song?.id]);

  useEffect(() => { fetchSets(); }, [fetchSets]);

  useEffect(() => {
    if (!activeSetId || !song) return;
    setRawLyrics(null);
    setColorMap({});
    getLyricSetText(song.id, activeSetId)
      .then((data) => setRawLyrics(data.lyrics))
      .catch(() => setRawLyrics(null));
    getSetColors(song.id, activeSetId)
      .then(setColorMap)
      .catch(() => setColorMap({}));
  }, [activeSetId, song?.id, refreshKey]);

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

  const hasLegend = Object.keys(legend).length > 0;

  if (!readOnly && showEditor) {
    return (
      <LyricsEditor
        song={song}
        audioRef={audioRef}
        onClose={() => setShowEditor(false)}
        onSaved={() => { setShowEditor(false); fetchSets(); setRefreshKey(k => k + 1); }}
      />
    );
  }

  const renderLine = (line, i) => {
    const entry = colorMap[String(i)];
    const segments = buildColoredSegments(line.text, entry);
    const state = i === activeIdx ? 'active' : (i < activeIdx && line.time !== null ? 'past' : 'upcoming');
    return (
      <div
        key={i}
        ref={el => lineRefs.current[i] = el}
        className={`lyrics-synced__line ${state === 'active' ? 'lyrics-synced__line--active' : ''} ${state === 'past' ? 'lyrics-synced__line--past' : ''}`}
      >
        {segments.map((seg, j) => (
          <span key={j} style={{ color: getSegmentColor(seg.color, state) }}>
            {seg.text}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="lyrics-overlay">
      <div className="lyrics-overlay__header">
        <h3>{song.title} — Lyrics</h3>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
          {hasLegend && (
            <button className="btn btn--sm btn--ghost" onClick={() => setShowLegend(v => !v)} title="Toggle Legend">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
            </button>
          )}
          {!readOnly && (
            <button className="btn btn--sm btn--ghost" onClick={() => setShowEditor(true)} title="Edit Lyrics">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 000-1.42l-2.34-2.34a1.003 1.003 0 00-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"/></svg>
            </button>
          )}
          <button className="modal__close" onClick={onClose}>&times;</button>
        </div>
      </div>

      {sets.length > 1 && (
        <div className="lyrics-overlay__set-tabs">
          {sets.map(s => (
            <button
              key={s.id}
              className={`lyrics-set-tab ${s.id === activeSetId ? 'lyrics-set-tab--active' : ''}`}
              onClick={() => setActiveSetId(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      <div className="lyrics-overlay__body-wrap">
        <div className="lyrics-overlay__body">
          {parsed && parsed.hasTimes ? (
            <div className="lyrics-synced">
              {parsed.lines.map((line, i) => renderLine(line, i))}
            </div>
          ) : parsed && !parsed.hasTimes ? (
            <pre className="lyrics-overlay__text">{rawLyrics}</pre>
          ) : error && sets.length === 0 ? (
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

        {showLegend && hasLegend && (
          <div className="lyrics-legend">
            <h4 className="lyrics-legend__title">Singers</h4>
            {Object.entries(legend).map(([color, name]) => (
              <div key={color} className="lyrics-legend__entry">
                <span className="lyrics-legend__swatch" style={{ background: SINGER_COLORS[color] || color }} />
                <span className="lyrics-legend__name">{name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
