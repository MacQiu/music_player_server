const BASE = '/api';

async function request(method, path, { body, isFormData } = {}) {
  const opts = { method };

  if (body && isFormData) {
    opts.body = body;
  } else if (body) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const msg = data?.error || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

export async function ping() {
  return request('GET', '/ping');
}

export async function getSongs() {
  return request('GET', '/songs');
}

export async function uploadSong(file, metadata = {}) {
  const form = new FormData();
  form.append('file', file);
  if (metadata.title) form.append('title', metadata.title);
  if (metadata.artist) form.append('artist', metadata.artist);
  if (metadata.album) form.append('album', metadata.album);
  return request('POST', '/upload', { body: form, isFormData: true });
}

export async function deleteSong(songId) {
  return request('DELETE', `/songs/${songId}`);
}

export async function getDownloadUrl(songId) {
  return `${BASE}/download/${songId}`;
}

export async function postPlaylog(songId, duration) {
  return request('POST', '/playlog', {
    body: {
      song_id: songId,
      duration,
      timestamp: new Date().toISOString(),
    },
  });
}

export async function syncLogs(logs) {
  return request('POST', '/sync', { body: { logs } });
}

export async function getAnalytics() {
  return request('GET', '/analytics');
}

export async function getLyrics(songId) {
  return request('GET', `/lyrics/${songId}`);
}
