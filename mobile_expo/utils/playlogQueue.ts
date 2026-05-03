import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncLogs } from '../api/client';

const QUEUE_KEY = 'mp_playlog_queue';

interface PlaylogEntry {
  id: string;
  song_id: string;
  duration: number;
  timestamp: string;
}

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function getQueue(): Promise<PlaylogEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function saveQueue(queue: PlaylogEntry[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function enqueueLog(songId: string, duration: number, timestamp?: string): Promise<void> {
  const entry: PlaylogEntry = {
    id: generateId(),
    song_id: songId,
    duration,
    timestamp: timestamp || new Date().toISOString(),
  };
  const queue = await getQueue();
  queue.push(entry);
  await saveQueue(queue);
}

export async function flushQueue(): Promise<number> {
  const queue = await getQueue();
  if (queue.length === 0) return 0;

  const batch = queue.slice(0, 50);
  await syncLogs(batch);
  const remaining = queue.slice(batch.length);
  await saveQueue(remaining);
  return batch.length;
}

export async function flushAll(): Promise<void> {
  let flushed = 1;
  while (flushed > 0) {
    flushed = await flushQueue();
  }
}

export async function getQueueSize(): Promise<number> {
  const queue = await getQueue();
  return queue.length;
}
