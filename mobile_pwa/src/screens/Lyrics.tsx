import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { IoChevronDown, IoClose, IoInformationCircle, IoCreate } from 'react-icons/io5';
import Header from '../components/Header';
import { usePlayer } from '../contexts/PlayerContext';
import { useData } from '../contexts/DataContext';
import { useNav } from '../navigation/Navigator';
import {
  getLyricSets, getLyricSetText, getLegend, getSetColors,
  createLyricSet, updateLyricSet, saveSetColors,
} from '../api/client';
import {
  cacheLyricSets, getCachedLyricSets,
  cacheLyricText, getCachedLyricText,
  cacheColors, getCachedColors,
  cacheLegend as cacheLegendLocal, getCachedLegend,
} from '../storage/lyricsCache';
import { SINGER_COLORS } from '../constants/colors';

// Module-level memory cache keyed by songId so lyrics persist across overlay opens
const lyricsMemCache = new Map<string, {
  sets: any[];
  legend: any;
  texts: Map<string, string | null>;
  colors: Map<string, any>;
}>();

function getOrCreateSongCache(songId: string) {
  if (!lyricsMemCache.has(songId)) {
    lyricsMemCache.set(songId, { sets: [], legend: {}, texts: new Map(), colors: new Map() });
  }
  return lyricsMemCache.get(songId)!;
}

