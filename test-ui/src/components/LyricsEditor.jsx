import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getLyricSets, getLyricSetText, createLyricSet,
  updateLyricSet, deleteLyricSet, getLegend, saveLegend,
  getSetColors, saveSetColors,
} from '../api/client';
import { SINGER_COLORS, COLOR_NAMES } from '../constants/colors';

function stripColorTags(text) {
  return text.replace(/<[a-z ]+>(.*?)<\/[a-z ]+>/g, '$1');
}

function parseLrc(text) {
  const lines = text.split('\n');
  const result = [];
  for (const line of lines) {
    const m = line.match(/^\[(\d{2}):(\d{2})\.(\d{2,3})\]\s?(.*)/);
    if (m) {
      const mins = parseInt(m[1], 10);
      const secs = parseInt(m[2], 10);
      const ms = parseInt(m[3].padEnd(3, '0'), 10);
      result.push({ time: mins * 60 + secs + ms / 1000, text: stripColorTags(m[4]) });
    } else if (line.trim()) {
      result.push({ time: null, text: stripColorTags(line.trim()) });
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
  const [sets, setSets] = useState([]);
  const [activeSetId, setActiveSetId] = useState(null);
  const [activeLabel, setActiveLabel] = useState('');
  const [lines, setLines] = useState([]);
  const [colorMap, setColorMap] = useState({});
  const [showTextEdit, setShowTextEdit] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncIdx, setSyncIdx] = useState(-1);
  const [saving, setSaving] = useState(false);
  const [editingTs, setEditingTs] = useState(-1);
  const [editTsValue, setEditTsValue] = useState('');
  const lineRefs = useRef([]);
  const tsInputRef = useRef(null);

  const [showNewSet, setShowNewSet] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newAutoSync, setNewAutoSync] = useState(true);
  const [newLyricsText, setNewLyricsText] = useState('');

  const [colorLineIdx, setColorLineIdx] = useState(-1);
  const [selectedColor, setSelectedColor] = useState(null);

  const [showLegendEditor, setShowLegendEditor] = useState(false);
  const [legend, setLegend] = useState({});
  const [legendNewColor, setLegendNewColor] = useState('');
  const [legendNewName, setLegendNewName] = useState('');

  const refreshSets = useCallback(() => {
    getLyricSets(song.id).then(data => {
      const s = data.sets || [];
      setSets(s);
      if (s.length > 0 && !activeSetId) {
        setActiveSetId(s[0].id);
        setActiveLabel(s[0].label);
      }
    }).catch(() => {});
    getLegend(song.id).then(setLegend).catch(() => setLegend({}));
  }, [song.id]);

  useEffect(() => { refreshSets(); }, [refreshSets]);

  useEffect(() => {
    if (!activeSetId) return;
    getLyricSetText(song.id, activeSetId)
      .then((data) => {
        const parsed = parseLrc(data.lyrics);
        setLines(parsed.length > 0 ? parsed : []);
        setTextInput(parsed.map(l => l.text).join('\n'));
      })
      .catch(() => { setLines([]); setTextInput(''); });
    getSetColors(song.id, activeSetId)
      .then(setColorMap)
      .catch(() => setColorMap({}));
    const found = sets.find(s => s.id === activeSetId);
    if (found) setActiveLabel(found.label);
  }, [activeSetId, song.id]);

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
    setLines(prev => { const next = [...prev]; next[idx] = { ...next[idx], time: null }; return next; });
  };

  const startEditTs = (idx) => {
    setEditingTs(idx);
    setEditTsValue(lines[idx].time !== null ? fmtTs(lines[idx].time) : '');
    setTimeout(() => tsInputRef.current?.focus(), 0);
  };

  const commitEditTs = (idx) => {
    const parsed = parseTsInput(editTsValue.trim());
    if (parsed !== null) {
      setLines(prev => { const next = [...prev]; next[idx] = { ...next[idx], time: parsed }; return next; });
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
    setLines(prev => { const next = [...prev]; next[syncIdx] = { ...next[syncIdx], time: t }; return next; });
    let nextIdx = -1;
    for (let i = syncIdx + 1; i < lines.length; i++) {
      if (lines[i].time === null) { nextIdx = i; break; }
    }
    if (nextIdx === -1) { setSyncing(false); setSyncIdx(-1); }
    else { setSyncIdx(nextIdx); }
  }, [syncing, syncIdx, lines, audioRef]);

  const stopSync = () => { setSyncing(false); setSyncIdx(-1); };

  useEffect(() => {
    if (!syncing) return;
    const handler = (e) => {
      if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); handleStamp(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [syncing, handleStamp]);

  useEffect(() => {
    if (syncing && syncIdx >= 0 && lineRefs.current[syncIdx]) {
      lineRefs.current[syncIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [syncIdx, syncing]);

  const buildLrc = () => {
    return lines.map(l => {
      if (l.time !== null && l.time !== undefined) return `[${fmtTs(l.time)}]${l.text}`;
      return l.text;
    }).join('\n');
  };

  const handleSave = async () => {
    if (!activeSetId) return;
    setSaving(true);
    try {
      await updateLyricSet(song.id, activeSetId, { lyrics: buildLrc(), label: activeLabel });
      await saveSetColors(song.id, activeSetId, colorMap);
      onSaved?.();
      onClose();
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  const handleCreateSet = async () => {
    const label = newLabel.trim() || 'Lyrics';
    const primarySet = sets.find(s => s.position === 0);
    const autoSyncFrom = newAutoSync && primarySet ? primarySet.id : null;
    try {
      const result = await createLyricSet(song.id, label, newLyricsText, autoSyncFrom);
      setShowNewSet(false);
      setNewLabel('');
      setNewLyricsText('');
      refreshSets();
      setActiveSetId(result.id);
    } catch { /* ignore */ }
  };

  const handleDeleteSet = async (setId) => {
    if (!confirm('Delete this lyric set?')) return;
    try {
      await deleteLyricSet(song.id, setId);
      if (activeSetId === setId) setActiveSetId(null);
      refreshSets();
    } catch { /* ignore */ }
  };

  // Color assignment (modifies colorMap, NOT the lyrics text)
  const setWholeLineColor = (lineIdx, color) => {
    setColorMap(prev => {
      const next = { ...prev };
      if (color) {
        next[String(lineIdx)] = color;
      } else {
        delete next[String(lineIdx)];
      }
      return next;
    });
    setColorLineIdx(-1);
  };

  const setPartialColor = (lineIdx, start, end, color) => {
    const text = lines[lineIdx]?.text || '';
    setColorMap(prev => {
      const next = { ...prev };
      const existing = prev[String(lineIdx)];
      let segments = [];
      if (typeof existing === 'string') {
        segments = [{ s: 0, e: text.length, c: existing }];
      } else if (Array.isArray(existing)) {
        segments = [...existing];
      }
      const newSegments = [];
      for (const seg of segments) {
        if (seg.e <= start || seg.s >= end) {
          newSegments.push(seg);
        } else {
          if (seg.s < start) newSegments.push({ s: seg.s, e: start, c: seg.c });
          if (seg.e > end) newSegments.push({ s: end, e: seg.e, c: seg.c });
        }
      }
      if (color) {
        newSegments.push({ s: start, e: end, c: color });
      }
      newSegments.sort((a, b) => a.s - b.s);
      if (newSegments.length === 0) {
        delete next[String(lineIdx)];
      } else if (newSegments.length === 1 && newSegments[0].s === 0 && newSegments[0].e >= text.length) {
        next[String(lineIdx)] = newSegments[0].c;
      } else {
        next[String(lineIdx)] = newSegments;
      }
      return next;
    });
    setColorLineIdx(-1);
  };

  const clearLineColors = (lineIdx) => {
    setColorMap(prev => {
      const next = { ...prev };
      delete next[String(lineIdx)];
      return next;
    });
    setColorLineIdx(-1);
  };

  // Legend editor
  const handleAddLegendEntry = () => {
    if (!legendNewColor || !legendNewName.trim()) return;
    const updated = { ...legend, [legendNewColor]: legendNewName.trim() };
    setLegend(updated);
    saveLegend(song.id, updated).catch(() => {});
    setLegendNewColor('');
    setLegendNewName('');
  };

  const handleDeleteLegendEntry = (color) => {
    const updated = { ...legend };
    delete updated[color];
    setLegend(updated);
    saveLegend(song.id, updated).catch(() => {});
  };

  const firstUnstamped = lines.findIndex(l => l.time === null);
  const hasAnyTs = lines.some(l => l.time !== null);
  const usedLegendColors = new Set(Object.keys(legend));
  const availableColors = COLOR_NAMES.filter(c => !usedLegendColors.has(c));

  const getLineColorPreview = (lineIdx) => {
    const entry = colorMap[String(lineIdx)];
    if (!entry) return null;
    if (typeof entry === 'string') return SINGER_COLORS[entry] || null;
    if (Array.isArray(entry) && entry.length > 0) return SINGER_COLORS[entry[0].c] || null;
    return null;
  };

  if (showNewSet) {
    const primarySet = sets.find(s => s.position === 0);
    return (
      <div className="lyrics-overlay">
        <div className="lyrics-overlay__header">
          <h3>New Lyric Set</h3>
          <button className="modal__close" onClick={() => setShowNewSet(false)}>&times;</button>
        </div>
        <div className="lyrics-overlay__body lyrics-editor" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <label style={{ marginBottom: '.3rem' }}>Label</label>
          <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="e.g. Romanized, Translated" style={{ marginBottom: '.6rem', padding: '.4rem .6rem', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)' }} />
          {primarySet && (
            <label style={{ marginBottom: '.6rem', display: 'flex', alignItems: 'center', gap: '.4rem' }}>
              <input type="checkbox" checked={newAutoSync} onChange={e => setNewAutoSync(e.target.checked)} />
              Auto-sync timestamps from "{primarySet.label}"
            </label>
          )}
          <label style={{ marginBottom: '.3rem' }}>Lyrics (plain text, one line per line)</label>
          <textarea
            className="lyrics-editor__textarea"
            value={newLyricsText}
            onChange={e => setNewLyricsText(e.target.value)}
            placeholder="Paste lyrics here..."
            rows={12}
          />
          <div className="lyrics-editor__actions" style={{ marginTop: '.8rem' }}>
            <button className="btn btn--primary" onClick={handleCreateSet} disabled={!newLyricsText.trim()}>Create Set</button>
            <button className="btn btn--ghost" onClick={() => setShowNewSet(false)}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  if (showLegendEditor) {
    return (
      <div className="lyrics-overlay">
        <div className="lyrics-overlay__header">
          <h3>Color Legend</h3>
          <button className="modal__close" onClick={() => setShowLegendEditor(false)}>&times;</button>
        </div>
        <div className="lyrics-overlay__body lyrics-editor" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          {Object.entries(legend).map(([color, name]) => (
            <div key={color} className="lyrics-legend-editor__row">
              <span className="lyrics-legend__swatch" style={{ background: SINGER_COLORS[color] || color }} />
              <span style={{ flex: 1 }}>{color}: {name}</span>
              <button className="btn btn--sm btn--ghost" onClick={() => handleDeleteLegendEntry(color)}>&times;</button>
            </div>
          ))}
          <div className="lyrics-legend-editor__add">
            <select value={legendNewColor} onChange={e => setLegendNewColor(e.target.value)} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '4px', padding: '.3rem' }}>
              <option value="">Pick color...</option>
              {availableColors.map(c => (
                <option key={c} value={c} style={{ color: SINGER_COLORS[c] }}>{c}</option>
              ))}
            </select>
            <input value={legendNewName} onChange={e => setLegendNewName(e.target.value)} placeholder="Singer name" style={{ flex: 1, padding: '.3rem .5rem', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)' }} />
            <button className="btn btn--sm btn--primary" onClick={handleAddLegendEntry} disabled={!legendNewColor || !legendNewName.trim()}>Add</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lyrics-overlay">
      <div className="lyrics-overlay__header">
        <h3>{song.title} — Lyrics Editor</h3>
        <button className="modal__close" onClick={onClose}>&times;</button>
      </div>

      <div className="lyrics-editor__set-bar">
        {sets.map(s => (
          <button key={s.id}
            className={`lyrics-set-tab ${s.id === activeSetId ? 'lyrics-set-tab--active' : ''}`}
            onClick={() => setActiveSetId(s.id)}>
            {s.label}
          </button>
        ))}
        <button className="lyrics-set-tab lyrics-set-tab--add" onClick={() => setShowNewSet(true)}>+ New Set</button>
        {activeSetId && sets.length > 1 && (
          <button className="lyrics-set-tab lyrics-set-tab--del" onClick={() => handleDeleteSet(activeSetId)} title="Delete this set">&times;</button>
        )}
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
              <button className="btn btn--primary" onClick={applyTextEdit} disabled={!textInput.trim()}>Apply Text</button>
              <button className="btn btn--ghost" onClick={() => setShowTextEdit(false)}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            <div className="lyrics-editor__actions" style={{ marginBottom: '.6rem', marginTop: 0 }}>
              <button className="btn btn--sm btn--ghost" onClick={() => { setTextInput(lines.map(l => l.text).join('\n')); setShowTextEdit(true); }}>Edit Text</button>
              {!syncing && firstUnstamped >= 0 && (
                <button className="btn btn--sm btn--primary" onClick={() => startSyncFrom(firstUnstamped)}>
                  {hasAnyTs ? 'Resume Sync' : 'Sync Timestamps'}
                </button>
              )}
              {syncing && (
                <>
                  <button className="btn btn--sm btn--primary" onClick={handleStamp}>Stamp ({syncIdx + 1}/{lines.length})</button>
                  <button className="btn btn--sm btn--ghost" onClick={stopSync}>Stop Sync</button>
                </>
              )}
              <button className="btn btn--sm btn--ghost" onClick={() => setShowLegendEditor(true)}>Legend</button>
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
                <button className="btn btn--sm btn--ghost" style={{ marginTop: '.5rem' }} onClick={() => setShowTextEdit(true)}>Add Lyrics</button>
              </div>
            ) : (
              <div className="lyrics-editor__lines">
                {lines.map((line, i) => (
                  <div key={i} ref={el => lineRefs.current[i] = el}
                    className={`lyrics-editor__line ${i === syncIdx && syncing ? 'lyrics-editor__line--active' : ''} ${line.time !== null ? 'lyrics-editor__line--stamped' : ''}`}>
                    <span className="lyrics-editor__ts-group">
                      {editingTs === i ? (
                        <input ref={tsInputRef} className="lyrics-editor__ts-input" value={editTsValue}
                          onChange={e => setEditTsValue(e.target.value)}
                          onBlur={() => commitEditTs(i)}
                          onKeyDown={e => { if (e.key === 'Enter') commitEditTs(i); if (e.key === 'Escape') setEditingTs(-1); }}
                          placeholder="mm:ss.xx" />
                      ) : (
                        <span className="lyrics-editor__ts" onClick={() => startEditTs(i)} title="Click to edit timestamp">
                          {line.time !== null ? fmtTs(line.time) : '--:--.--'}
                        </span>
                      )}
                      {line.time !== null && (
                        <button className="lyrics-editor__ts-clear" onClick={() => clearTimestamp(i)} title="Clear timestamp">&times;</button>
                      )}
                      {!syncing && line.time === null && (
                        <button className="lyrics-editor__ts-sync-btn" onClick={() => startSyncFrom(i)} title="Start syncing from this line">&#9654;</button>
                      )}
                    </span>
                    <span className="lyrics-editor__line-text"
                      style={getLineColorPreview(i) ? { borderLeft: `3px solid ${getLineColorPreview(i)}`, paddingLeft: '.4rem' } : {}}
                      onClick={() => setColorLineIdx(colorLineIdx === i ? -1 : i)}>
                      {line.text}
                    </span>
                    <button className="lyrics-editor__color-btn" onClick={() => setColorLineIdx(colorLineIdx === i ? -1 : i)} title="Color this line">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-1 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>
                    </button>
                    {colorLineIdx === i && (
                      <div className="lyrics-editor__color-picker" onClick={e => e.stopPropagation()}>
                        <div className="lyrics-editor__color-palette">
                          <button className={`lyrics-editor__color-swatch ${selectedColor === null ? 'lyrics-editor__color-swatch--active' : ''}`}
                            style={{ background: '#fff', border: '1px solid #666' }}
                            onClick={() => setSelectedColor(null)} title="White (remove color)" />
                          {COLOR_NAMES.map(c => (
                            <button key={c}
                              className={`lyrics-editor__color-swatch ${selectedColor === c ? 'lyrics-editor__color-swatch--active' : ''}`}
                              style={{ background: SINGER_COLORS[c] }}
                              onClick={() => setSelectedColor(c)} title={`${c}${legend[c] ? ` (${legend[c]})` : ''}`} />
                          ))}
                        </div>
                        <div className="lyrics-editor__color-line-actions">
                          <button className="btn btn--sm btn--primary" onClick={() => setWholeLineColor(i, selectedColor)}>
                            {selectedColor ? 'Color Whole Line' : 'Remove Line Color'}
                          </button>
                          <button className="btn btn--sm btn--ghost" onClick={() => clearLineColors(i)}>
                            Clear Colors
                          </button>
                        </div>
                        <PartialColorPicker
                          key={`${i}-${colorLineIdx}`}
                          text={line.text}
                          selectedColor={selectedColor}
                          onApply={(start, end) => setPartialColor(i, start, end, selectedColor)}
                        />
                      </div>
                    )}
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

function PartialColorPicker({ text, selectedColor, onApply }) {
  const [selStart, setSelStart] = useState(null);
  const [selEnd, setSelEnd] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.value = text;
      inputRef.current.setSelectionRange(0, 0);
    }
  }, [text]);

  const handleSelect = () => {
    const el = inputRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (end > start) { setSelStart(start); setSelEnd(end); }
  };

  return (
    <div className="lyrics-editor__color-line">
      <p className="muted" style={{ fontSize: '.7rem', margin: '.3rem 0' }}>
        Or select part of the line to color just that section:
      </p>
      <input
        ref={inputRef}
        className="lyrics-editor__color-line-text"
        defaultValue={text}
        readOnly
        onMouseUp={handleSelect}
        onKeyUp={handleSelect}
      />
      {selStart !== null && selEnd !== null && (
        <div className="lyrics-editor__color-line-actions">
          <span className="muted" style={{ fontSize: '.75rem' }}>
            "{text.slice(selStart, selEnd)}" → {selectedColor || 'remove color'}
          </span>
          <button className="btn btn--sm btn--primary" onClick={() => onApply(selStart, selEnd)}>Apply to Selection</button>
        </div>
      )}
    </div>
  );
}
