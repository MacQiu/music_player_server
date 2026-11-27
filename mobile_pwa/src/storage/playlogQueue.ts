import { getDb, type PlaylogEntry } from './db';
import { syncLogs } from '../api/client';

function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function enqueueLog(songId: string, duration: number, timestamp?: string): Promise<void> {
  const entry: PlaylogEntry = {
    id: generateId(),
    song_id: songId,
    duration,
    timestamp: timestamp || new Date().toISOString(),
  };
  await (await getDb()).put('playlogs', entry);
}

async function flushQueue(): Promise<number> {
  const db = await getDb();
  const batch = (await db.getAll('playlogs')).slice(0, 50);
  if (batch.length === 0) return 0;
  await syncLogs(batch);
  const tx = db.transaction('playlogs', 'readwrite');
  await Promise.all([...batch.map(e => tx.store.delete(e.id)), tx.done]);
  return batch.length;
}

let flushing: Promise<void> | null = null;

export function flushAll(): Promise<void> {
  if (!flushing) {
    flushing = (async () => {
      let flushed = 1;
      while (flushed > 0) flushed = await flushQueue();
    })().finally(() => { flushing = null; });
  }
  return flushing;
}

export async function getQueueSize(): Promise<number> {
  try { return await (await getDb()).count('playlogs'); } catch { return 0; }
}
