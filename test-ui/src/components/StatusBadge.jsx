export default function StatusBadge({ online }) {
  return (
    <span className={`badge ${online ? 'badge--online' : 'badge--offline'}`}>
      {online ? 'Online' : 'Offline'}
    </span>
  );
}
