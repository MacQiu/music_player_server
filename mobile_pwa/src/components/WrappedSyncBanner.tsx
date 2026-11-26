import { useEffect, useState } from 'react';
import { getWrappedStatus } from '../api/client';

export default function WrappedSyncBanner() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    getWrappedStatus()
      .then(d => setMessage(d?.should_notify ? d.message : null))
      .catch(() => setMessage(null));
  }, []);

  if (!message) return null;
  return (
    <div style={{ background: '#3a2a00', color: '#ffe08a', padding: '0.75rem 1rem', borderRadius: 8, marginBottom: 12 }}>
      {message}
    </div>
  );
}
