import { useMemo, useRef, useState } from 'react';
import { uploadArtistImage } from '../api/client';
import SongView from './SongView';
import GridCard, { SectionHeader } from './GridCard';

export default function ArtistView({
  artistName, onBack, songs, artists, playSong, addToQueue,
  currentSong, refreshArtists, onOpenPlaylist,
  imgVersion, bumpImgVersion,
}) {
  const artist = artists.find(a => a.name === artistName);
  const artistSongs = useMemo(() => songs.filter(s => s.artist === artistName), [songs, artistName]);
  const imageInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const iv = imgVersion ? `?v=${imgVersion}` : '';

  const albumGroups = useMemo(() => {
    const map = {};
    artistSongs.forEach(s => {
      const album = s.album || 'Unknown Album';
      if (!map[album]) map[album] = { name: album, songs: [], cover: null };
      map[album].songs.push(s);
      if (!map[album].cover && s.cover_url) map[album].cover = s.cover_url;
    });
    return Object.values(map);
  }, [artistSongs]);

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadArtistImage(artistName, file);
      refreshArtists?.();
      bumpImgVersion?.();
    } catch { /* ignore */ }
    finally { setUploading(false); }
    e.target.value = '';
  };

  const handlePlayAll = () => {
    if (artistSongs.length === 0) return;
    playSong(artistSongs[0], artistSongs);
  };

  const imgUrl = artist?.image_url
    ? `/api${artist.image_url}${iv}`
    : null;

  const displaySongs = showAll ? artistSongs : artistSongs.slice(0, 5);

  return (
    <div className="av">
      <input type="file" ref={imageInputRef} accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />

      <div className="av__hero" style={imgUrl ? { backgroundImage: `url(${imgUrl})` } : {}}>
        <div className="av__hero-overlay" />
        <button className="av__back" onClick={onBack}>
          <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6z"/></svg>
        </button>
        <div className="av__hero-bottom">
          <h1 className="av__artist-name">{artistName}</h1>
          <div className="av__artist-stats">{artistSongs.length} song{artistSongs.length !== 1 ? 's' : ''}</div>
        </div>

        <div className="av__hero-actions">
          <button className="av__hero-edit" onClick={() => imageInputRef.current?.click()} title="Change artist image">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.001 1.001 0 000-1.41l-2.34-2.34a1.001 1.001 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
            {uploading && <span className="av__uploading">...</span>}
          </button>
        </div>
      </div>

      <div className="av__content">
        <div className="av__controls">
          <button className="pv__play-circle pv__play-circle--large" onClick={handlePlayAll} disabled={artistSongs.length === 0}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="#000"><path d="M8 5v14l11-7z"/></svg>
          </button>
        </div>

        <section className="av__section">
          <SectionHeader title="Popular" />
          <div className="av__tracks">
            {displaySongs.map((song, idx) => (
              <SongView
                key={song.id}
                song={song}
                index={idx}
                isActive={currentSong?.id === song.id}
                onPlay={() => playSong(song, artistSongs)}
                onDoubleClick={() => playSong(song, artistSongs)}
                showArtist={false}
                showAlbum
                showDuration
                weights={[1, 10, 0, 5, 1, 2, 1]}
                imgVersion={imgVersion}
                actions={
                  <button className="sv-action-btn" onClick={(e) => { e.stopPropagation(); addToQueue(song); }} title="Add to Queue">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18a3 3 0 103 3V8h3V6h-5z"/></svg>
                  </button>
                }
              />
            ))}
          </div>
          {artistSongs.length > 5 && (
            <button className="av__show-more" onClick={() => setShowAll(v => !v)}>
              {showAll ? 'Show less' : 'See more'}
            </button>
          )}
        </section>

        {albumGroups.length > 1 && (
          <section className="av__section">
            <SectionHeader title="Discography" />
            <div className="home-page__grid">
              {albumGroups.map(album => (
                <GridCard
                  key={album.name}
                  imgSrc={album.cover ? `/api${album.cover}${iv}` : null}
                  title={album.name}
                  subtitle={`${album.songs.length} song${album.songs.length !== 1 ? 's' : ''}`}
                  onClick={() => {
                    if (album.songs.length) playSong(album.songs[0], album.songs);
                  }}
                  onPlay={() => {
                    if (album.songs.length) playSong(album.songs[0], album.songs);
                  }}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
