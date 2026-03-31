import { useEffect, useState } from 'react';
import api from '../../services/api';

export default function MembersPage() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  async function fetchMembers() {
    try {
      setLoading(true);
      const data = await api.get('/v1/members');
      setMembers(Array.isArray(data) ? data : data.items || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchMembers();
  }, []);

  return (
    <div className="page-content">
      <h1>Workspace Members</h1>
      
      <div style={{ marginTop: '24px' }}>
        {loading ? <p>Loading...</p> : (
          <table>
            <thead>
              <tr>
                <th>Member ID</th>
                <th>Email Address</th>
                <th>Role Context</th>
                <th>Access Created</th>
              </tr>
            </thead>
            <tbody>
              {members.length === 0 && (
                <tr><td colSpan="4">No members assigned to current context scope.</td></tr>
              )}
              {members.map(m => (
                <tr key={m.id || m.member_id}>
                  <td style={{ fontFamily: 'monospace' }}>{m.id || m.member_id}</td>
                  <td>{m.email}</td>
                  <td>{m.role || m.workspace_role}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{m.created_at || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
