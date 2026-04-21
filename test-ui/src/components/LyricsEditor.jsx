import { useState, useEffect, useCallback, useRef } from 'react';
import { getLyrics, saveLyrics } from '../api/client';

function parseLrc(text) {
  const lines = text.split('\n');
  const result = [];
  for (const line of lines) {
    const m = line.match(/^\[(\d{2}):(\d{2})\.(\d{2,3})\]\s?(.*)/);
    if (m) {
      const mins = parseInt(m[1], 10);
      const secs = parseInt(m[2], 10);
      const ms = parseInt(m[3].padEnd(3, '0'), 10);
      result.push({ time: mins * 60 + secs + ms / 1000, text: m[4] });
    } else if (line.trim()) {
      result.push({ time: null, text: line.trim() });
    }
  }
  return result;
}

function fmtTs(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  const ms = Math.floor((seconds % 1) * 100).toString().padStart(2, '0');
  return `${m}:${s}.${ms}`;
}

function parseTsInput(str) {
  const m = str.match(/^(\d{1,2}):(\d{2})\.(\d{2,3})$/);
  if (!m) return null;
  const mins = parseInt(m[1], 10);
  const secs = parseInt(m[2], 10);
  const ms = parseInt(m[3].padEnd(3, '0'), 10);
  if (secs >= 60) return null;
  return mins * 60 + secs + ms / 1000;
}

