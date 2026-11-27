import type { CSSProperties, ReactNode } from 'react';
import { IoChevronDown, IoClose, IoReorderThree } from 'react-icons/io5';
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import CoverImage from '../components/CoverImage';
import Header from '../components/Header';
import { usePlayer } from '../contexts/PlayerContext';
import { useNav } from '../navigation/Navigator';
import type { Song } from '../types';

function QueueItem({ song, onPress, className, removable, onRemove, handle, style, innerRef }: {
  song: Song;
  onPress?: () => void;
  className?: string;
  removable?: boolean;
  onRemove?: () => void;
  handle?: ReactNode;
  style?: CSSProperties;
  innerRef?: (el: HTMLElement | null) => void;
}) {
  return (
    <div ref={innerRef} style={style} className={`queue-item ${className || ''}`} onClick={onPress}>
      {handle}
      <CoverImage coverUrl={song.cover_url} songId={song.id} size={36} />
      <div className="queue-item-info">
        <div className="queue-item-title ellipsis">{song.title}</div>
        <div className="queue-item-artist ellipsis">{song.artist || 'Unknown'}</div>
      </div>
      {removable && (
        <button className="more-btn" onClick={e => { e.stopPropagation(); onRemove?.(); }} aria-label="Remove">
          <IoClose size={16} />
        </button>
      )}
    </div>
  );
}

function SortableQueueItem({ id, song, onPress, onRemove }: {
  id: string; song: Song; onPress: () => void; onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    position: 'relative',
    zIndex: isDragging ? 2 : undefined,
    opacity: isDragging ? 0.8 : 1,
  };
  return (
    <QueueItem
      innerRef={setNodeRef}
      style={style}
      song={song}
      removable
      onRemove={onRemove}
      onPress={onPress}
      handle={
        <span className="drag-handle" {...attributes} {...listeners} onClick={e => e.stopPropagation()}>
          <IoReorderThree size={20} />
        </span>
      }
    />
  );
}

export default function QueueScreen() {
  const { back } = useNav();
  const { currentSong, sourceList, sourceIndex, manualQueue, removeFromQueue, reorderQueue, jumpToQueueIndex } = usePlayer();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 0, tolerance: 4 } }),
  );

  const songsAbove = sourceIndex > 0 ? sourceList.slice(0, sourceIndex) : [];
  const songsBelow = sourceIndex >= 0 ? sourceList.slice(sourceIndex + 1) : [];
  const manualIds = manualQueue.map((s, i) => `manual-${i}-${s.id}`);

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = manualIds.indexOf(String(e.active.id));
    const to = manualIds.indexOf(String(e.over.id));
    if (from >= 0 && to >= 0) reorderQueue(from, to);
  };

  return (
    <>
      <Header
        left={<button className="icon-btn" onClick={back} aria-label="Close"><IoChevronDown size={28} color="#fff" /></button>}
        title={<span style={{ display: 'block', textAlign: 'center' }}>Queue</span>}
        right={<div style={{ width: 36 }} />}
      />
      <div className="modal-body queue-body">
        {songsAbove.length > 0 && (
          <div className="queue-section">
            <div className="queue-section-title">Previously in Queue</div>
            {songsAbove.map((song, idx) => (
              <QueueItem key={`above-${song.id}-${idx}`} song={song} className="history"
                onPress={() => { jumpToQueueIndex(idx, 'above'); back(); }} />
            ))}
          </div>
        )}

        {currentSong && (
          <div className="queue-section">
            <div className="queue-section-title">Now Playing</div>
            <QueueItem song={currentSong} className="current" />
          </div>
        )}

        {manualQueue.length > 0 && (
          <div className="queue-section">
            <div className="queue-section-title">Added to Queue</div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={manualIds} strategy={verticalListSortingStrategy}>
                {manualQueue.map((song, idx) => (
                  <SortableQueueItem key={manualIds[idx]} id={manualIds[idx]} song={song}
                    onRemove={() => removeFromQueue(idx)}
                    onPress={() => { jumpToQueueIndex(idx, 'manual'); back(); }} />
                ))}
              </SortableContext>
            </DndContext>
          </div>
        )}

        {songsBelow.length > 0 && (
          <div className="queue-section">
            <div className="queue-section-title">Playing Next</div>
            {songsBelow.map((song, idx) => (
              <QueueItem key={`below-${song.id}-${idx}`} song={song}
                onPress={() => { jumpToQueueIndex(idx, 'below'); back(); }} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
