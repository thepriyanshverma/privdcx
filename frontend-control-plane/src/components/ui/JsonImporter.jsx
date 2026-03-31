import { useState } from 'react';
import api from '../../services/api';

export function JsonImporter({ title, endpoint, version = null, onSuccess }) {
  const [fileName, setFileName] = useState('');
  const [rawJson, setRawJson] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [responseBody, setResponseBody] = useState(null);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const content = await file.text();
    setRawJson(content);
  }

  async function handleImport() {
    setError(null);
    setResponseBody(null);
    setLoading(true);
    try {
      const res = await api.postRawJson(endpoint, rawJson, { version });
      if (onSuccess) onSuccess(res);
      setResponseBody(res);
    } catch (e) {
      if (e.status === 409) {
        setError('Conflict detected. Please review the current state.');
      } else {
        setError(e.message || 'Invalid JSON or Request Error');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ border: '1px solid var(--border-color)', padding: '16px', borderRadius: '4px', backgroundColor: 'var(--bg-secondary)' }}>
      <h3 style={{ marginBottom: '12px', fontSize: '14px', color: 'var(--accent-color)' }}>{title}</h3>
      <input
        type="file"
        accept="application/json,.json"
        onChange={handleFileChange}
        style={{ marginBottom: '12px' }}
      />
      {fileName ? <div style={{ marginBottom: '12px', fontSize: '12px' }}>Selected: {fileName}</div> : null}
      {error && <div style={{ color: 'var(--danger-color)', marginBottom: '12px', padding: '8px', backgroundColor: 'var(--danger-bg)', borderRadius: '2px' }}>{error}</div>}
      <button className="primary" onClick={handleImport} disabled={loading || !rawJson.trim()}>
        {loading ? 'Transmitting...' : 'Upload Configuration'}
      </button>
      {responseBody ? (
        <pre style={{ marginTop: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '11px' }}>
          {JSON.stringify(responseBody, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
