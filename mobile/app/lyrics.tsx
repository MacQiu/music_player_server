import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, StyleSheet, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { usePlayer } from '../contexts/PlayerContext';
import { useData } from '../contexts/DataContext';
import {
  getLyricSets, getLyricSetText, getLegend, getSetColors,
  createLyricSet, updateLyricSet, deleteLyricSet,
  saveLegend, saveSetColors,
} from '../api/client';
import {
  cacheLyricSets, getCachedLyricSets,
  cacheLyricText, getCachedLyricText,
  cacheColors, getCachedColors,
  cacheLegend as cacheLegendLocal, getCachedLegend,
} from '../utils/lyricsCache';
import { SINGER_COLORS, COLOR_NAMES } from '../constants/colors';
import { Colors, Spacing, FontSize, Radius } from '../constants/theme';

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
  const router = useRouter();
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
  const scrollRef = useRef<ScrollView>(null);

  const song = currentSong;

  const fetchSets = useCallback(async () => {
    if (!song) return;
    setError(null);

    // Check module-level cache first
    const memCached = lyricsMemCache.get(song.id);
    if (memCached && memCached.sets.length > 0) {
      setSets(memCached.sets);
      setLegendState(memCached.legend);
      if (memCached.sets.length > 0) {
        setActiveSetId(prev => (prev && memCached.sets.find((x: any) => x.id === prev)) ? prev : memCached.sets[0].id);
      }
      return;
    }

    if (!online) {
      // Offline: go straight to filesystem cache, skip server entirely
      const cached = await getCachedLyricSets(song.id);
      if (cached && cached.length > 0) {
        setSets(cached);
        const cache = getOrCreateSongCache(song.id);
        cache.sets = cached;
        setActiveSetId(prev => (prev && cached.find((x: any) => x.id === prev)) ? prev : cached[0].id);
      } else {
        setError('No lyrics available');
      }
      const cachedLeg = await getCachedLegend(song.id);
      const leg = cachedLeg || {};
      setLegendState(leg);
      const cache = getOrCreateSongCache(song.id);
      cache.legend = leg;
      return;
    }

    try {
      const data = await getLyricSets(song.id);
      const s = data.sets || [];
      setSets(s);
      const cache = getOrCreateSongCache(song.id);
      cache.sets = s;
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
        const cache = getOrCreateSongCache(song.id);
        cache.sets = cached;
        setActiveSetId(prev => (prev && cached.find((x: any) => x.id === prev)) ? prev : cached[0].id);
      } else {
        setError('No lyrics available');
      }
    }
    try {
      const leg = await getLegend(song.id);
      setLegendState(leg);
      const cache = getOrCreateSongCache(song.id);
      cache.legend = leg;
      cacheLegendLocal(song.id, leg).catch(() => {});
    } catch {
      const cached = await getCachedLegend(song.id);
      const leg = cached || {};
      setLegendState(leg);
      const cache = getOrCreateSongCache(song.id);
      cache.legend = leg;
    }
  }, [song?.id, online]);

  useEffect(() => { fetchSets(); }, [fetchSets]);

  useEffect(() => {
    if (!activeSetId || !song) return;

    // Check module-level cache for this set's text/colors
    const memCached = lyricsMemCache.get(song.id);
    if (memCached) {
      const cachedText = memCached.texts.get(activeSetId);
      const cachedColors = memCached.colors.get(activeSetId);
      if (cachedText !== undefined) {
        setRawLyrics(cachedText);
        setColorMap(cachedColors || {});
        return;
      }
    }

    setRawLyrics(null);
    setColorMap({});

    if (!online) {
      // Offline: go straight to filesystem cache
      (async () => {
        const cache = getOrCreateSongCache(song.id);
        const cachedText = await getCachedLyricText(song.id, activeSetId);
        setRawLyrics(cachedText);
        cache.texts.set(activeSetId, cachedText);
        const cachedColors = await getCachedColors(song.id, activeSetId);
        const c = cachedColors || {};
        setColorMap(c);
        cache.colors.set(activeSetId, c);
      })();
      return;
    }

    (async () => {
      const cache = getOrCreateSongCache(song.id);
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
      const cache = getOrCreateSongCache(song.id);
      try {
        const colors = await getSetColors(song.id, activeSetId);
        setColorMap(colors);
        cache.colors.set(activeSetId, colors);
        cacheColors(song.id, activeSetId, colors).catch(() => {});
      } catch {
        const cached = await getCachedColors(song.id, activeSetId);
        const c = cached || {};
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
      if (parsed.lines[i].time !== null && parsed.lines[i].time! <= currentTime) idx = i;
    }
    return idx;
  }, [parsed, currentTime]);

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

  const buildLrc = () => {
    return editLines.map(l => {
      if (l.time !== null && l.time !== undefined) return `[${fmtTs(l.time)}]${l.text}`;
      return l.text;
    }).join('\n');
  };

  const handleSave = async () => {
    if (!activeSetId || !song) return;
    setSaving(true);
    try {
      await updateLyricSet(song.id, activeSetId, { lyrics: buildLrc() });
      await saveSetColors(song.id, activeSetId, colorMap);
      // Invalidate module cache for this song so next open re-fetches
      lyricsMemCache.delete(song.id);
      setMode('view');
      fetchSets();
    } catch { }
    finally { setSaving(false); }
  };

  const handleCreateSet = async () => {
    if (!song) return;
    const label = newLabel.trim() || 'Lyrics';
    const primarySet = sets.find((s: any) => s.position === 0);
    try {
      const result = await createLyricSet(song.id, label, newLyricsText, primarySet?.id || null);
      lyricsMemCache.delete(song.id);
      setShowNewSet(false);
      setNewLabel('');
      setNewLyricsText('');
      fetchSets();
      setActiveSetId(result.id);
    } catch { }
  };

  const handleDeleteSet = async (setId: string) => {
    if (!song) return;
    try {
      await deleteLyricSet(song.id, setId);
      lyricsMemCache.delete(song.id);
      if (activeSetId === setId) setActiveSetId(null);
      fetchSets();
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
      <SafeAreaView style={styles.safeArea}>
        <Text style={styles.muted}>No song playing</Text>
      </SafeAreaView>
    );
  }

  // New set creation view
  if (showNewSet) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>New Lyric Set</Text>
          <TouchableOpacity onPress={() => setShowNewSet(false)}>
            <Ionicons name="close" size={24} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.body} contentContainerStyle={{ padding: Spacing.lg }}>
          <Text style={styles.label}>Label</Text>
          <TextInput style={styles.input} value={newLabel} onChangeText={setNewLabel}
            placeholder="e.g. Romanized, Translated" placeholderTextColor={Colors.textMuted} />
          <Text style={[styles.label, { marginTop: Spacing.lg }]}>Lyrics (one line per line)</Text>
          <TextInput style={styles.textarea} value={newLyricsText} onChangeText={setNewLyricsText}
            placeholder="Paste lyrics here..." placeholderTextColor={Colors.textMuted}
            multiline numberOfLines={12} textAlignVertical="top" />
          <View style={styles.editActions}>
            <TouchableOpacity style={styles.primaryBtn} onPress={handleCreateSet}
              disabled={!newLyricsText.trim()}>
              <Text style={styles.primaryBtnText}>Create Set</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Editor mode
  if (mode === 'edit') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.headerTitle} numberOfLines={1}>Editing Lyrics</Text>
          <TouchableOpacity onPress={() => setMode('view')}>
            <Ionicons name="close" size={24} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        {showTextEdit ? (
          <ScrollView style={styles.body} contentContainerStyle={{ padding: Spacing.lg }}>
            <TextInput style={styles.textarea} value={textInput} onChangeText={setTextInput}
              multiline numberOfLines={14} textAlignVertical="top" />
            <View style={styles.editActions}>
              <TouchableOpacity style={styles.primaryBtn} onPress={applyTextEdit}>
                <Text style={styles.primaryBtnText}>Apply Text</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowTextEdit(false)}>
                <Text style={styles.ghostText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        ) : (
          <ScrollView style={styles.body} contentContainerStyle={{ padding: Spacing.lg }}>
            <View style={styles.editActions}>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => {
                setTextInput(editLines.map(l => l.text).join('\n'));
                setShowTextEdit(true);
              }}>
                <Text style={styles.ghostText}>Edit Text</Text>
              </TouchableOpacity>
              {!syncing && editLines.some(l => l.time === null) && (
                <TouchableOpacity style={styles.primaryBtn} onPress={() => {
                  const idx = editLines.findIndex(l => l.time === null);
                  setSyncIdx(idx);
                  setSyncing(true);
                }}>
                  <Text style={styles.primaryBtnText}>Sync Timestamps</Text>
                </TouchableOpacity>
              )}
              {syncing && (
                <>
                  <TouchableOpacity style={styles.primaryBtn} onPress={handleStamp}>
                    <Text style={styles.primaryBtnText}>Stamp ({syncIdx + 1}/{editLines.length})</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setSyncing(false); setSyncIdx(-1); }}>
                    <Text style={styles.ghostText}>Stop</Text>
                  </TouchableOpacity>
                </>
              )}
              <TouchableOpacity style={styles.primaryBtn} onPress={handleSave} disabled={saving}>
                <Text style={styles.primaryBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
            {syncing && (
              <Text style={styles.syncHint}>Tap "Stamp" when each line starts playing</Text>
            )}
            {editLines.map((line, i) => (
              <View key={i} style={[styles.editLine, i === syncIdx && syncing && styles.editLineActive]}>
                <Text style={[styles.timestamp, line.time !== null && styles.timestampSet]}>
                  {line.time !== null ? fmtTs(line.time) : '--:--.--'}
                </Text>
                <Text style={[styles.editLineText, line.time !== null && styles.editLineTextSet]}>
                  {line.text}
                </Text>
              </View>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    );
  }

  // View mode
  const hasLegend = Object.keys(legend).length > 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-down" size={24} color={Colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{song.title} — Lyrics</Text>
        <View style={styles.headerActions}>
          {hasLegend && (
            <TouchableOpacity onPress={() => setShowLegend(!showLegend)}>
              <Ionicons name="information-circle" size={22} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={startEdit}>
            <Ionicons name="create" size={22} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      {sets.length > 1 && (
        <ScrollView horizontal style={styles.setTabs} showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: Spacing.sm, paddingHorizontal: Spacing.lg }}>
          {sets.map((s: any) => (
            <TouchableOpacity key={s.id}
              style={[styles.setTab, s.id === activeSetId && styles.setTabActive]}
              onPress={() => setActiveSetId(s.id)}>
              <Text style={[styles.setTabText, s.id === activeSetId && styles.setTabTextActive]}>{s.label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={[styles.setTab, styles.setTabAdd]} onPress={() => setShowNewSet(true)}>
            <Text style={styles.setTabText}>+ New</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {showLegend && hasLegend && (
        <View style={styles.legendPanel}>
          <Text style={styles.legendTitle}>Singers</Text>
          {Object.entries(legend).map(([color, name]) => (
            <View key={color} style={styles.legendEntry}>
              <View style={[styles.legendSwatch, { backgroundColor: SINGER_COLORS[color] || color }]} />
              <Text style={styles.legendName}>{name as string}</Text>
            </View>
          ))}
        </View>
      )}

      <ScrollView ref={scrollRef} style={styles.body} contentContainerStyle={styles.lyricsContent}>
        {parsed && parsed.hasTimes ? (
          parsed.lines.map((line, i) => {
            const entry = colorMap[String(i)];
            const segments = buildColoredSegments(line.text, entry);
            const state = i === activeIdx ? 'active' : (i < activeIdx && line.time !== null ? 'past' : 'upcoming');
            return (
              <TouchableOpacity key={i}
                style={[styles.lyricLine, state === 'active' && styles.lyricLineActive]}
                onPress={() => { if (line.time !== null) seek(line.time); }}>
                <Text style={styles.lyricLineTextWrap}>
                  {segments.map((seg, j) => (
                    <Text key={j} style={{ color: getSegmentColor(seg.color, state),
                      fontSize: state === 'active' ? 20 : 16,
                      fontFamily: state === 'active' ? 'Nunito_700Bold' : 'Nunito_400Regular' }}>
                      {seg.text}
                    </Text>
                  ))}
                </Text>
              </TouchableOpacity>
            );
          })
        ) : parsed && !parsed.hasTimes ? (
          <Text style={styles.plainLyrics}>{rawLyrics}</Text>
        ) : error && sets.length === 0 ? (
          <View style={{ alignItems: 'center', marginTop: 40 }}>
            <Text style={styles.muted}>{error}</Text>
            <TouchableOpacity style={[styles.ghostBtn, { marginTop: Spacing.md }]} onPress={() => { setShowNewSet(true); }}>
              <Text style={styles.ghostText}>Add Lyrics</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.muted}>Loading...</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)', gap: Spacing.md,
  },
  headerTitle: { flex: 1, fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  headerActions: { flexDirection: 'row', gap: Spacing.md },
  setTabs: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)', paddingVertical: Spacing.sm },
  setTab: {
    backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 0, borderColor: 'transparent',
    borderRadius: Radius.round, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xs + 2,
  },
  setTabActive: { backgroundColor: Colors.accent },
  setTabAdd: { borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.textMuted },
  setTabText: { color: Colors.text, fontSize: FontSize.sm },
  setTabTextActive: { color: '#000', fontWeight: '700' },
  legendPanel: {
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  legendTitle: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: Spacing.sm },
  legendEntry: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xs },
  legendSwatch: { width: 14, height: 14, borderRadius: 3 },
  legendName: { fontSize: FontSize.sm, color: Colors.text },
  body: { flex: 1 },
  lyricsContent: { padding: Spacing.xl, paddingBottom: 80, alignItems: 'center' },
  lyricLine: { paddingVertical: Spacing.xs, width: '100%' },
  lyricLineActive: {},
  lyricLineTextWrap: { textAlign: 'center', lineHeight: 32, fontFamily: 'Nunito_400Regular' },
  plainLyrics: {
    color: Colors.text, fontSize: FontSize.lg, lineHeight: 32,
    textAlign: 'center', fontFamily: 'Nunito_400Regular',
  },
  muted: { color: Colors.textMuted, fontSize: FontSize.sm, textAlign: 'center' },
  label: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: Spacing.xs },
  input: {
    backgroundColor: Colors.surface2, borderWidth: 0, borderColor: 'transparent',
    borderRadius: Radius.sm, color: Colors.text, padding: Spacing.md, fontSize: FontSize.md,
  },
  textarea: {
    backgroundColor: Colors.surface2, borderWidth: 0, borderColor: 'transparent',
    borderRadius: Radius.sm, color: Colors.text, padding: Spacing.md,
    fontSize: FontSize.md, minHeight: 200,
  },
  editActions: {
    flexDirection: 'row', gap: Spacing.md, flexWrap: 'wrap',
    alignItems: 'center', marginBottom: Spacing.lg,
  },
  primaryBtn: {
    backgroundColor: Colors.accent, borderRadius: Radius.round,
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm,
  },
  primaryBtnText: { color: '#000', fontSize: FontSize.sm, fontWeight: '700' },
  ghostBtn: { padding: Spacing.sm },
  ghostText: { color: Colors.textMuted, fontSize: FontSize.sm },
  syncHint: { color: Colors.textMuted, fontSize: FontSize.sm, marginBottom: Spacing.md },
  editLine: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm, borderRadius: Radius.sm, gap: Spacing.md,
  },
  editLineActive: { backgroundColor: Colors.surface3 },
  timestamp: { fontFamily: 'monospace' as any, fontSize: 11, color: Colors.accent, minWidth: 70 },
  timestampSet: { color: Colors.accent },
  editLineText: { flex: 1, fontSize: FontSize.md, color: Colors.textMuted },
  editLineTextSet: { color: Colors.text },
});
