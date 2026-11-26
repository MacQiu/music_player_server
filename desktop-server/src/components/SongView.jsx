import { useState } from 'react';

export function TableHeader({ fields = ['#', 'Title', 'Artist', 'Album', '', 'Duration', ''], weights = [1, 8, 5, 5, 1, 2, 1], onSort, sortField, sortDir }) {
  const arrow = (field) => {
    if (sortField !== field) return null;
    return <span className="sv-sort-arrow">{sortDir === 'asc' ? ' ▲' : ' ▼'}</span>;
  };

  const sortableFields = { Title: 'title', Artist: 'artist', Album: 'album', Duration: 'duration' };

  return (
    <div className="sv-header">
      {fields.map((label, i) => (
        <div key={i} className={`sv-header__col ${sortableFields[label] ? 'sv-header__col--sortable' : ''}`}
          style={{ flex: weights[i] }}
          onClick={sortableFields[label] && onSort ? () => onSort(sortableFields[label]) : undefined}>
          {label === '#' ? <span className="sv-header__hash">#</span> : label}
          {sortableFields[label] && arrow(sortableFields[label])}
        </div>
      ))}
    </div>
  );
}

export default function SongView({
  song, index, isActive, onPlay, onDoubleClick, onContextMenu,
  showCover = true, showArtist = true, showAlbum = true,
  showDuration = true, actions, draggable, onDragStart, onDragOver, onDrop, onDragEnd,
  isDragging, dragOverPosition,
  weights = [1, 8, 5, 5, 1, 2, 1],
  imgVersion,
}) {
  const [hovered, setHovered] = useState(false);
  const iv = imgVersion ? `?v=${imgVersion}` : '';

  const fmtTime = (secs) => {
    if (!secs) return '—';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  let rowClass = `sv-row ${isActive ? 'sv-row--active' : ''} ${draggable ? 'sv-row--draggable' : ''}`;
  if (isDragging) rowClass += ' sv-row--dragging';
  if (dragOverPosition === 'above') rowClass += ' sv-row--drag-over-above';
  if (dragOverPosition === 'below') rowClass += ' sv-row--drag-over-below';

  return (
    <div
      className={rowClass}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <div className="sv-row__index" style={{ flex: weights[0] }}>
        {hovered ? (
          <button className="sv-row__play-btn" onClick={onPlay} title="Play">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </button>
        ) : isActive ? (
          <div className="sv-row__eq">
            <span /><span /><span /><span />
          </div>
        ) : (
          <span className="sv-row__num">{index != null ? index + 1 : ''}</span>
        )}
      </div>

      <div className="sv-row__title-col" style={{ flex: weights[1] }}>
        {showCover && (
          <div className="sv-row__cover">
            {song.cover_url
              ? <img src={`/api${song.cover_url}${iv}`} alt="" />
              : <span className="sv-row__cover-blank">♪</span>}
          </div>
        )}
        <div className="sv-row__title-info">
          <span className={`sv-row__title ${isActive ? 'sv-row__title--active' : ''}`}>{song.title}</span>
          {!!song.is_blank && <span className="sv-row__subtitle">No audio</span>}
          {showArtist && !song.is_blank && <span className="sv-row__subtitle">{song.artist || 'Unknown'}</span>}
        </div>
      </div>

      {showArtist && <div className="sv-row__col sv-row__col--tablet" style={{ flex: weights[2] }}>{song.artist || '—'}</div>}
      {showAlbum && <div className="sv-row__col sv-row__col--tablet" style={{ flex: weights[3] }}>{song.album || '—'}</div>}

      <div className="sv-row__col" style={{ flex: weights[4] }}>
        {actions}
      </div>

      {showDuration && (
        <div className="sv-row__col sv-row__col--duration" style={{ flex: weights[5] }}>
          {fmtTime(song.duration)}
        </div>
      )}

      <div className="sv-row__col" style={{ flex: weights[6] }} />
    </div>
  );
}
