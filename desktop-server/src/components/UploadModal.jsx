import { useState, useRef, useMemo } from 'react';
import { uploadSong, createBlankSong, deleteCoverFile } from '../api/client';

export default function UploadModal({ onClose, onUploaded, songs = [] }) {
  const [file, setFile] = useState(null);
  const [placeholder, setPlaceholder] = useState(false);
  const [cover, setCover] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [status, setStatus] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showExisting, setShowExisting] = useState(false);
  const coverRef = useRef(null);

  const existingCovers = useMemo(() => {
    const seen = new Set();
    return songs.filter(s => {
      if (!s.cover_url) return false;
      const key = `${s.artist || ''}::${s.album || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [songs]);

  const handleCoverChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setCover(f);
    setCoverPreview(URL.createObjectURL(f));
    setShowExisting(false);
  };

  const handlePickExisting = async (song) => {
    try {
      const res = await fetch(`/api${song.cover_url}`);
      const blob = await res.blob();
      const ext = blob.type.split('/')[1] || 'jpg';
      const file = new File([blob], `cover.${ext}`, { type: blob.type });
      setCover(file);
      setCoverPreview(URL.createObjectURL(blob));
      setShowExisting(false);
    } catch { /* ignore */ }
  };

  const handleDeleteCover = async (e, song) => {
    e.stopPropagation();
    const coverPath = song.cover_url;
    const filename = coverPath.split('/').pop();
    if (!filename) return;
    if (!window.confirm('Delete this cover from the library? All songs using it will lose their cover.')) return;
    try {
      await deleteCoverFile(filename);
      onUploaded();
    } catch { /* ignore */ }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!placeholder && !file) {
      setStatus({ ok: false, msg: 'Select an audio file first' });
      return;
    }
    if (placeholder && !title.trim()) {
      setStatus({ ok: false, msg: 'A placeholder needs a title' });
      return;
    }
    setUploading(true);
    setStatus({ ok: true, msg: placeholder ? 'Saving placeholder...' : 'Uploading...' });
    try {
      const data = placeholder
        ? await createBlankSong({ title, artist, album }, cover)
        : await uploadSong(file, { title, artist, album }, cover);
      setStatus({ ok: true, msg: `Uploaded "${data.title}"` });
      setFile(null);
      setCover(null);
      setCoverPreview(null);
      setTitle('');
      setArtist('');
      setAlbum('');
      e.target.reset();
      onUploaded();
    } catch (err) {
      setStatus({ ok: false, msg: err.message });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h3>{placeholder ? 'Add Placeholder' : 'Upload Song'}</h3>
          <button className="modal__close" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="modal__body">
          <div className="upload-modal__row">
            <div className="upload-modal__cover-col">
              <div className="upload-modal__cover" onClick={() => coverRef.current?.click()}>
                {coverPreview ? (
                  <img src={coverPreview} alt="Cover preview" />
                ) : (
                  <div className="upload-modal__cover-placeholder">
                    <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor" opacity=".4">
                      <path d="M21 19V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
                    </svg>
                    <span>Cover</span>
                  </div>
                )}
                <input
                  ref={coverRef}
                  type="file"
                  accept="image/*"
                  onChange={handleCoverChange}
                  style={{ display: 'none' }}
                />
              </div>
              {existingCovers.length > 0 && (
                <button type="button" className="upload-modal__pick-link"
                  onClick={() => setShowExisting(v => !v)}>
                  {showExisting ? 'Hide Library' : 'Show Library'}
                </button>
              )}
            </div>
            <div className="upload-modal__fields">
              <label style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.85rem' }}>
                <input type="checkbox" checked={placeholder} onChange={(e) => setPlaceholder(e.target.checked)} />
                Placeholder (cover only, no audio)
              </label>
              {!placeholder && (
                <input type="file" accept=".mp3,.wav" onChange={(e) => setFile(e.target.files[0])} />
              )}
              <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
              <input placeholder="Artist" value={artist} onChange={(e) => setArtist(e.target.value)} />
              <input placeholder="Album" value={album} onChange={(e) => setAlbum(e.target.value)} />
            </div>
          </div>
          {showExisting && (
            <div className="upload-modal__existing">
              {existingCovers.map(s => (
                <div key={s.id} className="upload-modal__existing-wrap">
                  <button type="button" className="upload-modal__existing-thumb"
                    onClick={() => handlePickExisting(s)} title={`${s.title} — ${s.artist || 'Unknown'}`}>
                    <img src={`/api${s.cover_url}`} alt="" />
                  </button>
                  <button type="button" className="upload-modal__cover-del"
                    onClick={(e) => handleDeleteCover(e, s)} title="Delete cover">
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="modal__footer">
            <button type="submit" className="btn btn--primary" disabled={uploading}>
              {uploading ? 'Saving...' : (placeholder ? 'Add Placeholder' : 'Upload')}
            </button>
          </div>
          {status && (
            <p className={status.ok ? 'msg msg--ok' : 'msg msg--err'}>{status.msg}</p>
          )}
        </form>
      </div>
    </div>
  );
}
