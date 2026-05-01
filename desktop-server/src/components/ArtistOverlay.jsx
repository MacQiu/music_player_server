import { useMemo, useRef, useState } from 'react';
import { uploadArtistImage } from '../api/client';

export default function ArtistOverlay({
  artistName, songs, artists, onClose,
  playSong, addToQueue, refreshArtists, imgVersion,
}) {
  const artist = artists.find(a => a.name === artistName);
  const artistSongs = useMemo(
    () => songs.filter(s => s.artist === artistName),
    [songs, artistName],
  );
  const imageInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadArtistImage(artistName, file);
      refreshArtists?.();
    } catch { /* ignore */ }
    finally { setUploading(false); }
    e.target.value = '';
  };

  const handlePlayAll = () => {
    if (artistSongs.length === 0) return;
    playSong(artistSongs[0], artistSongs);
  };

  const imgUrl = artist?.image_url
    ? `/api${artist.image_url}${imgVersion ? `?v=${imgVersion}` : ''}`
    : null;

  return (
    <div className="playlist-overlay">
      <input type="file" ref={imageInputRef} accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />
      <div className="playlist-overlay__header-bar">
        <button className="playlist-overlay__back" onClick={onClose}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6z"/></svg>
        </button>
      </div>

      <div className="playlist-overlay__hero">
        <div className="playlist-overlay__cover playlist-overlay__cover--round"
          onClick={() => imageInputRef.current?.click()}
          style={{ cursor: 'pointer' }} title={imgUrl ? 'Change artist image' : 'Add artist image'}>
          {imgUrl ? <img src={imgUrl} alt="" /> : <div className="playlist-overlay__cover-blank">🎤</div>}
          {uploading && <div className="playlist-overlay__cover-uploading">...</div>}
        </div>
        <div className="playlist-overlay__meta">
          <h2 className="playlist-overlay__name">{artistName}</h2>
          <div className="playlist-overlay__stats">
            {artistSongs.length} track{artistSongs.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      <div className="playlist-overlay__actions">
        <button className="btn btn--primary" onClick={handlePlayAll} disabled={artistSongs.length === 0}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          Play All
        </button>
      </div>

      <div className="playlist-overlay__songs">
        {artistSongs.map((song) => (
          <div key={song.id} className="playlist-overlay__song-row">
            <div className="playlist-overlay__song-cover" onClick={() => playSong(song, artistSongs)}>
              {song.cover_url
                ? <img src={`/api${song.cover_url}${imgVersion ? `?v=${imgVersion}` : ''}`} alt="" />
                : <span>♪</span>}
            </div>
            <div className="playlist-overlay__song-info" onClick={() => playSong(song, artistSongs)}>
              <div className="playlist-overlay__song-title">{song.title}</div>
              <div className="playlist-overlay__song-artist">{song.album || 'Unknown Album'}</div>
            </div>
            <button className="btn btn--sm btn--ghost" onClick={() => addToQueue(song)} title="Add to Queue">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18a3 3 0 103 3V8h3V6h-5z"/></svg>
            </button>
          </div>
        ))}
        {artistSongs.length === 0 && (
          <p className="muted" style={{ padding: '1rem', textAlign: 'center' }}>No songs by this artist</p>
        )}
      </div>
    </div>
  );
}
