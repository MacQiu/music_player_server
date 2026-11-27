import { createElement, useRef } from 'react';
import { attachSongAudio } from '../api/client';

export function useAttachAudio(onAttached) {
  const inputRef = useRef(null);
  const songIdRef = useRef(null);

  const openPicker = (songId) => {
    songIdRef.current = songId;
    setTimeout(() => inputRef.current?.click(), 0);
  };

  const onChange = async (e) => {
    const file = e.target.files?.[0];
    const songId = songIdRef.current;
    e.target.value = '';
    songIdRef.current = null;
    if (!file || !songId) return;
    try {
      await attachSongAudio(songId, file);
      await onAttached?.();
    } catch (err) {
      alert(`Could not add audio: ${err.message}`);
    }
  };

  const input = createElement('input', {
    type: 'file',
    ref: inputRef,
    accept: '.mp3,.wav,audio/mpeg,audio/wav',
    style: { display: 'none' },
    onChange,
  });

  return { openPicker, input };
}
