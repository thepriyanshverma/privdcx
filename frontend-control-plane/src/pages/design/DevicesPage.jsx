import { useEffect, useState } from 'react';
import api from '../../services/api';
import { JsonImporter } from '../../components/ui/JsonImporter';

export default function DevicesPage() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);

  async function fetchDevices() {
    try {
      setLoading(true);
      const data = await api.get('/v1/devices');
      setDevices(Array.isArray(data) ? data : data.items || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDevices();
  }, []);

  return (
    <div className="page-content">
      <h1>Device Planning & Inventory</h1>
      
      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '400px' }}>
          <h2 style={{ fontSize: '14px', marginBottom: '12px' }}>Inventory Cluster</h2>
          {loading ? <p>Loading...</p> : (
            <table>
              <thead>
                <tr>
                  <th>Device UUID</th>
                  <th>Target Rack</th>
                  <th>U-Slot Start</th>
                  <th>Power Load (W)</th>
                  <th>Thermal Impact</th>
                </tr>
              </thead>
              <tbody>
                {devices.length === 0 && (
                  <tr><td colSpan="5">No devices mounted.</td></tr>
                )}
                {devices.map(d => (
                  <tr key={d.device_uuid || d.id}>
                    <td style={{ fontFamily: 'monospace' }}>{d.device_uuid || d.id}</td>
                    <td>{d.rack_id || d.rack}</td>
                    <td>U{d.u_position_start}</td>
                    <td>{d.power_w || d.power_load_w || d.power}W</td>
                    <td>{d.thermal_impact || d.thermal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ width: '300px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <JsonImporter 
            title="Bulk Deploy Spec" 
            endpoint="/v1/devices/bulk-deploy" 
            onSuccess={fetchDevices} 
          />
        </div>
      </div>
    </div>
  );
}
