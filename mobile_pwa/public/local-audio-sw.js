/* Serve downloaded songs from IndexedDB with byte ranges.
   iOS ignores seeks on blob: URLs, so playback uses this same-origin path. */
self.addEventListener('fetch', (event) => {
  const marker = '/local-audio/';
  const idx = new URL(event.request.url).pathname.indexOf(marker);
  if (idx === -1) return;
  const songId = decodeURIComponent(new URL(event.request.url).pathname.slice(idx + marker.length));
  event.respondWith(serveLocalAudio(songId, event.request));
});

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('spectrum');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function readAudio(db, songId) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('audio', 'readonly');
    const req = tx.objectStore('audio').get(songId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function serveLocalAudio(songId, request) {
  let db;
  try {
    db = await openDb();
    const rec = await readAudio(db, songId);
    if (!rec || !rec.blob) return new Response('not found', { status: 404 });
    const blob = rec.blob;
    const size = blob.size;
    const type = blob.type || 'audio/mpeg';
    const range = request.headers.get('range');
    if (!range) {
      return new Response(blob, {
        status: 200,
        headers: {
          'Content-Type': type,
          'Content-Length': String(size),
          'Accept-Ranges': 'bytes',
        },
      });
    }
    const match = /bytes=(\d+)-(\d*)/.exec(range);
    let start = match ? Number(match[1]) : 0;
    let end = match && match[2] ? Number(match[2]) : size - 1;
    if (start >= size) start = 0;
    if (end >= size) end = size - 1;
    const slice = blob.slice(start, end + 1, type);
    return new Response(slice, {
      status: 206,
      headers: {
        'Content-Type': type,
        'Content-Length': String(slice.size),
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
      },
    });
  } catch {
    return new Response('unavailable', { status: 503 });
  } finally {
    if (db) db.close();
  }
}
