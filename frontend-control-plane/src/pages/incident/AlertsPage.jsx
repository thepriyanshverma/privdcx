import { useEffect, useState } from 'react';
import api from '../../services/api';

export default function AlertsPage() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  async function fetchAlerts() {
    try {
      setLoading(true);
      const data = await api.get('/v1/alerts');
      setAlerts(Array.isArray(data) ? data : data.items || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAlerts();
  }, []);

  return (
    <div className="page-content">
      <h1>Incident & Alert Stream</h1>
      
      <div style={{ marginTop: '24px' }}>
        {loading ? <p>Loading...</p> : (
          <table>
            <thead>
              <tr>
                <th>Severity</th>
                <th>entity</th>
                <th>description</th>
                <th>timestamp</th>
              </tr>
            </thead>
            <tbody>
              {alerts.length === 0 && (
                <tr><td colSpan="4">No active alerts reported by engine.</td></tr>
              )}
              {alerts.map(a => (
                <tr key={a.id || a.alert_id}>
                  <td style={{ color: a.severity === 'CRITICAL' ? 'var(--danger-color)' : a.severity === 'WARNING' ? '#ffc107' : 'inherit' }}>
                    {a.severity}
                  </td>
                  <td style={{ fontFamily: 'monospace' }}>{a.entity || a.source_id || a.component}</td>
                  <td>{a.description || a.message || a.detail}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{a.timestamp || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