export default function LyricsEditor({ song, audioRef, onClose, onSaved }) {
  const [lines, setLines] = useState([]);
  const [showTextEdit, setShowTextEdit] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncIdx, setSyncIdx] = useState(-1);
  const [saving, setSaving] = useState(false);
  const [editingTs, setEditingTs] = useState(-1);
  const [editTsValue, setEditTsValue] = useState('');
  const lineRefs = useRef([]);
  const tsInputRef = useRef(null);

  useEffect(() => {
    getLyrics(song.id)
      .then((data) => {
        const parsed = parseLrc(data.lyrics);
        if (parsed.length > 0) {
          setLines(parsed);
          setTextInput(parsed.map(l => l.text).join('\n'));
        }
      })
      .catch(() => {});
  }, [song.id]);

  const applyTextEdit = () => {
    const newTexts = textInput.split('\n').filter(l => l.trim());
    if (newTexts.length === 0) return;
    setLines(prev => {
      return newTexts.map((text, i) => ({
        text,
        time: i < prev.length ? prev[i].time : null,
      }));
    });
    setShowTextEdit(false);
  };

  const clearTimestamp = (idx) => {
    setLines(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], time: null };
      return next;
    });
  };

  const startEditTs = (idx) => {
    setEditingTs(idx);
    setEditTsValue(lines[idx].time !== null ? fmtTs(lines[idx].time) : '');
    setTimeout(() => tsInputRef.current?.focus(), 0);
  };

  const commitEditTs = (idx) => {
    const parsed = parseTsInput(editTsValue.trim());
    if (parsed !== null) {
      setLines(prev => {
        const next = [...prev];
        next[idx] = { ...next[idx], time: parsed };
        return next;
      });
    }
    setEditingTs(-1);
  };

  const startSyncFrom = (startIdx) => {
    setSyncIdx(startIdx);
    setSyncing(true);
    const el = audioRef.current;
    if (el && el.paused) el.play().catch(() => {});
  };

  const handleStamp = useCallback(() => {
    if (!syncing || syncIdx < 0 || syncIdx >= lines.length) return;
    const el = audioRef.current;
    const t = el?.currentTime ?? 0;
    setLines(prev => {
      const next = [...prev];
      next[syncIdx] = { ...next[syncIdx], time: t };
      return next;
    });

    let nextIdx = -1;
    for (let i = syncIdx + 1; i < lines.length; i++) {
      if (lines[i].time === null) { nextIdx = i; break; }
    }
    if (nextIdx === -1) {
      setSyncing(false);
      setSyncIdx(-1);
    } else {
      setSyncIdx(nextIdx);
    }
  }, [syncing, syncIdx, lines, audioRef]);

  const stopSync = () => {
    setSyncing(false);
    setSyncIdx(-1);
  };

  useEffect(() => {
    if (!syncing) return;
    const handler = (e) => {
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        handleStamp();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [syncing, handleStamp]);

  useEffect(() => {
    if (syncing && syncIdx >= 0 && lineRefs.current[syncIdx]) {
      lineRefs.current[syncIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [syncIdx, syncing]);

  const handleSave = async () => {
    const lrc = lines.map(l => {
      if (l.time !== null && l.time !== undefined) {
        return `[${fmtTs(l.time)}]${l.text}`;
      }
      return l.text;
    }).join('\n');
    setSaving(true);
    try {
      await saveLyrics(song.id, lrc);
      onSaved?.();
      onClose();
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  const firstUnstamped = lines.findIndex(l => l.time === null);
  const hasAnyTs = lines.some(l => l.time !== null);

  return (
    <div className="lyrics-overlay">
      <div className="lyrics-overlay__header">
        <h3>{song.title} — Lyrics Editor</h3>
        <button className="modal__close" onClick={onClose}>&times;</button>
      </div>
      <div className="lyrics-overlay__body lyrics-editor">
        {showTextEdit ? (
          <>
            <p className="muted" style={{ marginBottom: '.5rem' }}>
              Edit lyrics text (one line per line). Existing timestamps are preserved for matching line numbers.
            </p>
            <textarea
              className="lyrics-editor__textarea"
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              placeholder="Paste lyrics here..."
              rows={14}
            />
            <div className="lyrics-editor__actions">
              <button className="btn btn--primary" onClick={applyTextEdit}
                disabled={!textInput.trim()}>
                Apply Text
              </button>
              <button className="btn btn--ghost" onClick={() => setShowTextEdit(false)}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="lyrics-editor__actions" style={{ marginBottom: '.6rem', marginTop: 0 }}>
              <button className="btn btn--sm btn--ghost" onClick={() => {
                setTextInput(lines.map(l => l.text).join('\n'));
                setShowTextEdit(true);
              }}>
                Edit Text
              </button>
              {!syncing && firstUnstamped >= 0 && (
                <button className="btn btn--sm btn--primary" onClick={() => startSyncFrom(firstUnstamped)}>
                  {hasAnyTs ? 'Resume Sync' : 'Sync Timestamps'}
                </button>
              )}
              {syncing && (
                <>
                  <button className="btn btn--sm btn--primary" onClick={handleStamp}>
                    Stamp ({syncIdx + 1}/{lines.length})
                  </button>
                  <button className="btn btn--sm btn--ghost" onClick={stopSync}>
                    Stop Sync
                  </button>
                </>
              )}
              <button className="btn btn--sm btn--primary" onClick={handleSave} disabled={saving || lines.length === 0}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
            {syncing && (
              <div className="lyrics-editor__sync-hint">
                <span>Press <kbd>Space</kbd> or tap <b>Stamp</b> when each line starts</span>
              </div>
            )}
            {lines.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                <p className="muted">No lyrics yet.</p>
                <button className="btn btn--sm btn--ghost" style={{ marginTop: '.5rem' }}
                  onClick={() => setShowTextEdit(true)}>
                  Add Lyrics
                </button>
              </div>
            ) : (
              <div className="lyrics-editor__lines">
                {lines.map((line, i) => (
                  <div key={i}
                    ref={el => lineRefs.current[i] = el}
                    className={`lyrics-editor__line ${i === syncIdx && syncing ? 'lyrics-editor__line--active' : ''} ${line.time !== null ? 'lyrics-editor__line--stamped' : ''}`}>
                    <span className="lyrics-editor__ts-group">
                      {editingTs === i ? (
                        <input
                          ref={tsInputRef}
                          className="lyrics-editor__ts-input"
                          value={editTsValue}
                          onChange={e => setEditTsValue(e.target.value)}
                          onBlur={() => commitEditTs(i)}
                          onKeyDown={e => { if (e.key === 'Enter') commitEditTs(i); if (e.key === 'Escape') setEditingTs(-1); }}
                          placeholder="mm:ss.xx"
                        />
                      ) : (
                        <span className="lyrics-editor__ts"
                          onClick={() => startEditTs(i)}
                          title="Click to edit timestamp">
                          {line.time !== null ? fmtTs(line.time) : '--:--.--'}
                        </span>
                      )}
                      {line.time !== null && (
                        <button className="lyrics-editor__ts-clear" onClick={() => clearTimestamp(i)} title="Clear timestamp">
                          &times;
                        </button>
                      )}
                      {!syncing && line.time === null && (
                        <button className="lyrics-editor__ts-sync-btn"
                          onClick={() => startSyncFrom(i)}
                          title="Start syncing from this line">
                          &#9654;
                        </button>
                      )}
                    </span>
                    <span className="lyrics-editor__line-text">{line.text}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
