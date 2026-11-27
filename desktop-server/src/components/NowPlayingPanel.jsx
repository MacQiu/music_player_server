export default function NowPlayingPanel({
  mode, onModeChange, onClose,
  currentSong, sourceList, sourceIndex, manualQueue,
  removeFromQueue, reorderQueue, jumpToQueueIndex, playSong,
  imgVersion,
}) {
  const iv = imgVersion ? `?v=${imgVersion}` : '';
  const songsAbove = sourceIndex > 0 ? sourceList.slice(0, sourceIndex) : [];
  const songsBelow = sourceIndex >= 0 ? sourceList.slice(sourceIndex + 1) : [];

  const nextUp = manualQueue.length > 0 ? manualQueue : songsBelow;
  const nextUpLabel = manualQueue.length > 0 ? 'Next in Queue' : 'Next from playlist';

  const handleDragStart = (e, idx) => { e.dataTransfer.setData('text/plain', idx); };
  const handleDrop = (e, toIdx) => {
    e.preventDefault();
    const fromIdx = Number(e.dataTransfer.getData('text/plain'));
    if (fromIdx !== toIdx) reorderQueue(fromIdx, toIdx);
  };

  const QueueItem = ({ song, idx, opts = {} }) => (
    <div
      className={`np-item ${opts.className || ''}`}
      draggable={opts.draggable || false}
      onDragStart={opts.draggable ? (e) => handleDragStart(e, idx) : undefined}
      onDragOver={opts.draggable ? (e) => e.preventDefault() : undefined}
      onDrop={opts.draggable ? (e) => handleDrop(e, idx) : undefined}
    >
      <div className="np-item__cover">
        {song.cover_url
          ? <img src={`/api${song.cover_url}${iv}`} alt="" />
          : <span className="np-item__cover-blank">♪</span>}
      </div>
      <div className="np-item__info" onClick={opts.onClick} style={opts.onClick ? { cursor: 'pointer' } : {}}>
        <div className="np-item__title">{song.title}</div>
        <div className="np-item__artist">{song.artist || 'Unknown'}</div>
      </div>
      {opts.removable && (
        <button className="np-item__remove" onClick={() => removeFromQueue(idx)} title="Remove">✕</button>
      )}
      {opts.draggable && <span className="np-item__drag" title="Drag to reorder">☰</span>}
    </div>
  );

  return (
    <div className="np">
      <div className="np__header">
        <div className="np__tabs">
          <button className={`np__tab ${mode === 'details' ? 'np__tab--active' : ''}`}
            onClick={() => onModeChange('details')}>
            Now Playing
          </button>
          <button className={`np__tab ${mode === 'queue' ? 'np__tab--active' : ''}`}
            onClick={() => onModeChange('queue')}>
            Queue
          </button>
        </div>
        <button className="np__close" onClick={onClose}>&times;</button>
      </div>

      <div className="np__body">
        {mode === 'details' && (
          <div className="np__details">
            {currentSong ? (
              <>
                <div className="np__card">
                  <div className="np__card-img">
                    {currentSong.cover_url
                      ? <img src={`/api${currentSong.cover_url}${iv}`} alt="" />
                      : <div className="np__card-blank">♪</div>}
                  </div>
                  <div className="np__card-info">
                    <div className="np__card-title">{currentSong.title}</div>
                    <div className="np__card-artist">{currentSong.artist || 'Unknown'}</div>
                  </div>
                </div>

                {nextUp.length > 0 && (
                  <div className="np__section">
                    <h4 className="np__section-title">{nextUpLabel}</h4>
                    {nextUp.slice(0, 3).map((song, idx) => (
                      <QueueItem key={`next-${song.id}-${idx}`} song={song} idx={idx}
                        opts={{ onClick: () => jumpToQueueIndex(idx, manualQueue.length > 0 ? 'manual' : 'below') }} />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="muted" style={{ padding: '2rem', textAlign: 'center' }}>No song playing</p>
            )}
          </div>
        )}

        {mode === 'queue' && (
          <div className="np__queue">
            {songsAbove.length > 0 && (
              <div className="np__section">
                <h4 className="np__section-title">Previously Played</h4>
                {songsAbove.map((song, idx) => (
                  <QueueItem key={`above-${song.id}-${idx}`} song={song} idx={idx}
                    opts={{ className: 'np-item--history', onClick: () => jumpToQueueIndex(idx, 'above') }} />
                ))}
              </div>
            )}

            {currentSong && (
              <div className="np__section">
                <h4 className="np__section-title">Now Playing</h4>
                <QueueItem song={currentSong} idx={0} opts={{ className: 'np-item--current' }} />
              </div>
            )}

            {manualQueue.length > 0 && (
              <div className="np__section">
                <h4 className="np__section-title">Added to Queue</h4>
                {manualQueue.map((song, idx) => (
                  <QueueItem key={`manual-${song.id}-${idx}`} song={song} idx={idx}
                    opts={{ draggable: true, removable: true, onClick: () => jumpToQueueIndex(idx, 'manual') }} />
                ))}
              </div>
            )}

            {songsBelow.length > 0 && (
              <div className="np__section">
                <h4 className="np__section-title">Playing Next</h4>
                {songsBelow.map((song, idx) => (
                  <QueueItem key={`below-${song.id}-${idx}`} song={song} idx={idx}
                    opts={{ onClick: () => jumpToQueueIndex(idx, 'below') }} />
                ))}
              </div>
            )}

            {!currentSong && manualQueue.length === 0 && songsAbove.length === 0 && songsBelow.length === 0 && (
              <p className="muted" style={{ padding: '2rem', textAlign: 'center' }}>Queue is empty</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
