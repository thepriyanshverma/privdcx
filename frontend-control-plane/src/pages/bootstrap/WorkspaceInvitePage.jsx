import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';

export default function WorkspaceInvitePage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('infra_operator');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setInviteCode('');
    try {
      const response = await api.post('/v1/workspaces/invite/', { email, role });
      setInviteCode(response?.invite_code || '');
    } catch (err) {
      if (err.status === 403) {
        setError('Forbidden: only workspace_owner can create workspace invites.');
      } else {
        setError(err.message || 'Failed to create workspace invite.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bootstrap-container">
      <div className="bootstrap-card">
        <h2>Create Workspace Invite</h2>
        <p>Generate an invite code for workspace access.</p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>EMAIL</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>ROLE</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} style={{ width: '100%', padding: '8px' }}>
              <option value="infra_architect">infra_architect</option>
              <option value="infra_operator">infra_operator</option>
            </select>
          </div>
          {error ? <div className="error-message">{error}</div> : null}
          {inviteCode ? <div>Invite Code: <strong>{inviteCode}</strong></div> : null}
          <div className="bootstrap-actions">
            <button type="submit" className="primary" disabled={loading}>{loading ? 'Creating...' : 'Create Invite'}</button>
            <button type="button" onClick={() => navigate('/workspace/select')}>Back</button>
          </div>
        </form>
      </div>
    </div>
  );
}
