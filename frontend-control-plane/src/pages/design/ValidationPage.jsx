import { useEffect, useState } from 'react';
import api from '../../services/api';

export default function ValidationPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  async function fetchOverview() {
    try {
      setLoading(true);
      const res = await api.get('/v1/dashboard/overview');
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchOverview();
  }, []);

  return (
    <div className="page-content">
      <h1>Validation & Aggregation Dashboard</h1>

      {loading ? <p>Loading...</p> : (
        <div style={{ display: 'flex', gap: '24px', marginTop: '24px' }}>
          <div style={{ padding: '24px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px', minWidth: '150px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>MW LOAD</div>
            <div style={{ fontSize: '24px', marginTop: '8px', fontFamily: 'monospace' }}>{data?.total_mw || data?.mw_load || '0.00'}</div>
          </div>
          
          <div style={{ padding: '24px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px', minWidth: '150px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>THERMAL RISK</div>
            <div style={{ fontSize: '24px', marginTop: '8px', color: 'var(--danger-color)', fontFamily: 'monospace' }}>{data?.thermal_risk || 'N/A'}</div>
          </div>

          <div style={{ padding: '24px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px', minWidth: '150px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>INFRA RISK</div>
            <div style={{ fontSize: '24px', marginTop: '8px', color: 'var(--accent-color)', fontFamily: 'monospace' }}>{data?.infra_risk || data?.density_score || '0'}</div>
          </div>

          <div style={{ padding: '24px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px', minWidth: '150px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>ALERT COUNT</div>
            <div style={{ fontSize: '24px', marginTop: '8px', fontFamily: 'monospace' }}>{data?.alerts_count || data?.failure_exposure || '0'}</div>
          </div>
        </div>
      )}
    </div>
  );
}
