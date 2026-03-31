import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loadingForm, setLoadingForm] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoadingForm(true);

    try {
      await login(email, password);
      window.location.assign('/');
    } catch (err) {
      setError(err.message || 'Login failed. Verify credentials.');
    } finally {
      setLoadingForm(false);
    }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', backgroundColor: 'var(--bg-primary)' }}>
      <div style={{ width: '320px', padding: '24px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
        <h2 style={{ marginBottom: '16px', fontSize: '16px', color: 'var(--accent-color)' }}>InfraOS Login</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>EMAIL</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled={loadingForm}
            />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>PASSWORD</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={loadingForm}
            />
          </div>
          {error && <div style={{ color: 'var(--danger-color)', marginBottom: '16px', fontSize: '12px' }}>{error}</div>}
          <button type="submit" className="primary" style={{ width: '100%', marginBottom: '12px' }} disabled={loadingForm}>
            {loadingForm ? 'Authenticating...' : 'Sign In'}
          </button>
          <button type="button" style={{ width: '100%', marginBottom: '12px' }} onClick={() => navigate('/register')}>
            Register New User
          </button>
          <div style={{ textAlign: 'center', fontSize: '12px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Don't have an account? </span>
            <a href="/register" style={{ color: 'var(--accent-color)', textDecoration: 'none' }}>Register</a>
          </div>
        </form>
      </div>
    </div>
  );
}
