import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';

export default function SelectOrgPage() {
  const [orgs, setOrgs] = useState([]);
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('org_member');
  const [inviteResult, setInviteResult] = useState('');
  const [loadingLocal, setLoadingLocal] = useState(true);
  const [inviteLoading, setInviteLoading] = useState(false);
  const { user, logout, selectOrg, refreshOrganizations } = useAuth();
  const navigate = useNavigate();

  const loadOrgs = useCallback(async () => {
    try {
      const list = await refreshOrganizations();
      setOrgs(list);
    } catch (err) {
      setError(err.message || 'Failed to load organizations.');
    } finally {
      setLoadingLocal(false);
    }
  }, [refreshOrganizations]);

  useEffect(() => {
    loadOrgs();
  }, [loadOrgs]);

  async function handleSelect(org) {
    await selectOrg(org);
    navigate('/workspace/select');
  }

  async function handleJoinInvite(event) {
    event.preventDefault();
    setError('');
    try {
      await api.post('/v1/invitations/accept', {
        token: inviteCode,
        email: user?.email,
      });
      setInviteCode('');
      await loadOrgs();
    } catch (err) {
      if (err.status === 404 || String(err.message || '').toLowerCase().includes('not found')) {
        try {
          await api.post(`/v1/invitations/codes/${inviteCode}/accept`, {
            token: inviteCode,
            email: user?.email,
          });
          setInviteCode('');
          await loadOrgs();
          return;
        } catch (fallbackErr) {
          setError(fallbackErr.message || 'Invalid invite code.');
          return;
        }
      }
      if (String(err.message || '').toLowerCase().includes('accepted')) {
        setInviteCode('');
        await loadOrgs();
        setError('');
        return;
      }
      setError(err.message || 'Failed to join organization via invite.');
    }
  }

  async function handleCreateOrgInvite(event) {
    event.preventDefault();
    setError('');
    setInviteResult('');
    setInviteLoading(true);
    try {
      const activeOrgId = localStorage.getItem('active_org_id');
      if (!activeOrgId) {
        setError('Select an organization first to create an organization invite.');
        return;
      }
      const response = await api.post('/v1/invitations/', {
        email: inviteEmail,
        role: inviteRole,
        scope_type: 'organization',
        scope_id: activeOrgId,
      });
      setInviteResult(response?.code || response?.invite_code || '');
      setInviteEmail('');
    } catch (err) {
      if (err.status === 403) {
        setError('403: You do not have permission to create organization invites.');
      } else {
        setError(err.message || 'Failed to create organization invite.');
      }
    } finally {
      setInviteLoading(false);
    }
  }

  async function copyInviteCode() {
    if (!inviteResult) return;
    try {
      await navigator.clipboard.writeText(inviteResult);
    } catch {
      // no-op
    }
  }

  if (loadingLocal) return <div className="bootstrap-container">Loading organizations...</div>;

  return (
    <div className="bootstrap-container">
      <div className="bootstrap-card">
        <h2>Select Organization</h2>
        <p>Choose an organization to continue to the control plane.</p>
        
        <table>
          <thead>
            <tr>
              <th>org_id</th>
              <th>name</th>
              <th>role</th>
              <th>action</th>
            </tr>
          </thead>
          <tbody>
            {orgs.length === 0 ? (
              <tr>
                <td colSpan="4">No organizations found. Create one to continue.</td>
              </tr>
            ) : null}
            {orgs.map((item) => (
              <tr key={item.organization_id || item.org_id || item.id}>
                <td>{item.organization_id || item.org_id || item.id}</td>
                <td>{item.name}</td>
                <td>{item.role || item.user_role || 'member'}</td>
                <td>
                  <button onClick={() => handleSelect(item)}>Select Org</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <form onSubmit={handleJoinInvite} style={{ marginTop: '12px' }}>
          <div className="form-group">
            <label>JOIN VIA INVITE CODE</label>
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              required
              placeholder="invite_code"
            />
          </div>
          <button type="submit">Join Organization</button>
        </form>

        <form onSubmit={handleCreateOrgInvite} style={{ marginTop: '16px' }}>
          <h3 style={{ marginBottom: '8px' }}>Invite to Organization</h3>
          <div className="form-group">
            <label>EMAIL</label>
            <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>ROLE</label>
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} style={{ width: '100%', padding: '8px' }}>
              <option value="org_member">org_member</option>
              <option value="org_admin">org_admin</option>
            </select>
          </div>
          <button type="submit" disabled={inviteLoading}>{inviteLoading ? 'Creating...' : 'Create Org Invite'}</button>
          {inviteResult ? (
            <div style={{ marginTop: '8px' }}>
              invite_code: <strong>{inviteResult}</strong>{' '}
              <button type="button" onClick={copyInviteCode}>Copy</button>
            </div>
          ) : null}
        </form>
        {error ? <div className="error-message">{error}</div> : null}

        <div className="bootstrap-actions">
          <button className="secondary" onClick={() => navigate('/org/create')}>
            + Create New Organization
          </button>
          <button className="text-link" onClick={logout}>Sign Out</button>
        </div>
      </div>
    </div>
  );
}
