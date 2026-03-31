import { useEffect, useState } from 'react';
import api from '../../services/api';
import { JsonImporter } from '../../components/ui/JsonImporter';

export default function FacilityPage() {
  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [name, setName] = useState('');
  const [width, setWidth] = useState('');
  const [length, setLength] = useState('');
  const [cooling, setCooling] = useState('Air');

  async function fetchFacilities() {
    try {
      setLoading(true);
      const data = await api.get('/v1/facilities');
      // Assume returning array or { items: [] }
      setFacilities(Array.isArray(data) ? data : data.items || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchFacilities();
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    try {
      await api.post('/v1/facilities', { 
        name, 
        width_m: Number(width), 
        length_m: Number(length), 
        cooling_type: cooling 
      });
      fetchFacilities();
      setName('');
      setWidth('');
      setLength('');
    } catch (err) {
      alert("Failed to create facility: " + err.message);
    }
  }

  return (
    <div className="page-content">
      <h1>Facility Design</h1>
      
      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '400px' }}>
          <h2 style={{ fontSize: '14px', marginBottom: '12px' }}>Registered Facilities</h2>
          {loading ? <p>Loading...</p> : (
            <table>
              <thead>
                <tr>
                  <th>facility_id</th>
                  <th>Name</th>
                  <th>width_m</th>
                  <th>length_m</th>
                  <th>Cooling</th>
                </tr>
              </thead>
              <tbody>
                {facilities.length === 0 && (
                  <tr><td colSpan="5">No facilities created yet.</td></tr>
                )}
                {facilities.map(f => (
                  <tr key={f.facility_id || f.id}>
                    <td>{f.facility_id || f.id}</td>
                    <td>{f.name}</td>
                    <td>{f.width_m}</td>
                    <td>{f.length_m}</td>
                    <td>{f.cooling_type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ width: '300px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <JsonImporter 
            title="Import Facility Spec" 
            endpoint="/v1/facilities/import" 
            onSuccess={fetchFacilities} 
          />

          <div style={{ border: '1px solid var(--border-color)', padding: '16px', borderRadius: '4px', backgroundColor: 'var(--bg-secondary)' }}>
            <h3 style={{ marginBottom: '12px', fontSize: '14px', color: 'var(--accent-color)' }}>Create Facility Form</h3>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input placeholder="Name" value={name} onChange={e => setName(e.target.value)} required />
              <input type="number" placeholder="Width (m)" value={width} onChange={e => setWidth(e.target.value)} required />
              <input type="number" placeholder="Length (m)" value={length} onChange={e => setLength(e.target.value)} required />
              <select value={cooling} onChange={e => setCooling(e.target.value)} style={{ padding: '8px', backgroundColor: 'var(--bg-primary)', color: 'white', border: '1px solid var(--border-color)' }}>
                <option value="Air">Air Cooling</option>
                <option value="Liquid">Liquid Cooling</option>
                <option value="Immersion">Immersion</option>
              </select>
              <button type="submit" className="primary">Execute Creation</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
