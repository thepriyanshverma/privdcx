import { useEffect, useState } from 'react';
import api from '../../services/api';

export default function TopologyPage() {
  const [racks, setRacks] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Grid layout form states
  const [hallId, setHallId] = useState('');
  const [rows, setRows] = useState('');
  const [cols, setCols] = useState('');

  async function fetchRacks() {
    try {
      setLoading(true);
      const data = await api.get('/v1/racks');
      setRacks(Array.isArray(data) ? data : data.items || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRacks();
  }, []);

  async function handleGridGenerate(e) {
    e.preventDefault();
    try {
      await api.post('/v1/layouts/grid', { 
        hall_id: hallId, 
        rows: Number(rows), 
        cols: Number(cols) 
      });
      fetchRacks();
      setHallId('');
      setRows('');
      setCols('');
    } catch (err) {
      alert("Failed to generate grid: " + err.message);
    }
  }

  return (
    <div className="page-content">
      <h1>Rack Topology</h1>
      
      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '400px' }}>
          <h2 style={{ fontSize: '14px', marginBottom: '12px' }}>Deployed Racks</h2>
          {loading ? <p>Loading...</p> : (
            <table>
              <thead>
                <tr>
                  <th>rack_id</th>
                  <th>hall_id</th>
                  <th>row_index</th>
                  <th>column_index</th>
                  <th>max_power_kw</th>
                </tr>
              </thead>
              <tbody>
                {racks.length === 0 && (
                  <tr><td colSpan="5">No racks deployed yet.</td></tr>
                )}
                {racks.map(r => (
                  <tr key={r.rack_id || r.id}>
                    <td style={{ fontFamily: 'monospace' }}>{r.rack_id || r.id}</td>
                    <td>{r.hall_id}</td>
                    <td>{r.row_index}</td>
                    <td>{r.column_index}</td>
                    <td>{r.max_power_kw}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ width: '300px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ border: '1px solid var(--border-color)', padding: '16px', borderRadius: '4px', backgroundColor: 'var(--bg-secondary)' }}>
            <h3 style={{ marginBottom: '12px', fontSize: '14px', color: 'var(--accent-color)' }}>Generate Grid Layout</h3>
            <form onSubmit={handleGridGenerate} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input placeholder="Target Hall ID" value={hallId} onChange={e => setHallId(e.target.value)} required />
              <input type="number" placeholder="Rows Count" value={rows} onChange={e => setRows(e.target.value)} required />
              <input type="number" placeholder="Columns Count" value={cols} onChange={e => setCols(e.target.value)} required />
              <button type="submit" className="primary">Compile Layout</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
