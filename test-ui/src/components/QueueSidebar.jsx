export default function QueueSidebar({
  currentSong, sourceList, sourceIndex, manualQueue,
  onClose, removeFromQueue, reorderQueue, jumpToQueueIndex,
}) {
  const songsAbove = sourceIndex > 0 ? sourceList.slice(0, sourceIndex) : [];
  const songsBelow = sourceIndex >= 0 ? sourceList.slice(sourceIndex + 1) : [];

  const handleDragStart = (e, idx) => { e.dataTransfer.setData('text/plain', idx); };
  const handleDrop = (e, toIdx) => {
    e.preventDefault();
    const fromIdx = Number(e.dataTransfer.getData('text/plain'));
    if (fromIdx !== toIdx) reorderQueue(fromIdx, toIdx);
  };

  const renderItem = (song, idx, opts = {}) => (
    <div key={`${opts.prefix || 'q'}-${song.id}-${idx}`}
      className={`queue-sidebar__item ${opts.className || ''}`}
      draggable={opts.draggable || false}
      onDragStart={opts.draggable ? (e) => handleDragStart(e, idx) : undefined}
      onDragOver={opts.draggable ? (e) => e.preventDefault() : undefined}
      onDrop={opts.draggable ? (e) => handleDrop(e, idx) : undefined}
    >
      <div className="queue-sidebar__cover">
        {song.cover_url ? <img src={`/api${song.cover_url}`} alt="" /> : <span className="queue-sidebar__cover-blank">♪</span>}
      </div>
      <div className="queue-sidebar__info" onClick={opts.onClick} style={opts.onClick ? { cursor: 'pointer' } : {}}>
        <div className="queue-sidebar__title">{song.title}</div>
        <div className="queue-sidebar__artist">{song.artist || 'Unknown'}</div>
      </div>
      {opts.removable && (
        <button className="btn btn--sm btn--ghost" onClick={() => removeFromQueue(idx)} title="Remove">✕</button>
      )}
      {opts.draggable && <span className="queue-sidebar__drag" title="Drag to reorder">☰</span>}
    </div>
  );

  return (
    <aside className="queue-sidebar">
      <div className="queue-sidebar__header">
        <h3>Queue</h3>
        <button className="modal__close" onClick={onClose}>&times;</button>
      </div>

      <div className="queue-sidebar__body">
        {songsAbove.length > 0 && (
          <div className="queue-sidebar__section">
            <h4>Previously in Queue</h4>
            {songsAbove.map((song, idx) => renderItem(song, idx, {
              prefix: 'above', className: 'queue-sidebar__item--history',
              onClick: () => jumpToQueueIndex(idx, 'above'),
            }))}
          </div>
        )}

        {currentSong && (
          <div className="queue-sidebar__section">
            <h4>Now Playing</h4>
            {renderItem(currentSong, 0, { prefix: 'current', className: 'queue-sidebar__item--current' })}
          </div>
        )}

        {manualQueue.length > 0 && (
          <div className="queue-sidebar__section">
            <h4>Added to Queue</h4>
            {manualQueue.map((song, idx) => renderItem(song, idx, {
              prefix: 'manual', draggable: true, removable: true,
              onClick: () => jumpToQueueIndex(idx, 'manual'),
            }))}
          </div>
        )}

        {songsBelow.length > 0 && (
          <div className="queue-sidebar__section">
            <h4>Playing Next</h4>
            {songsBelow.map((song, idx) => renderItem(song, idx, {
              prefix: 'below',
              onClick: () => jumpToQueueIndex(idx, 'below'),
            }))}
          </div>
        )}

        {!currentSong && manualQueue.length === 0 && songsAbove.length === 0 && songsBelow.length === 0 && (
          <p className="muted" style={{ padding: '1rem' }}>Queue is empty</p>
        )}
      </div>
    </aside>
  );
}
