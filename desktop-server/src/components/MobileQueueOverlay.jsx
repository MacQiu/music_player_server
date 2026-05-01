export default function MobileQueueOverlay({
  onClose, currentSong, sourceList, sourceIndex, manualQueue,
  removeFromQueue, reorderQueue, jumpToQueueIndex,
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
      className={`mq-item ${opts.className || ''}`}
      draggable={opts.draggable || false}
      onDragStart={opts.draggable ? (e) => handleDragStart(e, idx) : undefined}
      onDragOver={opts.draggable ? (e) => e.preventDefault() : undefined}
      onDrop={opts.draggable ? (e) => handleDrop(e, idx) : undefined}
      onClick={opts.onClick}
    >
      <div className="mq-item__cover">
        {song.cover_url ? <img src={`/api${song.cover_url}`} alt="" /> : <span>♪</span>}
      </div>
      <div className="mq-item__info">
        <div className="mq-item__title">{song.title}</div>
        <div className="mq-item__artist">{song.artist || 'Unknown'}</div>
      </div>
      {opts.removable && <button className="mq-item__remove" onClick={(e) => { e.stopPropagation(); removeFromQueue(idx); }}>✕</button>}
      {opts.draggable && <span className="mq-item__drag">☰</span>}
    </div>
  );

  return (
    <div className="mobile-queue-overlay">
      <div className="mobile-queue-overlay__header">
        <button className="mobile-overlay__close" onClick={onClose}>
          <svg viewBox="0 0 24 24" width="28" height="28" fill="white"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>
        </button>
        <h3>Queue</h3>
      </div>

      <div className="mobile-queue-overlay__body">
        {songsAbove.length > 0 && (
          <div className="mq-section">
            <h4 className="mq-section__title">Previously in Queue</h4>
            {songsAbove.map((song, idx) => renderItem(song, idx, {
              prefix: 'above', className: 'mq-item--history',
              onClick: () => jumpToQueueIndex(idx, 'above'),
            }))}
          </div>
        )}

        {currentSong && (
          <div className="mq-section">
            <h4 className="mq-section__title">Now Playing</h4>
            {renderItem(currentSong, 0, { prefix: 'current', className: 'mq-item--current' })}
          </div>
        )}

        {manualQueue.length > 0 && (
          <div className="mq-section">
            <h4 className="mq-section__title">Added to Queue</h4>
            {manualQueue.map((song, idx) => renderItem(song, idx, {
              prefix: 'manual', draggable: true, removable: true,
              onClick: () => jumpToQueueIndex(idx, 'manual'),
            }))}
          </div>
        )}

        {songsBelow.length > 0 && (
          <div className="mq-section">
            <h4 className="mq-section__title">Playing Next</h4>
            {songsBelow.map((song, idx) => renderItem(song, idx, {
              prefix: 'below',
              onClick: () => jumpToQueueIndex(idx, 'below'),
            }))}
          </div>
        )}
      </div>
    </div>
  );
}
