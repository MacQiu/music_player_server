import { useEffect, useState } from 'react';
import { IoClose, IoImage, IoDocument } from 'react-icons/io5';
import Header from '../components/Header';
import { useNav } from '../navigation/Navigator';
import { useData } from '../contexts/DataContext';
import { uploadSong, createBlankSong } from '../api/client';
import { pickFile } from '../utils/pickFile';

export default function UploadScreen() {
  const { back } = useNav();
  const { refreshSongs, bumpImgVersion, online } = useData();
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [placeholder, setPlaceholder] = useState(false);

  useEffect(() => () => { if (coverPreview) URL.revokeObjectURL(coverPreview); }, [coverPreview]);

  const pickAudio = async () => {
    const f = await pickFile('audio/mpeg,audio/wav,audio/x-wav,.mp3,.wav');
    if (f) setAudioFile(f);
  };

  const pickCover = async () => {
    const f = await pickFile('image/*');
    if (!f) return;
    setCover(f);
    setCoverPreview(URL.createObjectURL(f));
  };

  const handleSubmit = async () => {
    if (!placeholder && !audioFile) {
      setStatus({ ok: false, msg: 'Select an audio file first' });
      return;
    }
    if (placeholder && !title.trim()) {
      setStatus({ ok: false, msg: 'A placeholder needs a title' });
      return;
    }
    if (!online) {
      setStatus({ ok: false, msg: 'Server is offline' });
      return;
    }
    setUploading(true);
    setStatus({ ok: true, msg: 'Uploading...' });
    try {
      const data = placeholder
        ? await createBlankSong({ title, artist, album }, cover)
        : await uploadSong(audioFile as File, { title, artist, album }, cover);
      setStatus({ ok: true, msg: `Uploaded "${data.title}"` });
      setAudioFile(null);
      setCover(null);
      setCoverPreview(null);
      setTitle('');
      setArtist('');
      setAlbum('');
      refreshSongs();
      bumpImgVersion();
    } catch (err: any) {
      setStatus({ ok: false, msg: err.message });
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <Header title="Upload Song" right={<button className="icon-btn" onClick={back}><IoClose size={24} /></button>} />
      <div className="modal-body" style={{ padding: 16 }}>
        <div className="upload-row">
          <button className="cover-picker" onClick={pickCover}>
            {coverPreview ? <img src={coverPreview} alt="" /> : (
              <>
                <IoImage size={32} />
                <span>Cover</span>
              </>
            )}
          </button>

          <div className="upload-fields">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              <input type="checkbox" checked={placeholder} onChange={e => setPlaceholder(e.target.checked)} />
              Placeholder (no audio)
            </label>
            {!placeholder && (
            <button className="file-btn" onClick={pickAudio}>
              <IoDocument size={16} />
              <span className="ellipsis">{audioFile ? audioFile.name : 'Select audio file...'}</span>
            </button>
            )}
            <input className="input" placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
            <input className="input" placeholder="Artist" value={artist} onChange={e => setArtist(e.target.value)} />
            <input className="input" placeholder="Album" value={album} onChange={e => setAlbum(e.target.value)} />
          </div>
        </div>

        <button className="btn-primary upload-btn" onClick={handleSubmit} disabled={uploading}>
          {uploading ? 'Saving...' : (placeholder ? 'Add Placeholder' : 'Upload')}
        </button>

        {status && <div className={`status-msg ${status.ok ? 'status-ok' : 'status-err'}`}>{status.msg}</div>}
      </div>
    </>
  );
}
