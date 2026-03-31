import { useEffect, useState } from 'react';
import { useWs } from '../../contexts/WsContext';

export default function RuntimePage() {
  const { lastMessage, subscribe, wsStatus } = useWs();
  const [rows, setRows] = useState([]);

  useEffect(() => {
    const unsubscribe = subscribe((message) => {
      const payloadRows = Array.isArray(message) ? message : message?.entities || message?.items || [message];
      setRows(payloadRows.filter(Boolean));
    });
    return unsubscribe;
  }, [subscribe]);

  return (
    <div className="page-content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h1>Runtime Operator Console</h1>
        <div style={{ color: wsStatus === 'connected' ? '#28a745' : 'var(--danger-color)', fontSize: '12px' }}>
          Stream: {wsStatus.toUpperCase()}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '400px' }}>
          <h2 style={{ fontSize: '14px', marginBottom: '12px' }}>Live Runtime State</h2>
          <table>
            <thead>
              <tr>
                <th>entity_id</th>
                <th>health_status</th>
                <th>power_state</th>
                <th>thermal_state</th>
              </tr>
            </thead>
            <tbody>
              {!Array.isArray(rows) || rows.length === 0 ? (
                <tr><td colSpan="4">Awaiting telemetry frames...</td></tr>
              ) : rows.map((item, i) => (
                <tr key={item.entity_id || item.id || i}>
                  <td style={{ fontFamily: 'monospace' }}>{item.entity_id || item.id}</td>
                  <td>{item.health_status || item.status || 'unknown'}</td>
                  <td>{item.power_state || item.power || 'unknown'}</td>
                  <td>{item.thermal_state || item.thermal || 'unknown'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ width: '320px' }}>
          <h2 style={{ fontSize: '14px', marginBottom: '12px' }}>Last Message</h2>
          <pre style={{ border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)', minHeight: '150px', padding: '12px', fontSize: '11px', whiteSpace: 'pre-wrap' }}>
            {lastMessage ? JSON.stringify(lastMessage, null, 2) : 'No data yet'}
          </pre>
        </div>
      </div>
    </div>
  );
}
