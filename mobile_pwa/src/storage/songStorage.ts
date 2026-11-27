import { getDb } from './db';
import {
  getBaseUrl, getDownloadUrl, getCoverUrl,
  getLyricSets, getLyricSetText, getSetColors, getLegend,
} from '../api/client';
import { cacheAllLyricsForSong, deleteLyricsForSong } from './lyricsCache';

// ---- Downloaded song registry (kept in memory so the UI can check synchronously) ----

const downloadedIds = new Set<string>();
const listeners = new Set<() => void>();
let initPromise: Promise<void> | null = null;

function notify() {
  listeners.forEach(fn => fn());
}

export function initSongStorage(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      try {
        const keys = await (await getDb()).getAllKeys('audio');
        keys.forEach(k => downloadedIds.add(String(k)));
      } catch { }
      notify();
    })();
  }
  return initPromise;
}

export function getDownloadedIds(): ReadonlySet<string> {
  return downloadedIds;
}

export function isSongDownloaded(songId: string): boolean {
  return downloadedIds.has(songId);
}

export function subscribeDownloads(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// ---- Songs ----

export async function downloadSong(
  songId: string,
  coverUrl?: string | null,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const res = await fetch(getDownloadUrl(songId));
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);

  const total = Number(res.headers.get('Content-Length')) || 0;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total && onProgress) onProgress(received / total);
  }
  const type = res.headers.get('Content-Type') || 'audio/mpeg';
  const blob = new Blob(chunks as BlobPart[], { type });

  await (await getDb()).put('audio', { id: songId, blob, size: blob.size, savedAt: Date.now() });
  downloadedIds.add(songId);
  notify();

  if (coverUrl) {
    await fetchImage(`cover_${songId}`, getCoverUrl(songId)).catch(() => {});
  }
  await cacheLyrics(songId);
}

async function cacheLyrics(songId: string) {
  await cacheAllLyricsForSong(songId, {
    getSets: () => getLyricSets(songId),
    getText: (setId: string) => getLyricSetText(songId, setId),
    getColors: (setId: string) => getSetColors(songId, setId),
    getLegend: () => getLegend(songId),
  }).catch(() => {});
}

export async function deleteSongLocal(songId: string): Promise<void> {
  await (await getDb()).delete('audio', songId);
  await deleteLyricsForSong(songId);
  downloadedIds.delete(songId);
  notify();
}

export async function getAudioBlob(songId: string): Promise<Blob | null> {
  try {
    const rec = await (await getDb()).get('audio', songId);
    return rec?.blob ?? null;
  } catch { return null; }
}

function localAudioUrl(songId: string): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base}local-audio/${encodeURIComponent(songId)}`;
}

/** Returns a playable URL: a seekable local path when the service worker can serve
 *  the download, a blob URL otherwise, or the server stream when it is not downloaded. */
export async function getPlayableUri(songId: string): Promise<{ uri: string; local: boolean } | null> {
  const blob = await getAudioBlob(songId);
  if (blob) {
    if (navigator.serviceWorker?.controller) {
      return { uri: localAudioUrl(songId), local: false };
    }
    return { uri: URL.createObjectURL(blob), local: true };
  }
  if (getBaseUrl()) return { uri: getDownloadUrl(songId), local: false };
  return null;
}

export async function getDownloadedBytes(): Promise<number> {
  try {
    const all = await (await getDb()).getAll('audio');
    return all.reduce((acc, r) => acc + (r.size || 0), 0);
  } catch { return 0; }
}

// ---- Image cache (covers, artist images, playlist covers) ----

const objectUrls = new Map<string, string>();
const fetchedVersion = new Map<string, number>();
const inflight = new Map<string, Promise<string | null>>();

/** Pick a stable cache key: prefer the server path so playlist covers share the song cover entry. */
export function imageKeyFor(coverUrl?: string | null, songId?: string, cacheKey?: string): string | null {
  if (songId) return `cover_${songId}`;
  if (coverUrl) {
    const m = coverUrl.match(/^\/covers\/([^/?]+)/);
    if (m) return `cover_${m[1]}`;
    const a = coverUrl.match(/^\/artist-image\/([^?]+)/);
    if (a) return `artist_${decodeURIComponent(a[1])}`;
  }
  return cacheKey || null;
}

export function getMemImageUrl(key: string): string | null {
  return objectUrls.get(key) ?? null;
}

// Superseded URLs are not revoked: other mounted images may still be displaying them.
function setObjectUrl(key: string, blob: Blob): string {
  const url = URL.createObjectURL(blob);
  objectUrls.set(key, url);
  return url;
}

const localInflight = new Map<string, Promise<string | null>>();

export function getLocalImageUrl(key: string): Promise<string | null> {
  const mem = objectUrls.get(key);
  if (mem) return Promise.resolve(mem);
  const existing = localInflight.get(key);
  if (existing) return existing;
  const p = (async () => {
    try {
      const rec = await (await getDb()).get('images', key);
      if (!rec) return null;
      return objectUrls.get(key) ?? setObjectUrl(key, rec.blob);
    } catch {
      return null;
    } finally {
      localInflight.delete(key);
    }
  })();
  localInflight.set(key, p);
  return p;
}

export function needsImageRefresh(key: string, version: number): boolean {
  return fetchedVersion.get(key) !== version;
}

/** Fetch an image from the server, persist it, and return a blob URL. */
export function fetchImage(key: string, remoteUrl: string, version = 0): Promise<string | null> {
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = (async () => {
    try {
      const url = version ? `${remoteUrl}${remoteUrl.includes('?') ? '&' : '?'}v=${version}` : remoteUrl;
      const res = await fetch(url);
      if (!res.ok) return null;
      const blob = await res.blob();
      if (!blob.type.startsWith('image/')) return null;
      await (await getDb()).put('images', { key, blob, savedAt: Date.now() });
      fetchedVersion.set(key, version);
      return setObjectUrl(key, blob);
    } catch {
      return null;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

// ---- Sync downloaded songs ----

export async function syncDownloadedSongs(songs: { id: string; cover_url?: string | null }[]): Promise<void> {
  await initSongStorage();
  const downloaded = songs.filter(s => downloadedIds.has(s.id));
  for (const song of downloaded) {
    if (song.cover_url) await fetchImage(`cover_${song.id}`, getCoverUrl(song.id)).catch(() => {});
    await cacheLyrics(song.id);
  }
}
