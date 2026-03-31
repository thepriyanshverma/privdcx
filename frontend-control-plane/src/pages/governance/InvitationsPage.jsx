import { useEffect, useState } from 'react';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

export default function InvitationsPage() {
  const { org, workspace } = useAuth();
  const [orgEmail, setOrgEmail] = useState('');
  const [orgRole, setOrgRole] = useState('org_member');
  const [workspaceEmail, setWorkspaceEmail] = useState('');
  const [workspaceRole, setWorkspaceRole] = useState('infra_operator');
  const [orgLoading, setOrgLoading] = useState(false);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [orgMessage, setOrgMessage] = useState(null);
  const [workspaceMessage, setWorkspaceMessage] = useState(null);
  const [orgInviteCode, setOrgInviteCode] = useState('');
  const [workspaceInviteCode, setWorkspaceInviteCode] = useState('');
  const [orgInvites, setOrgInvites] = useState([]);
  const [workspaceInvites, setWorkspaceInvites] = useState([]);

  async function loadInviteLists() {
    const orgId = org?.organization_id || org?.id || org?.org_id;
    const workspaceId = workspace?.workspace_id || workspace?.id;

    if (orgId) {
      try {
        const data = await api.get(`/v1/invitations/organization/${orgId}/invites`);
        setOrgInvites(Array.isArray(data) ? data : data?.items || []);
      } catch (err) {
        if (err?.status === 403) {
          setOrgMessage({ type: 'error', text: '403: You do not have permission to view organization invitations.' });
        }
        setOrgInvites([]);
      }
    } else {
      setOrgInvites([]);
    }

    if (workspaceId) {
      try {
        const data = await api.get(`/v1/invitations/workspace/${workspaceId}/invites`);
        setWorkspaceInvites(Array.isArray(data) ? data : data?.items || []);
      } catch {
        setWorkspaceInvites([]);
      }
    } else {
      setWorkspaceInvites([]);
    }
  }

  useEffect(() => {
    loadInviteLists();
  }, [org?.organization_id, org?.id, workspace?.workspace_id, workspace?.id]);

  async function handleOrgInvite(e) {
    e.preventDefault();
    setOrgLoading(true);
    setOrgMessage(null);
    setOrgInviteCode('');
    try {
      const orgId = org?.organization_id || org?.id || org?.org_id;
      const response = await api.post('/v1/invitations/', {
        email: orgEmail,
        role: orgRole,
        scope_type: 'organization',
        scope_id: orgId,
      });
      setOrgInviteCode(response?.code || response?.invite_code || '');
      setOrgMessage({ type: 'success', text: `Organization invitation dispatched to ${orgEmail}` });
      setOrgEmail('');
      await loadInviteLists();
    } catch (err) {
      setOrgMessage({ type: 'error', text: `Organization invite failed: ${err.message}` });
    } finally {
      setOrgLoading(false);
    }
  }

  async function handleWorkspaceInvite(e) {
    e.preventDefault();
    setWorkspaceLoading(true);
    setWorkspaceMessage(null);
    setWorkspaceInviteCode('');
    try {
      const workspaceId = workspace?.workspace_id || workspace?.id;
      const response = await api.post('/v1/invitations/', {
        email: workspaceEmail,
        role: workspaceRole,
        scope_type: 'workspace',
        scope_id: workspaceId,
      });
      setWorkspaceInviteCode(response?.code || response?.invite_code || '');
      setWorkspaceMessage({ type: 'success', text: `Workspace invitation dispatched to ${workspaceEmail}` });
      setWorkspaceEmail('');
      await loadInviteLists();
    } catch (err) {
      setWorkspaceMessage({ type: 'error', text: `Workspace invite failed: ${err.message}` });
    } finally {
      setWorkspaceLoading(false);
    }
  }

  return (
    <div className="page-content">
      <h1>Issue Access Delegation</h1>
      
      <div style={{ marginTop: '24px', maxWidth: '700px', display: 'grid', gap: '16px' }}>
        <div style={{ padding: '24px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
          <h2 style={{ fontSize: '14px', marginBottom: '16px', color: 'var(--accent-color)' }}>Organization Invite</h2>
          
          <form onSubmit={handleOrgInvite} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>TARGET EMAIL</label>
              <input 
                type="email" 
                placeholder="engineer@domain.tld" 
                value={orgEmail} 
                onChange={e => setOrgEmail(e.target.value)} 
                required 
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>ROLE</label>
              <select 
                value={orgRole} 
                onChange={e => setOrgRole(e.target.value)} 
                style={{ width: '100%', padding: '8px', backgroundColor: 'var(--bg-primary)', color: 'white', border: '1px solid var(--border-color)' }}
              >
                <option value="org_member">org_member</option>
                <option value="org_owner">org_owner</option>
              </select>
            </div>
            {orgInviteCode ? <div>Invite Code: <strong>{orgInviteCode}</strong></div> : null}
            <button type="submit" className="primary" disabled={orgLoading || !orgEmail || !org}>
              {orgLoading ? 'Executing...' : 'Create Organization Invite'}
            </button>
          </form>
          {orgMessage && (
            <div style={{
              marginTop: '12px',
              padding: '8px',
              fontSize: '12px',
              backgroundColor: orgMessage.type === 'error' ? 'var(--danger-bg)' : '#1a3320',
              color: orgMessage.type === 'error' ? 'var(--danger-color)' : '#4caf50',
              border: `1px solid ${orgMessage.type === 'error' ? 'var(--danger-color)' : '#4caf50'}`,
            }}>
              {orgMessage.text}
            </div>
          )}
        </div>

        <div style={{ padding: '24px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
          <h2 style={{ fontSize: '14px', marginBottom: '16px', color: 'var(--accent-color)' }}>Workspace Invite</h2>
          <form onSubmit={handleWorkspaceInvite} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>TARGET EMAIL</label>
              <input
                type="email"
                placeholder="engineer@domain.tld"
                value={workspaceEmail}
                onChange={e => setWorkspaceEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>ROLE</label>
              <select
                value={workspaceRole}
                onChange={e => setWorkspaceRole(e.target.value)}
                style={{ width: '100%', padding: '8px', backgroundColor: 'var(--bg-primary)', color: 'white', border: '1px solid var(--border-color)' }}
              >
                <option value="infra_architect">infra_architect</option>
                <option value="infra_operator">infra_operator</option>
              </select>
            </div>
            {workspaceInviteCode ? <div>Invite Code: <strong>{workspaceInviteCode}</strong></div> : null}
            <button type="submit" className="primary" disabled={workspaceLoading || !workspaceEmail || !workspace}>
              {workspaceLoading ? 'Executing...' : 'Create Workspace Invite'}
            </button>
          </form>
          {workspaceMessage && (
            <div style={{
              marginTop: '12px',
              padding: '8px',
              fontSize: '12px',
              backgroundColor: workspaceMessage.type === 'error' ? 'var(--danger-bg)' : '#1a3320',
              color: workspaceMessage.type === 'error' ? 'var(--danger-color)' : '#4caf50',
              border: `1px solid ${workspaceMessage.type === 'error' ? 'var(--danger-color)' : '#4caf50'}`,
            }}>
              {workspaceMessage.text}
            </div>
          )}
        </div>

        <div style={{ padding: '24px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
          <h2 style={{ fontSize: '14px', marginBottom: '16px', color: 'var(--accent-color)' }}>Organization Invitations</h2>
          <table>
            <thead>
              <tr>
                <th>code</th>
                <th>email</th>
                <th>role</th>
                <th>status</th>
                <th>expires_at</th>
              </tr>
            </thead>
            <tbody>
              {orgInvites.length === 0 ? (
                <tr><td colSpan="5">No organization invites found.</td></tr>
              ) : orgInvites.map((invite) => (
                <tr key={invite.id || invite.code}>
                  <td>{invite.code}</td>
                  <td>{invite.email}</td>
                  <td>{invite.role}</td>
                  <td>{invite.status}</td>
                  <td>{invite.expires_at || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ padding: '24px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
          <h2 style={{ fontSize: '14px', marginBottom: '16px', color: 'var(--accent-color)' }}>Workspace Invitations</h2>
          <table>
            <thead>
              <tr>
                <th>code</th>
                <th>email</th>
                <th>role</th>
                <th>status</th>
                <th>expires_at</th>
              </tr>
            </thead>
            <tbody>
              {workspaceInvites.length === 0 ? (
                <tr><td colSpan="5">No workspace invites found.</td></tr>
              ) : workspaceInvites.map((invite) => (
                <tr key={invite.id || invite.code}>
                  <td>{invite.code}</td>
                  <td>{invite.email}</td>
                  <td>{invite.role}</td>
                  <td>{invite.status}</td>
                  <td>{invite.expires_at || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
