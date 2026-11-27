import { kvGet, kvSet } from '../storage/db';

const SERVER_KEY = 'mp_server_url';
let _baseUrl = '';

export async function loadServerUrl(): Promise<string> {
  const url = await kvGet<string>(SERVER_KEY);
  _baseUrl = url || '';
  return _baseUrl;
}

export async function saveServerUrl(url: string): Promise<void> {
  _baseUrl = url.trim().replace(/\/+$/, '');
  await kvSet(SERVER_KEY, _baseUrl);
}

export function getBaseUrl(): string {
  return _baseUrl;
}

async function request(method: string, path: string, opts?: { body?: any; isFormData?: boolean }) {
  if (!_baseUrl) throw new Error('Server not configured');
  const controller = new AbortController();
  // Uploads can be large; everything else should fail fast when the server is unreachable.
  const timeout = setTimeout(() => controller.abort(), opts?.isFormData ? 120000 : 3000);

  const fetchOpts: RequestInit = { method, signal: controller.signal };

  if (opts?.body && opts.isFormData) {
    fetchOpts.body = opts.body;
  } else if (opts?.body) {
    fetchOpts.headers = { 'Content-Type': 'application/json' };
    fetchOpts.body = JSON.stringify(opts.body);
  }

  try {
    const res = await fetch(`${_baseUrl}${path}`, fetchOpts);
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const msg = data?.error || `Request failed (${res.status})`;
      throw new Error(msg);
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

// ---- Core ----

export async function ping() {
  return request('GET', '/ping');
}

export async function getSongs() {
  return request('GET', '/songs');
}

export async function createBlankSong(metadata: Record<string, string> = {}, cover?: File | null) {
  const form = new FormData();
  if (metadata.title) form.append('title', metadata.title);
  if (metadata.artist) form.append('artist', metadata.artist);
  if (metadata.album) form.append('album', metadata.album);
  if (cover) form.append('cover', cover, cover.name);
  return request('POST', '/songs/blank', { body: form, isFormData: true });
}

export async function uploadSong(file: File, metadata: Record<string, string> = {}, cover?: File | null) {
  const form = new FormData();
  form.append('file', file, file.name);
  if (metadata.title) form.append('title', metadata.title);
  if (metadata.artist) form.append('artist', metadata.artist);
  if (metadata.album) form.append('album', metadata.album);
  if (cover) form.append('cover', cover, cover.name);
  return request('POST', '/upload', { body: form, isFormData: true });
}

export async function reorderLibrary(songIds: string[]) {
  return request('PUT', '/songs/order', { body: { song_ids: songIds } });
}

export async function deleteSong(songId: string) {
  return request('DELETE', `/songs/${songId}`);
}

export function getDownloadUrl(songId: string): string {
  return `${_baseUrl}/download/${songId}`;
}

// ---- Cover images ----

export function getCoverUrl(songId: string): string {
  return `${_baseUrl}/covers/${songId}`;
}

export async function uploadCover(songId: string, image: File) {
  const form = new FormData();
  form.append('cover', image, image.name);
  return request('POST', `/songs/${songId}/cover`, { body: form, isFormData: true });
}

export async function deleteCoverFile(filename: string) {
  return request('DELETE', `/covers/file/${encodeURIComponent(filename)}`);
}

// ---- Artists ----

export async function getArtists() {
  return request('GET', '/artists');
}

export function getArtistImageUrl(name: string): string {
  return `${_baseUrl}/artist-image/${encodeURIComponent(name)}`;
}

export async function uploadArtistImage(name: string, image: File) {
  const form = new FormData();
  form.append('image', image, image.name);
  return request('POST', `/artists/${encodeURIComponent(name)}/image`, { body: form, isFormData: true });
}

// ---- Playlists ----

export async function getPlaylists() {
  return request('GET', '/playlists');
}

export async function createPlaylist(name: string) {
  return request('POST', '/playlists', { body: { name } });
}

export async function getPlaylist(playlistId: string) {
  return request('GET', `/playlists/${playlistId}`);
}

export async function updatePlaylist(playlistId: string, name: string) {
  return request('PUT', `/playlists/${playlistId}`, { body: { name } });
}

export async function deletePlaylist(playlistId: string) {
  return request('DELETE', `/playlists/${playlistId}`);
}

export async function addSongToPlaylist(playlistId: string, songId: string) {
  return request('POST', `/playlists/${playlistId}/songs`, { body: { song_id: songId } });
}

export async function removeSongFromPlaylist(playlistId: string, songId: string) {
  return request('DELETE', `/playlists/${playlistId}/songs/${songId}`);
}

export async function reorderPlaylistSongs(playlistId: string, songIds: string[]) {
  return request('PUT', `/playlists/${playlistId}/songs`, { body: { song_ids: songIds } });
}

// ---- Play logs ----

export async function syncLogs(logs: any[]) {
  return request('POST', '/sync', { body: { logs } });
}

// ---- Analytics ----

export async function getAnalytics() {
  return request('GET', '/analytics');
}

export async function getWrappedAnalytics(year: number) {
  return request('GET', `/analytics/wrapped?year=${year}`);
}

// ---- Lyrics ----

export async function getLyricSets(songId: string) {
  return request('GET', `/lyrics/${songId}`);
}

export async function getLyricSetText(songId: string, setId: string) {
  return request('GET', `/lyrics/${songId}/${setId}`);
}

export async function createLyricSet(songId: string, label: string, lyrics: string, autoSyncFrom?: string | null) {
  const body: any = { label, lyrics };
  if (autoSyncFrom) body.auto_sync_from = autoSyncFrom;
  return request('POST', `/lyrics/${songId}`, { body });
}

export async function updateLyricSet(songId: string, setId: string, data: { lyrics?: string; label?: string }) {
  const body: any = {};
  if (data.lyrics !== undefined) body.lyrics = data.lyrics;
  if (data.label !== undefined) body.label = data.label;
  return request('PUT', `/lyrics/${songId}/${setId}`, { body });
}

export async function deleteLyricSet(songId: string, setId: string) {
  return request('DELETE', `/lyrics/${songId}/${setId}`);
}

export async function getSetColors(songId: string, setId: string) {
  return request('GET', `/lyrics/${songId}/${setId}/colors`);
}

export async function saveSetColors(songId: string, setId: string, colorMap: any) {
  return request('PUT', `/lyrics/${songId}/${setId}/colors`, { body: colorMap });
}

export async function getLegend(songId: string) {
  return request('GET', `/lyrics/${songId}/legend`);
}

export async function saveLegend(songId: string, legend: any) {
  return request('PUT', `/lyrics/${songId}/legend`, { body: legend });
}

// ---- Download flag ----

export async function toggleDownload(songId: string, downloaded: boolean) {
  return request('PUT', `/songs/${songId}/download`, { body: { downloaded } });
}

export async function getPeriodAnalytics(type: string, key?: string) {
  const q = key ? `&key=${encodeURIComponent(key)}` : '';
  return request('GET', `/analytics/periods?type=${type}${q}`);
}

export async function getWrappedStatus() {
  return request('GET', '/wrapped/status');
}
