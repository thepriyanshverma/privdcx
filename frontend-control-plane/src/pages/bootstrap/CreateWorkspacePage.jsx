import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';

export default function CreateWorkspacePage() {
  const [name, setName] = useState('');
  const [region, setRegion] = useState('us-east-1');
  const [loadingLocal, setLoadingLocal] = useState(false);
  const [error, setError] = useState(null);
  const { org, refreshWorkspaces } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!org) {
      navigate('/org/select');
    }
  }, [org, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoadingLocal(true);
    setError(null);

    try {
      const orgId = org?.organization_id || org?.id || org?.org_id;
      await api.post('/v1/tenants/workspaces', { name, region, organization_id: orgId });
      await refreshWorkspaces();
      navigate('/workspace/select');
    } catch (err) {
      setError(err.message || 'Failed to create workspace');
    } finally {
      setLoadingLocal(false);
    }
  }

  return (
    <div className="bootstrap-container">
      <div className="bootstrap-card">
        <h2>Create Workspace</h2>
        <p>Set up your first environment (e.g. Production Cluster, Region-A).</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>WORKSPACE NAME</label>
            <input 
              type="text" 
              placeholder="e.g. Hyperscale Cluster 01" 
              required 
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={loadingLocal}
            />
          </div>
          <div className="form-group">
            <label>REGION</label>
            <input
              type="text"
              value={region}
              onChange={e => setRegion(e.target.value)}
              disabled={loadingLocal}
            />
          </div>
          {error && <div className="error-message">{error}</div>}

          <div className="bootstrap-actions">
            <button type="submit" className="primary" disabled={loadingLocal}>
              {loadingLocal ? 'Creating...' : 'Create Workspace'}
            </button>
            <button type="button" className="text-link" onClick={() => navigate('/workspace/select')}>
              Back to Selection
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
