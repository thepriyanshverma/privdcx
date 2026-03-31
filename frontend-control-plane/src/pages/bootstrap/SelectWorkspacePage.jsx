import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';

export default function SelectWorkspacePage() {
  const [workspaces, setWorkspaces] = useState([]);
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('infra_operator');
  const [inviteResult, setInviteResult] = useState('');
  const [loadingLocal, setLoadingLocal] = useState(true);
  const [inviteLoading, setInviteLoading] = useState(false);
  const { user, logout, selectWorkspace, org, refreshWorkspaces } = useAuth();
  const navigate = useNavigate();

  const loadWorkspaces = useCallback(async () => {
    const orgId = org?.id || org?.organization_id;
    if (!orgId) {
      navigate('/org/select');
      return;
    }
    try {
      const list = await refreshWorkspaces(orgId);
      setWorkspaces(list);
    } catch (err) {
      setError(err.message || 'Failed to load workspaces.');
    } finally {
      setLoadingLocal(false);
    }
  }, [navigate, org, refreshWorkspaces]);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  const handleSelect = async (workspace) => {
    try {
      await selectWorkspace(workspace);
      navigate('/app');
    } catch (err) {
      setError(err.message || 'Failed to select workspace.');
    }
  };

  async function handleJoinInvite(event) {
    event.preventDefault();
    setError('');
    try {
      await api.post('/v1/invitations/accept', {
        token: inviteCode,
        email: user?.email,
      });
      setInviteCode('');
      await loadWorkspaces();
    } catch (err) {
      if (err.status === 404 || String(err.message || '').toLowerCase().includes('not found')) {
        try {
          await api.post(`/v1/invitations/codes/${inviteCode}/accept`, {
            token: inviteCode,
            email: user?.email,
          });
          setInviteCode('');
          await loadWorkspaces();
          return;
        } catch (fallbackErr) {
          setError(fallbackErr.message || 'Invalid invite code.');
          return;
        }
      }
      if (String(err.message || '').toLowerCase().includes('accepted')) {
        setInviteCode('');
        await loadWorkspaces();
        setError('');
        return;
      }
      setError(err.message || 'Failed to join workspace via invite.');
    }
  }

  async function handleCreateWorkspaceInvite(event) {
    event.preventDefault();
    setError('');
    setInviteResult('');
    setInviteLoading(true);
    try {
      const activeWorkspaceId = localStorage.getItem('active_workspace_id');
      if (!activeWorkspaceId) {
        setError('Select a workspace first to create a workspace invite.');
        return;
      }
      const response = await api.post('/v1/invitations/', {
        email: inviteEmail,
        role: inviteRole,
        scope_type: 'workspace',
        scope_id: activeWorkspaceId,
      });
      setInviteResult(response?.code || response?.invite_code || '');
      setInviteEmail('');
    } catch (err) {
      if (err.status === 403) {
        setError('403: You do not have permission to create workspace invites.');
      } else {
        setError(err.message || 'Failed to create workspace invite.');
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

  if (loadingLocal) return <div className="bootstrap-container">Loading workspaces...</div>;

  return (
    <div className="bootstrap-container">
      <div className="bootstrap-card">
        <h2>Select Workspace</h2>
        <p>Choose a workspace within this organization to access the control plane.</p>
        
        <table>
          <thead>
            <tr>
              <th>workspace_id</th>
              <th>name</th>
              <th>role</th>
              <th>action</th>
            </tr>
          </thead>
          <tbody>
            {workspaces.length === 0 ? (
              <tr>
                <td colSpan="4">No workspaces found. Create one to continue.</td>
              </tr>
            ) : null}
            {workspaces.map((item) => (
              <tr key={item.workspace_id || item.id}>
                <td>{item.workspace_id || item.id}</td>
                <td>{item.name}</td>
                <td>{item.role || item.user_role || 'member'}</td>
                <td>
                  <button onClick={() => handleSelect(item)}>Select Workspace</button>
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
          <button type="submit">Join Workspace</button>
        </form>

        <form onSubmit={handleCreateWorkspaceInvite} style={{ marginTop: '16px' }}>
          <h3 style={{ marginBottom: '8px' }}>Invite to Workspace</h3>
          <div className="form-group">
            <label>EMAIL</label>
            <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>ROLE</label>
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} style={{ width: '100%', padding: '8px' }}>
              <option value="workspace_owner">workspace_owner</option>
              <option value="infra_architect">infra_architect</option>
              <option value="infra_operator">infra_operator</option>
              <option value="infra_viewer">infra_viewer</option>
            </select>
          </div>
          <button type="submit" disabled={inviteLoading}>{inviteLoading ? 'Creating...' : 'Create Workspace Invite'}</button>
          {inviteResult ? (
            <div style={{ marginTop: '8px' }}>
              invite_code: <strong>{inviteResult}</strong>{' '}
              <button type="button" onClick={copyInviteCode}>Copy</button>
            </div>
          ) : null}
        </form>
        {error ? <div className="error-message">{error}</div> : null}

        <div className="bootstrap-actions">
          <button 
            className="secondary" 
            onClick={() => navigate('/workspace/create')}
          >
            + Create New Workspace
          </button>
          <button className="text-link" onClick={() => navigate('/org/select')}>
            Change Organization
          </button>
          <button className="text-link" onClick={logout}>Sign Out</button>
        </div>
      </div>
    </div>
  );
}
