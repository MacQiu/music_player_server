import { useMemo, useState } from 'react';
import { IoChevronBack, IoPerson, IoPlay, IoEllipsisHorizontal } from 'react-icons/io5';
import CoverImage from '../components/CoverImage';
import { useData } from '../contexts/DataContext';
import { usePlayer } from '../contexts/PlayerContext';
import { useNav } from '../navigation/Navigator';
import { uploadArtistImage } from '../api/client';
import { pickFile } from '../utils/pickFile';
import type { Song } from '../types';

export default function ArtistScreen({ artistName }: { artistName: string }) {
  const { back } = useNav();
  const { songs, artists, online, imgVersion, refreshArtists, bumpImgVersion } = useData();
  const { playSong, addToQueue } = usePlayer();
  const [uploading, setUploading] = useState(false);
  const [showAllTracks, setShowAllTracks] = useState(false);

  const artist = artists.find(a => a.name === artistName);
  const artistSongs = useMemo(() => songs.filter(s => s.artist === artistName), [songs, artistName]);

  const albumGroups = useMemo(() => {
    const map = new Map<string, Song[]>();
    artistSongs.forEach(s => {
      const key = s.album || 'Singles';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    });
    return Array.from(map.entries()).map(([album, tracks]) => ({ album, tracks, cover: tracks[0] }));
  }, [artistSongs]);

  const popularTracks = useMemo(() => (
    [...artistSongs]
      .sort((a, b) => (b.play_count || 0) - (a.play_count || 0))
      .slice(0, showAllTracks ? 20 : 5)
  ), [artistSongs, showAllTracks]);

  const handleImageUpload = async () => {
    if (!online) return;
    const file = await pickFile('image/*');
    if (!file) return;
    setUploading(true);
    try {
      await uploadArtistImage(artistName, file);
      await refreshArtists();
      bumpImgVersion();
    } catch { }
    finally { setUploading(false); }
  };

  const handlePlayAll = () => {
    if (artistSongs.length === 0) return;
    playSong(artistSongs[0], artistSongs);
  };

  return (
    <div className="modal-body">
      <div className="artist-hero" onClick={handleImageUpload}>
        {artist?.image_url ? (
          <CoverImage coverUrl={artist.image_url} size="100%" imgVersion={imgVersion}
            className="artist-hero-img" style={{ borderRadius: 0 }}
            placeholder={<IoPerson size={80} />} />
        ) : (
          <div className="artist-hero-placeholder"><IoPerson size={80} /></div>
        )}
        <div className="artist-hero-overlay" />
        <div className="artist-hero-content">
          <button className="artist-back" aria-label="Back" onClick={e => { e.stopPropagation(); back(); }}>
            <IoChevronBack size={24} />
          </button>
          <div className="artist-hero-bottom">
            <div className="artist-name">{artistName}</div>
            <div className="artist-stat">{artistSongs.length} track{artistSongs.length !== 1 ? 's' : ''}</div>
          </div>
        </div>
        {uploading && <div className="upload-banner">Uploading image...</div>}
      </div>

      <div className="controls-row">
        <button className="fab-play" onClick={handlePlayAll} disabled={artistSongs.length === 0} aria-label="Play">
          <IoPlay size={28} />
        </button>
      </div>

      {popularTracks.length > 0 && (
        <div className="artist-section">
          <div className="artist-section-title">Popular</div>
          {popularTracks.map((song, idx) => (
            <div key={song.id} className="artist-song-row" onClick={() => playSong(song, artistSongs)}>
              <span className="track-num">{idx + 1}</span>
              <CoverImage coverUrl={song.cover_url} songId={song.id} size={44} imgVersion={imgVersion} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="pl-song-title ellipsis">{song.title}</div>
                <div className="pl-song-artist ellipsis">
                  {song.play_count ? `${song.play_count} plays` : song.album || 'Unknown'}
                </div>
              </div>
              <button className="more-btn" aria-label="Add to queue"
                onClick={e => { e.stopPropagation(); addToQueue(song); }}>
                <IoEllipsisHorizontal size={18} />
              </button>
            </div>
          ))}
          {artistSongs.length > 5 && (
            <button className="show-more" onClick={() => setShowAllTracks(!showAllTracks)}>
              {showAllTracks ? 'Show less' : `Show all ${artistSongs.length} tracks`}
            </button>
          )}
        </div>
      )}

      {albumGroups.length > 0 && (
        <div className="artist-section">
          <div className="artist-section-title">From this artist</div>
          <div className="album-row">
            {albumGroups.map(item => (
              <div key={item.album} className="album-card"
                onClick={() => { if (item.tracks.length > 0) playSong(item.tracks[0], item.tracks); }}>
                <div className="album-cover">
                  <CoverImage coverUrl={item.cover?.cover_url} songId={item.cover?.id} size={140} imgVersion={imgVersion} />
                </div>
                <div className="album-title ellipsis">{item.album}</div>
                <div className="album-sub">{item.tracks.length} songs</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