function parseLrc(text: string) {
  const lines = text.split('\n');
  const result: { time: number | null; text: string }[] = [];
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

function buildColoredSegments(text: string, colorEntry: any) {
  if (!colorEntry) return [{ text, color: null }];
  if (typeof colorEntry === 'string') return [{ text, color: colorEntry }];
  if (!Array.isArray(colorEntry) || colorEntry.length === 0) return [{ text, color: null }];
  const segments: { text: string; color: string | null }[] = [];
  let lastEnd = 0;
  const sorted = [...colorEntry].sort((a: any, b: any) => a.s - b.s);
  for (const { s, e, c } of sorted) {
    if (s > lastEnd) segments.push({ text: text.slice(lastEnd, s), color: null });
    segments.push({ text: text.slice(s, Math.min(e, text.length)), color: c });
    lastEnd = Math.min(e, text.length);
  }
  if (lastEnd < text.length) segments.push({ text: text.slice(lastEnd), color: null });
  return segments;
}

function getSegmentColor(colorName: string | null, state: string) {
  if (!colorName) {
    if (state === 'active') return '#ffffff';
    if (state === 'past') return 'rgba(255,255,255,0.7)';
    return '#666';
  }
  const hex = SINGER_COLORS[colorName] || '#ffffff';
  if (state === 'active') return hex;
  if (state === 'past') return hex + 'aa';
  return '#666';
}

function fmtTs(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  const ms = Math.floor((seconds % 1) * 100).toString().padStart(2, '0');
  return `${m}:${s}.${ms}`;
}

export default function LyricsScreen() {
  const { back } = useNav();
  const { currentSong, currentTime, seek } = usePlayer();
  const { online } = useData();
  const [sets, setSets] = useState<any[]>([]);
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const [rawLyrics, setRawLyrics] = useState<string | null>(null);
  const [colorMap, setColorMap] = useState<any>({});
  const [legend, setLegendState] = useState<any>({});
  const [showLegend, setShowLegend] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [editLines, setEditLines] = useState<{ time: number | null; text: string }[]>([]);
  const [textInput, setTextInput] = useState('');
  const [showTextEdit, setShowTextEdit] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncIdx, setSyncIdx] = useState(-1);
  const [saving, setSaving] = useState(false);
  const [showNewSet, setShowNewSet] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newLyricsText, setNewLyricsText] = useState('');
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);

  const song = currentSong;

  const fetchSets = useCallback(async () => {
    if (!song) return;
    setError(null);

    const memCached = lyricsMemCache.get(song.id);
    if (memCached && memCached.sets.length > 0) {
      setSets(memCached.sets);
      setLegendState(memCached.legend);
      setActiveSetId(prev => (prev && memCached.sets.find((x: any) => x.id === prev)) ? prev : memCached.sets[0].id);
      return;
    }

    if (!online) {
      const cached = await getCachedLyricSets(song.id);
      const cache = getOrCreateSongCache(song.id);
      if (cached && cached.length > 0) {
        setSets(cached);
        cache.sets = cached;
        setActiveSetId(prev => (prev && cached.find((x: any) => x.id === prev)) ? prev : cached[0].id);
      } else {
        setError('No lyrics available');
      }
      const leg = (await getCachedLegend(song.id)) || {};
      setLegendState(leg);
      cache.legend = leg;
      return;
    }

    try {
      const data = await getLyricSets(song.id);
      const s = data.sets || [];
      setSets(s);
      getOrCreateSongCache(song.id).sets = s;
      cacheLyricSets(song.id, s).catch(() => {});
      if (s.length > 0) {
        setActiveSetId(prev => (prev && s.find((x: any) => x.id === prev)) ? prev : s[0].id);
      } else {
        setActiveSetId(null);
        setRawLyrics(null);
        setError('No lyrics available');
      }
    } catch {
      const cached = await getCachedLyricSets(song.id);
      if (cached && cached.length > 0) {
        setSets(cached);
        getOrCreateSongCache(song.id).sets = cached;
        setActiveSetId(prev => (prev && cached.find((x: any) => x.id === prev)) ? prev : cached[0].id);
      } else {
        setError('No lyrics available');
      }
    }
    try {
      const leg = await getLegend(song.id);
      setLegendState(leg);
      getOrCreateSongCache(song.id).legend = leg;
      cacheLegendLocal(song.id, leg).catch(() => {});
    } catch {
      const leg = (await getCachedLegend(song.id)) || {};
      setLegendState(leg);
      getOrCreateSongCache(song.id).legend = leg;
    }
  }, [song?.id, online]);

  useEffect(() => { fetchSets(); }, [fetchSets]);

  useEffect(() => {
    if (!activeSetId || !song) return;

    const memCached = lyricsMemCache.get(song.id);
    if (memCached) {
      const cachedText = memCached.texts.get(activeSetId);
      if (cachedText !== undefined) {
        setRawLyrics(cachedText);
        setColorMap(memCached.colors.get(activeSetId) || {});
        return;
      }
    }

    setRawLyrics(null);
    setColorMap({});
    setError(null);
    const cache = getOrCreateSongCache(song.id);

    if (!online) {
      (async () => {
        const cachedText = await getCachedLyricText(song.id, activeSetId);
        setRawLyrics(cachedText);
        if (cachedText === null) setError('Lyrics not available offline');
        else cache.texts.set(activeSetId, cachedText);
        const c = (await getCachedColors(song.id, activeSetId)) || {};
        setColorMap(c);
        cache.colors.set(activeSetId, c);
      })();
      return;
    }

    (async () => {
      try {
        const data = await getLyricSetText(song.id, activeSetId);
        setRawLyrics(data.lyrics);
        cache.texts.set(activeSetId, data.lyrics);
        if (data.lyrics) cacheLyricText(song.id, activeSetId, data.lyrics).catch(() => {});
      } catch {
        const cached = await getCachedLyricText(song.id, activeSetId);
        setRawLyrics(cached);
        cache.texts.set(activeSetId, cached);
      }
    })();

    (async () => {
      try {
        const colors = await getSetColors(song.id, activeSetId);
        setColorMap(colors);
        cache.colors.set(activeSetId, colors);
        cacheColors(song.id, activeSetId, colors).catch(() => {});
      } catch {
        const c = (await getCachedColors(song.id, activeSetId)) || {};
        setColorMap(c);
        cache.colors.set(activeSetId, c);
      }
    })();
  }, [activeSetId, song?.id, online]);

  const parsed = useMemo(() => rawLyrics ? parseLrc(rawLyrics) : null, [rawLyrics]);

  const activeIdx = useMemo(() => {
    if (!parsed || !parsed.hasTimes || currentTime == null) return -1;
    let idx = -1;
    for (let i = 0; i < parsed.lines.length; i++) {
      const t = parsed.lines[i].time;
      if (t !== null && t <= currentTime) idx = i;
    }
    return idx;
  }, [parsed, currentTime]);

  useEffect(() => {
    if (mode !== 'view' || activeIdx < 0) return;
    lineRefs.current[activeIdx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeIdx, mode]);

  const handleStamp = useCallback(() => {
    if (!syncing || syncIdx < 0 || syncIdx >= editLines.length) return;
    const t = currentTime;
    setEditLines(prev => {
      const next = [...prev];
      next[syncIdx] = { ...next[syncIdx], time: t };
      return next;
    });
    let nextIdx = -1;
    for (let i = syncIdx + 1; i < editLines.length; i++) {
      if (editLines[i].time === null) { nextIdx = i; break; }
    }
    if (nextIdx === -1) { setSyncing(false); setSyncIdx(-1); }
    else { setSyncIdx(nextIdx); }
  }, [syncing, syncIdx, editLines, currentTime]);

  const buildLrc = () => editLines.map(l => (
    l.time !== null && l.time !== undefined ? `[${fmtTs(l.time)}]${l.text}` : l.text
  )).join('\n');

  const handleSave = async () => {
    if (!activeSetId || !song) return;
    if (!online) { alert('Connect to the server to save lyrics.'); return; }
    setSaving(true);
    try {
      const lrc = buildLrc();
      await updateLyricSet(song.id, activeSetId, { lyrics: lrc });
      await saveSetColors(song.id, activeSetId, colorMap);
      cacheLyricText(song.id, activeSetId, lrc).catch(() => {});
      lyricsMemCache.delete(song.id);
      setMode('view');
      fetchSets();
    } catch { }
    finally { setSaving(false); }
  };

  const handleCreateSet = async () => {
    if (!song) return;
    if (!online) { alert('Connect to the server to add lyrics.'); return; }
    const label = newLabel.trim() || 'Lyrics';
    const primarySet = sets.find((s: any) => s.position === 0);
    try {
      const result = await createLyricSet(song.id, label, newLyricsText, primarySet?.id || null);
      lyricsMemCache.delete(song.id);
      setShowNewSet(false);
      setNewLabel('');
      setNewLyricsText('');
      await fetchSets();
      setActiveSetId(result.id);
    } catch { }
  };

  const startEdit = () => {
    if (parsed) {
      setEditLines(parsed.lines.map(l => ({ ...l })));
      setTextInput(parsed.lines.map(l => l.text).join('\n'));
    }
    setMode('edit');
  };

  const applyTextEdit = () => {
    const newTexts = textInput.split('\n').filter(l => l.trim());
    setEditLines(prev => newTexts.map((text, i) => ({
      text,
      time: i < prev.length ? prev[i].time : null,
    })));
    setShowTextEdit(false);
  };

  if (!song) {
    return (
      <>
        <Header title="Lyrics" right={<button className="icon-btn" onClick={back}><IoClose size={24} /></button>} />
        <div className="muted center" style={{ marginTop: 40 }}>No song playing</div>
      </>
    );
  }

  if (showNewSet) {
    return (
      <>
        <Header title="New Lyric Set"
          right={<button className="icon-btn" onClick={() => setShowNewSet(false)}><IoClose size={24} /></button>} />
        <div className="modal-body" style={{ padding: 16 }}>
          <label className="label">Label</label>
          <input className="input" value={newLabel} onChange={e => setNewLabel(e.target.value)}
            placeholder="e.g. Romanized, Translated" />
          <label className="label" style={{ marginTop: 16 }}>Lyrics (one line per line)</label>
          <textarea className="textarea" value={newLyricsText} onChange={e => setNewLyricsText(e.target.value)}
            placeholder="Paste lyrics here..." rows={12} />
          <div className="edit-actions" style={{ marginTop: 16 }}>
            <button className="btn-primary" onClick={handleCreateSet} disabled={!newLyricsText.trim()}>Create Set</button>
          </div>
        </div>
      </>
    );
  }

  if (mode === 'edit') {
    return (
      <>
        <Header title="Editing Lyrics"
          right={<button className="icon-btn" onClick={() => setMode('view')}><IoClose size={24} /></button>} />
        {showTextEdit ? (
          <div className="modal-body" style={{ padding: 16 }}>
            <textarea className="textarea" value={textInput} onChange={e => setTextInput(e.target.value)} rows={14} />
            <div className="edit-actions" style={{ marginTop: 16 }}>
              <button className="btn-primary" onClick={applyTextEdit}>Apply Text</button>
              <button className="btn-ghost" onClick={() => setShowTextEdit(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="modal-body" style={{ padding: 16 }}>
            <div className="edit-actions">
              <button className="btn-ghost" onClick={() => {
                setTextInput(editLines.map(l => l.text).join('\n'));
                setShowTextEdit(true);
              }}>Edit Text</button>
              {!syncing && editLines.some(l => l.time === null) && (
                <button className="btn-primary" onClick={() => {
                  setSyncIdx(editLines.findIndex(l => l.time === null));
                  setSyncing(true);
                }}>Sync Timestamps</button>
              )}
              {syncing && (
                <>
                  <button className="btn-primary" onClick={handleStamp}>Stamp ({syncIdx + 1}/{editLines.length})</button>
                  <button className="btn-ghost" onClick={() => { setSyncing(false); setSyncIdx(-1); }}>Stop</button>
                </>
              )}
              <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
            {syncing && <div className="sync-hint">Tap "Stamp" when each line starts playing</div>}
            {editLines.map((line, i) => (
              <div key={i} className={`edit-line ${i === syncIdx && syncing ? 'active' : ''}`}>
                <span className="timestamp">{line.time !== null ? fmtTs(line.time) : '--:--.--'}</span>
                <span className={`edit-line-text ${line.time !== null ? 'set' : ''}`}>{line.text}</span>
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  const hasLegend = Object.keys(legend || {}).length > 0;

  return (
    <>
      <Header
        left={<button className="icon-btn" onClick={back} aria-label="Close"><IoChevronDown size={24} color="#fff" /></button>}
        title={<span style={{ fontSize: 14, fontWeight: 600 }}>{song.title} — Lyrics</span>}
        right={
          <div style={{ display: 'flex', gap: 12 }}>
            {hasLegend && (
              <button className="icon-btn" onClick={() => setShowLegend(!showLegend)} aria-label="Legend">
                <IoInformationCircle size={22} />
              </button>
            )}
            <button className="icon-btn" onClick={startEdit} aria-label="Edit"><IoCreate size={22} /></button>
          </div>
        }
      />

      {sets.length > 1 && (
        <div className="set-tabs">
          {sets.map((s: any) => (
            <button key={s.id} className={`set-tab ${s.id === activeSetId ? 'active' : ''}`} onClick={() => setActiveSetId(s.id)}>
              {s.label}
            </button>
          ))}
          <button className="set-tab add" onClick={() => setShowNewSet(true)}>+ New</button>
        </div>
      )}

      {showLegend && hasLegend && (
        <div className="legend-panel">
          <div className="legend-title">Singers</div>
          {Object.entries(legend).map(([color, name]) => (
            <div key={color} className="legend-entry">
              <div className="legend-swatch" style={{ backgroundColor: SINGER_COLORS[color] || color }} />
              <span>{name as string}</span>
            </div>
          ))}
        </div>
      )}

      <div className="modal-body">
        <div className="lyrics-content">
          {parsed && parsed.hasTimes ? (
            parsed.lines.map((line, i) => {
              const segments = buildColoredSegments(line.text, colorMap?.[String(i)]);
              const state = i === activeIdx ? 'active' : (i < activeIdx && line.time !== null ? 'past' : 'upcoming');
              return (
                <div key={i} ref={el => { lineRefs.current[i] = el; }}
                  className={`lyric-line ${state === 'active' ? 'active' : ''}`}
                  onClick={() => { if (line.time !== null) seek(line.time); }}>
                  {segments.map((seg, j) => (
                    <span key={j} style={{ color: getSegmentColor(seg.color, state) }}>{seg.text}</span>
                  ))}
                </div>
              );
            })
          ) : parsed && !parsed.hasTimes ? (
            <div className="plain-lyrics">{rawLyrics}</div>
          ) : error ? (
            <div style={{ marginTop: 40 }}>
              <div className="muted">{error}</div>
              {online && sets.length === 0 && (
                <button className="btn-ghost" style={{ marginTop: 12 }} onClick={() => setShowNewSet(true)}>Add Lyrics</button>
              )}
            </div>
          ) : (
            <div className="muted">Loading...</div>
          )}
        </div>
      </div>
    </>
  );
}
