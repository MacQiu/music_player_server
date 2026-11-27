import React from 'react';
import { IoCheckmark } from 'react-icons/io5';
import CoverImage from './CoverImage';
import { usePress } from '../hooks/usePress';
import type { Song } from '../types';

interface Props {
  song: Song;
  onPress: () => void;
  onLongPress?: () => void;
  rightElement?: React.ReactNode;
  imgVersion?: number;
  dimmed?: boolean;
  subtitle?: string;
  selectionMode?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}

export default function SongRow({
  song, onPress, onLongPress, rightElement, imgVersion, dimmed, subtitle,
  selectionMode, selected, onSelect,
}: Props) {
  const press = usePress(selectionMode ? onSelect : onPress, selectionMode ? undefined : onLongPress);

  return (
    <div
      className={`song-row pressable ${dimmed ? 'dimmed' : ''} ${selectionMode && selected ? 'selected' : ''}`}
      {...press}
    >
      {selectionMode && (
        <div className={`check-circle ${selected ? 'checked' : ''}`}>
          {selected && <IoCheckmark size={16} color="#000" />}
        </div>
      )}
      <CoverImage coverUrl={song.cover_url} songId={song.id} size={52} imgVersion={imgVersion} />
      <div className="song-row-info">
        <div className="song-row-title ellipsis">{song.title}</div>
        <div className="song-row-artist ellipsis">{song.artist || 'Unknown Artist'}</div>
        {subtitle && <div className="song-row-sub">{subtitle}</div>}
      </div>
      {!selectionMode && rightElement && (
        <div onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
          {rightElement}
        </div>
      )}
    </div>
  );
}
