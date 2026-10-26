import { useEffect, useState } from 'react';
import { IoClose, IoImage, IoDocument } from 'react-icons/io5';
import Header from '../components/Header';
import { useNav } from '../navigation/Navigator';
import { useData } from '../contexts/DataContext';
import { uploadSong } from '../api/client';
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
    if (!audioFile) {
      setStatus({ ok: false, msg: 'Select an audio file first' });
      return;
    }
    if (!online) {
      setStatus({ ok: false, msg: 'Server is offline' });
      return;
    }
    setUploading(true);
    setStatus({ ok: true, msg: 'Uploading...' });
    try {
      const data = await uploadSong(audioFile, { title, artist, album }, cover);
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
            <button className="file-btn" onClick={pickAudio}>
              <IoDocument size={16} />
              <span className="ellipsis">{audioFile ? audioFile.name : 'Select audio file...'}</span>
            </button>
            <input className="input" placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
            <input className="input" placeholder="Artist" value={artist} onChange={e => setArtist(e.target.value)} />
            <input className="input" placeholder="Album" value={album} onChange={e => setAlbum(e.target.value)} />
          </div>
        </div>

        <button className="btn-primary upload-btn" onClick={handleSubmit} disabled={uploading}>
          {uploading ? 'Uploading...' : 'Upload'}
        </button>

        {status && <div className={`status-msg ${status.ok ? 'status-ok' : 'status-err'}`}>{status.msg}</div>}
      </div>
    </>
  );
}
