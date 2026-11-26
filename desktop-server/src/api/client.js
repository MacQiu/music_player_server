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

// ---- Core ----

export async function ping() {
  return request('GET', '/ping');
}

export async function getSongs() {
  return request('GET', '/songs');
}

export async function uploadSong(file, metadata = {}, coverFile = null) {
  const form = new FormData();
  form.append('file', file);
  if (metadata.title) form.append('title', metadata.title);
  if (metadata.artist) form.append('artist', metadata.artist);
  if (metadata.album) form.append('album', metadata.album);
  if (coverFile) form.append('cover', coverFile);
  return request('POST', '/upload', { body: form, isFormData: true });
}

export async function attachSongAudio(songId, file) {
  const form = new FormData();
  form.append('file', file);
  return request('POST', `/songs/${songId}/audio`, { body: form, isFormData: true });
}

export async function createBlankSong(metadata = {}, coverFile = null) {
  const form = new FormData();
  if (metadata.title) form.append('title', metadata.title);
  if (metadata.artist) form.append('artist', metadata.artist);
  if (metadata.album) form.append('album', metadata.album);
  if (coverFile) form.append('cover', coverFile);
  return request('POST', '/songs/blank', { body: form, isFormData: true });
}

export async function reorderLibrary(songIds) {
  return request('PUT', '/songs/order', { body: { song_ids: songIds } });
}

export async function deleteSong(songId) {
  return request('DELETE', `/songs/${songId}`);
}

export async function getDownloadUrl(songId) {
  return `${BASE}/download/${songId}`;
}

// ---- Cover images ----

export function getCoverUrl(songId) {
  return `${BASE}/covers/${songId}`;
}

export async function uploadCover(songId, coverFile) {
  const form = new FormData();
  form.append('cover', coverFile);
  return request('POST', `/songs/${songId}/cover`, { body: form, isFormData: true });
}

export async function deleteCoverFile(filename) {
  return request('DELETE', `/covers/file/${encodeURIComponent(filename)}`);
}

// ---- Artists ----

export async function getArtists() {
  return request('GET', '/artists');
}

export function getArtistImageUrl(name) {
  return `${BASE}/artist-image/${encodeURIComponent(name)}`;
}

export async function uploadArtistImage(name, imageFile) {
  const form = new FormData();
  form.append('image', imageFile);
  return request('POST', `/artists/${encodeURIComponent(name)}/image`, { body: form, isFormData: true });
}

export async function updateArtistPosition(name, imagePosition) {
  return request('PUT', `/artists/${encodeURIComponent(name)}/position`, {
    body: { image_position: imagePosition },
  });
}

// ---- Playlists ----

export async function getPlaylists() {
  return request('GET', '/playlists');
}

export async function createPlaylist(name) {
  return request('POST', '/playlists', { body: { name } });
}

export async function getPlaylist(playlistId) {
  return request('GET', `/playlists/${playlistId}`);
}

export async function updatePlaylist(playlistId, name) {
  return request('PUT', `/playlists/${playlistId}`, { body: { name } });
}

export async function deletePlaylist(playlistId) {
  return request('DELETE', `/playlists/${playlistId}`);
}

export async function addSongToPlaylist(playlistId, songId) {
  return request('POST', `/playlists/${playlistId}/songs`, { body: { song_id: songId } });
}

export async function removeSongFromPlaylist(playlistId, songId) {
  return request('DELETE', `/playlists/${playlistId}/songs/${songId}`);
}

export async function reorderPlaylistSongs(playlistId, songIds) {
  return request('PUT', `/playlists/${playlistId}/songs`, { body: { song_ids: songIds } });
}

// ---- Play logs ----

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

// ---- Analytics ----

export async function getAnalytics() {
  return request('GET', '/analytics');
}

export async function getWrappedAnalytics(year) {
  return request('GET', `/analytics/wrapped?year=${year}`);
}

export async function getPeriodAnalytics(type, key) {
  const q = key ? `&key=${encodeURIComponent(key)}` : '';
  return request('GET', `/analytics/periods?type=${type}${q}`);
}

export async function getWrappedStatus() {
  return request('GET', '/wrapped/status');
}

export async function exportLibrary() {
  const res = await fetch(`${BASE}/admin/export`);
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || `Export failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'spectrum-library.zip';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function importLibrary(file) {
  const form = new FormData();
  form.append('file', file);
  return request('POST', '/admin/import', { body: form, isFormData: true });
}

// ---- Lyrics (multi-set) ----

export async function getLyricSets(songId) {
  return request('GET', `/lyrics/${songId}`);
}

export async function getLyricSetText(songId, setId) {
  return request('GET', `/lyrics/${songId}/${setId}`);
}

export async function createLyricSet(songId, label, lyrics, autoSyncFrom = null) {
  const body = { label, lyrics };
  if (autoSyncFrom) body.auto_sync_from = autoSyncFrom;
  return request('POST', `/lyrics/${songId}`, { body });
}

export async function updateLyricSet(songId, setId, { lyrics, label } = {}) {
  const body = {};
  if (lyrics !== undefined) body.lyrics = lyrics;
  if (label !== undefined) body.label = label;
  return request('PUT', `/lyrics/${songId}/${setId}`, { body });
}

export async function deleteLyricSet(songId, setId) {
  return request('DELETE', `/lyrics/${songId}/${setId}`);
}

export async function getSetColors(songId, setId) {
  return request('GET', `/lyrics/${songId}/${setId}/colors`);
}

export async function saveSetColors(songId, setId, colorMap) {
  return request('PUT', `/lyrics/${songId}/${setId}/colors`, { body: colorMap });
}

export async function getLegend(songId) {
  return request('GET', `/lyrics/${songId}/legend`);
}

export async function saveLegend(songId, legend) {
  return request('PUT', `/lyrics/${songId}/legend`, { body: legend });
}

// ---- Download flag ----

export async function toggleDownload(songId, downloaded) {
  return request('PUT', `/songs/${songId}/download`, { body: { downloaded } });
}

// ---- Wrapped ----

export async function createWrappedPlaylist(year) {
  return request('POST', `/wrapped/${year}/playlist`);
}

// ---- Dev tools ----

export async function generateTestPlaylogs(year, count = 200) {
  return request('POST', '/dev/generate-playlogs', { body: { year, count } });
}

export async function deleteTestPlaylogs(year) {
  return request('DELETE', '/dev/playlogs', { body: { year } });
}

export async function createEmptyPlaybackPlaylist(year, songIds) {
  return request('POST', '/dev/playback-playlist', { body: { year, song_ids: songIds } });
}
