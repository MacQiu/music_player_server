import { useState, useRef } from 'react';
import { uploadSong } from '../api/client';

export default function UploadModal({ onClose, onUploaded }) {
  const [file, setFile] = useState(null);
  const [cover, setCover] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [status, setStatus] = useState(null);
  const [uploading, setUploading] = useState(false);
  const coverRef = useRef(null);

  const handleCoverChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setCover(f);
    setCoverPreview(URL.createObjectURL(f));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setStatus({ ok: false, msg: 'Select an audio file first' });
      return;
    }
    setUploading(true);
    setStatus({ ok: true, msg: 'Uploading...' });
    try {
      const data = await uploadSong(file, { title, artist, album }, cover);
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
          <h3>Upload Song</h3>
          <button className="modal__close" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="modal__body">
          <div className="upload-modal__row">
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
            <div className="upload-modal__fields">
              <input type="file" accept=".mp3,.wav" onChange={(e) => setFile(e.target.files[0])} />
              <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
              <input placeholder="Artist" value={artist} onChange={(e) => setArtist(e.target.value)} />
              <input placeholder="Album" value={album} onChange={(e) => setAlbum(e.target.value)} />
            </div>
          </div>
          <div className="modal__footer">
            <button type="submit" className="btn btn--primary" disabled={uploading}>
              {uploading ? 'Uploading...' : 'Upload'}
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
