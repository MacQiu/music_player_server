import {
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  deleteAsync,
  downloadAsync,
} from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDownloadUrl, getCoverUrl, getLyricSets, getLyricSetText, getSetColors, getLegend, getSongs } from '../api/client';
import { cacheAllLyricsForSong } from './lyricsCache';

const SONGS_DIR = `${documentDirectory}songs/`;
const COVERS_DIR = `${documentDirectory}covers/`;
const CACHE_SONGS = 'mp_cached_songs';

async function ensureDir(dir: string) {
  const info = await getInfoAsync(dir);
  if (!info.exists) {
    await makeDirectoryAsync(dir, { intermediates: true });
  }
}

function extFromPath(filePath?: string): string {
  if (!filePath) return '.mp3';
  const dot = filePath.lastIndexOf('.');
  return dot >= 0 ? filePath.substring(dot) : '.mp3';
}

// ---- Songs ----

export function getLocalSongPath(songId: string, filePath?: string): string {
  return `${SONGS_DIR}${songId}${extFromPath(filePath)}`;
}

export async function isSongDownloaded(songId: string, filePath?: string): Promise<boolean> {
  const path = getLocalSongPath(songId, filePath);
  const info = await getInfoAsync(path);
  return info.exists;
}

export async function downloadSong(songId: string, filePath?: string, coverUrl?: string): Promise<string> {
  await ensureDir(SONGS_DIR);
  const localPath = getLocalSongPath(songId, filePath);
  const remoteUrl = getDownloadUrl(songId);
  const result = await downloadAsync(remoteUrl, localPath);

  if (coverUrl) {
    await downloadCover(songId).catch(() => {});
  }

  // Pre-cache lyrics data for offline use
  await cacheAllLyricsForSong(songId, {
    getSets: () => getLyricSets(songId),
    getText: (setId: string) => getLyricSetText(songId, setId),
    getColors: (setId: string) => getSetColors(songId, setId),
    getLegend: () => getLegend(songId),
  }).catch(() => {});

  return result.uri;
}

export async function deleteSongLocal(songId: string, filePath?: string): Promise<void> {
  const path = getLocalSongPath(songId, filePath);
  const info = await getInfoAsync(path);
  if (info.exists) {
    await deleteAsync(path, { idempotent: true });
  }
  await deleteCoverLocal(songId).catch(() => {});
}

export async function getPlayableUri(songId: string, filePath?: string): Promise<string> {
  const localPath = getLocalSongPath(songId, filePath);
  const info = await getInfoAsync(localPath);
  if (info.exists) {
    return localPath;
  }
  return getDownloadUrl(songId);
}

// ---- Cover images ----

function getLocalCoverPath(songId: string): string {
  return `${COVERS_DIR}${songId}.jpg`;
}

export async function downloadCover(songId: string): Promise<string> {
  await ensureDir(COVERS_DIR);
  const localPath = getLocalCoverPath(songId);
  const remoteUrl = getCoverUrl(songId);
  const result = await downloadAsync(remoteUrl, localPath);
  return result.uri;
}

export async function deleteCoverLocal(songId: string): Promise<void> {
  const path = getLocalCoverPath(songId);
  const info = await getInfoAsync(path);
  if (info.exists) {
    await deleteAsync(path, { idempotent: true });
  }
}

export async function getLocalCoverUri(songId: string): Promise<string | null> {
  const localPath = getLocalCoverPath(songId);
  const info = await getInfoAsync(localPath);
  if (info.exists) {
    return localPath;
  }
  return null;
}

// ---- Generic image cache ----

const IMAGES_DIR = `${documentDirectory}images/`;

function sanitizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export async function downloadImageByKey(key: string, remoteUrl: string): Promise<string> {
  await ensureDir(IMAGES_DIR);
  const localPath = `${IMAGES_DIR}${sanitizeKey(key)}.jpg`;
  const result = await downloadAsync(remoteUrl, localPath);
  return result.uri;
}

export async function getLocalImageUri(key: string): Promise<string | null> {
  const localPath = `${IMAGES_DIR}${sanitizeKey(key)}.jpg`;
  const info = await getInfoAsync(localPath);
  return info.exists ? localPath : null;
}

// ---- Sync downloaded songs ----

export async function syncDownloadedSongs(): Promise<void> {
  let songs: any[];
  try {
    const raw = await AsyncStorage.getItem(CACHE_SONGS);
    songs = raw ? JSON.parse(raw) : [];
  } catch { return; }

  const downloaded = songs.filter((s: any) => s.downloaded);
  if (downloaded.length === 0) return;

  await Promise.all(downloaded.map(async (song: any) => {
    // Re-cache cover
    await downloadCover(song.id).catch(() => {});
    // Re-cache lyrics
    await cacheAllLyricsForSong(song.id, {
      getSets: () => getLyricSets(song.id),
      getText: (setId: string) => getLyricSetText(song.id, setId),
      getColors: (setId: string) => getSetColors(song.id, setId),
      getLegend: () => getLegend(song.id),
    }).catch(() => {});
  }));
}
