import { useAuth } from '../../contexts/AuthContext';
import { useWs } from '../../contexts/WsContext';
import './TopHeader.css';

export default function TopHeader() {
  const { user, org, workspace, logout } = useAuth();
  const { wsStatus } = useWs();

  return (
    <header className="top-header">
      <div className="top-header__brand">InfraOS</div>

      <div className="top-header__context">
        <span className="context-value">{org?.name ?? '—'} / {workspace?.name ?? '—'}</span>
      </div>

      <div className="top-header__right">
        <span className={`ws-indicator ws-indicator--${wsStatus}`} title={`WS: ${wsStatus}`}/>
        <span className="user-label">{user?.email ?? 'guest'}</span>
        <button className="logout-btn" onClick={logout}>Sign Out</button>
      </div>
    </header>
  );
}
