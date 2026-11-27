import { useState } from 'react';
import { IoClose, IoWifi, IoCheckmarkCircle, IoCloseCircle } from 'react-icons/io5';
import Header from '../components/Header';
import { useNav } from '../navigation/Navigator';
import { useData } from '../contexts/DataContext';
import { getBaseUrl, saveServerUrl, ping } from '../api/client';
import { Colors } from '../constants/theme';

export default function SettingsScreen() {
  const { back } = useNav();
  const { checkOnline } = useData();
  const [url, setUrl] = useState(getBaseUrl());
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);

  const isInsecure = url.trim().startsWith('http://') && location.protocol === 'https:';

  const handleSave = async () => {
    await saveServerUrl(url.trim());
    const ok = await checkOnline();
    setTestResult(ok);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const oldUrl = getBaseUrl();
    await saveServerUrl(url.trim());
    try {
      await ping();
      setTestResult(true);
    } catch {
      setTestResult(false);
    }
    await saveServerUrl(oldUrl);
    setTesting(false);
  };

  return (
    <>
      <Header title="Settings" right={<button className="icon-btn" onClick={back}><IoClose size={24} /></button>} />
      <div className="modal-body" style={{ padding: 16 }}>
        <label className="label">Server URL</label>
        <input
          className="input round"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://192.168.1.42:5443"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          inputMode="url"
        />

        <div className="settings-actions">
          <button className="btn-soft" onClick={handleTest} disabled={testing}>
            <IoWifi size={16} />
            <span>{testing ? 'Testing...' : 'Test Connection'}</span>
          </button>
          <button className="btn-primary lg" onClick={handleSave}>Save</button>
        </div>

        {testResult === true && (
          <div className="result-row" style={{ color: Colors.success }}>
            <IoCheckmarkCircle size={20} /><span>Connection successful</span>
          </div>
        )}
        {testResult === false && (
          <div className="result-row" style={{ color: Colors.danger }}>
            <IoCloseCircle size={20} /><span>Connection failed</span>
          </div>
        )}

        {isInsecure && (
          <div className="settings-note" style={{ color: Colors.danger }}>
            This app is served over HTTPS, so Safari will block an http:// server. Use
            https:// with port 5443 (for example https://192.168.1.42:5443).
          </div>
        )}
        <div className="settings-note">
          Songs you download stay on this device and play without the server.
          Play counts recorded offline sync automatically when the server is reachable again.
        </div>
      </div>
    </>
  );
}
