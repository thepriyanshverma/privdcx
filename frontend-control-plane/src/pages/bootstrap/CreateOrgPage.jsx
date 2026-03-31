import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';

export default function CreateOrgPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loadingLocal, setLoadingLocal] = useState(false);
  const [error, setError] = useState(null);
  const { user, refreshOrganizations } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setLoadingLocal(true);
    setError(null);

    try {
      await api.post('/v1/tenants/organizations', {
        name, 
        billing_email: email || user.email 
      });
      await refreshOrganizations();
      navigate('/org/select');
    } catch (err) {
      setError(err.message || 'Failed to create organization');
    } finally {
      setLoadingLocal(false);
    }
  }

  return (
    <div className="bootstrap-container">
      <div className="bootstrap-card">
        <h2>Create Organization</h2>
        <p>Set up your first organization to start managing infrastructure.</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>ORGANIZATION NAME</label>
            <input 
              type="text" 
              placeholder="e.g. Acme Corp" 
              required 
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={loadingLocal}
            />
          </div>
          <div className="form-group">
            <label>BILLING EMAIL (OPTIONAL)</label>
            <input 
              type="email" 
              placeholder={user?.email} 
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled={loadingLocal}
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="bootstrap-actions">
            <button type="submit" className="primary" disabled={loadingLocal}>
              {loadingLocal ? 'Creating...' : 'Create Organization'}
            </button>
            <button type="button" className="text-link" onClick={() => navigate('/org/select')}>
              Back to Selection
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
