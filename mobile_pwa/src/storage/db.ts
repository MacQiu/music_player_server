import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface PlaylogEntry {
  id: string;
  song_id: string;
  duration: number;
  timestamp: string;
}

export interface AudioRecord {
  id: string;
  blob: Blob;
  size: number;
  savedAt: number;
}

export interface ImageRecord {
  key: string;
  blob: Blob;
  savedAt: number;
}

interface SpectrumDB extends DBSchema {
  kv: { key: string; value: any };
  audio: { key: string; value: AudioRecord };
  images: { key: string; value: ImageRecord };
  lyrics: { key: string; value: any };
  playlogs: { key: string; value: PlaylogEntry };
}

let dbPromise: Promise<IDBPDatabase<SpectrumDB>> | null = null;

export function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<SpectrumDB>('spectrum', 1, {
      upgrade(db) {
        db.createObjectStore('kv');
        db.createObjectStore('audio', { keyPath: 'id' });
        db.createObjectStore('images', { keyPath: 'key' });
        db.createObjectStore('lyrics');
        db.createObjectStore('playlogs', { keyPath: 'id' });
      },
    });
  }
  return dbPromise;
}

export async function kvGet<T>(key: string): Promise<T | null> {
  try {
    const v = await (await getDb()).get('kv', key);
    return (v ?? null) as T | null;
  } catch {
    return null;
  }
}

export async function kvSet(key: string, value: any): Promise<void> {
  try {
    await (await getDb()).put('kv', value, key);
  } catch { }
}

export async function kvDel(key: string): Promise<void> {
  try {
    await (await getDb()).delete('kv', key);
  } catch { }
}

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch { }
  return false;
}

export async function getStorageEstimate(): Promise<{ usage: number; quota: number; persisted: boolean } | null> {
  try {
    if (!navigator.storage?.estimate) return null;
    const est = await navigator.storage.estimate();
    const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
    return { usage: est.usage ?? 0, quota: est.quota ?? 0, persisted };
  } catch {
    return null;
  }
}
