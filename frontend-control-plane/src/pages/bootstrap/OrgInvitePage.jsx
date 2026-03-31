import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';

export default function OrgInvitePage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setInviteCode('');
    try {
      const response = await api.post('/v1/organizations/invite/', { email, role });
      setInviteCode(response?.invite_code || '');
    } catch (err) {
      if (err.status === 403) {
        setError('Forbidden: only org_owner can create organization invites.');
      } else {
        setError(err.message || 'Failed to create organization invite.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bootstrap-container">
      <div className="bootstrap-card">
        <h2>Create Organization Invite</h2>
        <p>Generate an invite code for organization access.</p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>EMAIL</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>ROLE</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} style={{ width: '100%', padding: '8px' }}>
              <option value="member">member</option>
              <option value="org_owner">org_owner</option>
            </select>
          </div>
          {error ? <div className="error-message">{error}</div> : null}
          {inviteCode ? <div>Invite Code: <strong>{inviteCode}</strong></div> : null}
          <div className="bootstrap-actions">
            <button type="submit" className="primary" disabled={loading}>{loading ? 'Creating...' : 'Create Invite'}</button>
            <button type="button" onClick={() => navigate('/org/select')}>Back</button>
          </div>
        </form>
      </div>
    </div>
  );
}
