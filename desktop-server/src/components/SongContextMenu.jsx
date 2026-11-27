export default function SongContextMenu({
  menu, onClose, onPlay, onAddToQueue, onRemoveFromQueue,
  inQueue, onSetCover, onAddAudio, playlists = [], onAddToPlaylist,
}) {
  if (!menu) return null;
  return (
    <div className="context-menu" style={{ top: menu.y, left: menu.x }} onClick={(e) => e.stopPropagation()}>
      {!!menu.song.is_blank && (
        <button onClick={() => { onClose(); onAddAudio(menu.song.id); }}>Add Audio</button>
      )}
      <button onClick={() => { onPlay(menu.song); onClose(); }}>Play</button>
      <button onClick={() => { onAddToQueue(menu.song); onClose(); }}>Add to Queue</button>
      {inQueue && (
        <button onClick={() => onRemoveFromQueue(menu.song.id)}>Remove from Queue</button>
      )}
      <button onClick={() => onSetCover(menu.song.id)}>Set Cover</button>
      {playlists.length > 0 && (
        <>
          <div className="context-menu__divider" />
          {playlists.map((p) => (
            <button key={p.id} onClick={() => onAddToPlaylist(p.id, menu.song.id)}>
              Add to &ldquo;{p.name}&rdquo;
            </button>
          ))}
        </>
      )}
    </div>
  );
}
