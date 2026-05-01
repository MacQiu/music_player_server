import {
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  deleteAsync,
  writeAsStringAsync,
  readAsStringAsync,
} from 'expo-file-system/legacy';

const LYRICS_DIR = `${documentDirectory}lyrics/`;

async function ensureDir(dir: string) {
  const info = await getInfoAsync(dir);
  if (!info.exists) {
    await makeDirectoryAsync(dir, { intermediates: true });
  }
}

function songDir(songId: string): string {
  return `${LYRICS_DIR}${songId}/`;
}

export async function cacheLyricSets(songId: string, sets: any[]): Promise<void> {
  const dir = songDir(songId);
  await ensureDir(dir);
  await writeAsStringAsync(`${dir}sets.json`, JSON.stringify(sets));
}

export async function getCachedLyricSets(songId: string): Promise<any[] | null> {
  try {
    const path = `${songDir(songId)}sets.json`;
    const info = await getInfoAsync(path);
    if (!info.exists) return null;
    const raw = await readAsStringAsync(path);
    return JSON.parse(raw);
  } catch { return null; }
}

export async function cacheLyricText(songId: string, setId: string, text: string): Promise<void> {
  const dir = songDir(songId);
  await ensureDir(dir);
  await writeAsStringAsync(`${dir}text_${setId}.txt`, text);
}

export async function getCachedLyricText(songId: string, setId: string): Promise<string | null> {
  try {
    const path = `${songDir(songId)}text_${setId}.txt`;
    const info = await getInfoAsync(path);
    if (!info.exists) return null;
    return await readAsStringAsync(path);
  } catch { return null; }
}

export async function cacheColors(songId: string, setId: string, colorMap: any): Promise<void> {
  const dir = songDir(songId);
  await ensureDir(dir);
  await writeAsStringAsync(`${dir}colors_${setId}.json`, JSON.stringify(colorMap));
}

export async function getCachedColors(songId: string, setId: string): Promise<any | null> {
  try {
    const path = `${songDir(songId)}colors_${setId}.json`;
    const info = await getInfoAsync(path);
    if (!info.exists) return null;
    const raw = await readAsStringAsync(path);
    return JSON.parse(raw);
  } catch { return null; }
}

export async function cacheLegend(songId: string, legend: any): Promise<void> {
  const dir = songDir(songId);
  await ensureDir(dir);
  await writeAsStringAsync(`${dir}legend.json`, JSON.stringify(legend));
}

export async function getCachedLegend(songId: string): Promise<any | null> {
  try {
    const path = `${songDir(songId)}legend.json`;
    const info = await getInfoAsync(path);
    if (!info.exists) return null;
    const raw = await readAsStringAsync(path);
    return JSON.parse(raw);
  } catch { return null; }
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
    if (sets.length === 0) return;
    await cacheLyricSets(songId, sets);

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
