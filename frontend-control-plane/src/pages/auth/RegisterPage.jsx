import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../../services/api';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState(null);
  const [loadingForm, setLoadingForm] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoadingForm(true);

    try {
      await api.post('/v1/tenants/auth/register', { 
        email, 
        password, 
        full_name: fullName 
      });
      // Redirect to login after successful register
      navigate('/login', { state: { message: 'Registration successful! Please sign in.' } });
    } catch (err) {
      setError(err.message || 'Registration failed. Try again.');
    } finally {
      setLoadingForm(false);
    }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', backgroundColor: 'var(--bg-primary)' }}>
      <div style={{ width: '320px', padding: '24px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
        <h2 style={{ marginBottom: '16px', fontSize: '16px', color: 'var(--accent-color)' }}>Create InfraOS Account</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>FULL NAME</label>
            <input 
              type="text" 
              required
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              disabled={loadingForm}
            />
          </div>
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
            {loadingForm ? 'Creating account...' : 'Register'}
          </button>
          <div style={{ textAlign: 'center', fontSize: '12px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Already have an account? </span>
            <Link to="/login" style={{ color: 'var(--accent-color)', textDecoration: 'none' }}>Sign In</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
