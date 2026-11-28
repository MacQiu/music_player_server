import { getDb } from './db';

const k = {
  sets: (songId: string) => `${songId}:sets`,
  text: (songId: string, setId: string) => `${songId}:text:${setId}`,
  colors: (songId: string, setId: string) => `${songId}:colors:${setId}`,
  legend: (songId: string) => `${songId}:legend`,
};

async function put(key: string, value: any) {
  try { await (await getDb()).put('lyrics', value, key); } catch { }
}

async function get<T>(key: string): Promise<T | null> {
  try {
    const v = await (await getDb()).get('lyrics', key);
    return (v ?? null) as T | null;
  } catch { return null; }
}

export const cacheLyricSets = (songId: string, sets: any[]) => put(k.sets(songId), sets);
export const getCachedLyricSets = (songId: string) => get<any[]>(k.sets(songId));
export const cacheLyricText = (songId: string, setId: string, text: string) => put(k.text(songId, setId), text);
export const getCachedLyricText = (songId: string, setId: string) => get<string>(k.text(songId, setId));
export const cacheColors = (songId: string, setId: string, colorMap: any) => put(k.colors(songId, setId), colorMap);
export const getCachedColors = (songId: string, setId: string) => get<any>(k.colors(songId, setId));
export const cacheLegend = (songId: string, legend: any) => put(k.legend(songId), legend);
export const getCachedLegend = (songId: string) => get<any>(k.legend(songId));

export async function deleteLyricsForSong(songId: string): Promise<void> {
  try {
    await (await getDb()).delete('lyrics', IDBKeyRange.bound(`${songId}:`, `${songId}:\uffff`));
  } catch { }
}

export async function cacheAllLyricsForSong(songId: string, fetchFns: {
  getSets: () => Promise<any>;
  getText: (setId: string) => Promise<any>;
  getColors: (setId: string) => Promise<any>;
  getLegend: () => Promise<any>;
}): Promise<void> {
  try {
    const setsData = await fetchFns.getSets();
    const sets = setsData.sets || [];
    await cacheLyricSets(songId, sets);
    if (sets.length === 0) return;

    await Promise.all(sets.map(async (s: any) => {
      try {
        const textData = await fetchFns.getText(s.id);
        if (textData.lyrics) await cacheLyricText(songId, s.id, textData.lyrics);
      } catch { }
      try {
        const colors = await fetchFns.getColors(s.id);
        if (colors) await cacheColors(songId, s.id, colors);
      } catch { }
    }));

    try {
      const legend = await fetchFns.getLegend();
      if (legend) await cacheLegend(songId, legend);
    } catch { }
  } catch { }
}
