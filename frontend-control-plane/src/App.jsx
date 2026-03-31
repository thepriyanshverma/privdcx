import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { WsProvider } from './contexts/WsContext';

// Pages
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import FacilityPage from './pages/design/FacilityPage';
import TopologyPage from './pages/design/TopologyPage';
import DevicesPage from './pages/design/DevicesPage';
import ValidationPage from './pages/design/ValidationPage';
import RuntimePage from './pages/operate/RuntimePage';
import AlertsPage from './pages/incident/AlertsPage';
import WarRoomPage from './pages/incident/WarRoomPage';
import TopologyWorkbenchPage from './pages/incident/TopologyWorkbenchPage';
import MembersPage from './pages/governance/MembersPage';
import InvitationsPage from './pages/governance/InvitationsPage';

// Bootstrap Pages
import SelectOrgPage from './pages/bootstrap/SelectOrgPage';
import CreateOrgPage from './pages/bootstrap/CreateOrgPage';
import SelectWorkspacePage from './pages/bootstrap/SelectWorkspacePage';
import CreateWorkspacePage from './pages/bootstrap/CreateWorkspacePage';

// Placeholder for unimplemented
const PlaceholderPage = ({ title }) => (
  <div className="page-content">
    <h1>{title}</h1>
    <p style={{ color: 'var(--text-muted)' }}>Under construction. Delegate logic to gateway.</p>
  </div>
);

// Auth Guard
function ProtectedRoute({ children }) {
  // Auth disabled temporarily: keep all routes accessible.
  return children;
}

// Bootstrap Guard - Ensures user has Org and Workspace selected before entering Control Plane
function BootstrapGuard({ children }) {
  // Bootstrap constraints disabled temporarily.
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={
        (!loading && user) ? <Navigate to="/" replace /> : <LoginPage />
      } />

      <Route path="/register" element={<RegisterPage />} />
      <Route path="/war-room" element={<WarRoomPage />} />
      <Route path="/topology" element={<TopologyWorkbenchPage />} />

      <Route path="/org/select" element={<ProtectedRoute><SelectOrgPage /></ProtectedRoute>} />
      <Route path="/org/create" element={<ProtectedRoute><CreateOrgPage /></ProtectedRoute>} />
      <Route path="/workspace/select" element={<ProtectedRoute><SelectWorkspacePage /></ProtectedRoute>} />
      <Route path="/workspace/create" element={<ProtectedRoute><CreateWorkspacePage /></ProtectedRoute>} />

      {/* Legacy URL redirects into guarded /app namespace */}
      <Route path="/design/*" element={<Navigate to="/app/design/facility" replace />} />
      <Route path="/deploy/*" element={<Navigate to="/app/deploy/plan" replace />} />
      <Route path="/operate/*" element={<Navigate to="/app/operate/runtime" replace />} />
      <Route path="/incident/*" element={<Navigate to="/app/incident/alerts" replace />} />
      <Route path="/governance/*" element={<Navigate to="/app/governance/members" replace />} />
      <Route path="/platform/*" element={<Navigate to="/app/platform/settings" replace />} />

      <Route path="/app" element={
        <ProtectedRoute>
          <BootstrapGuard>
            <Layout />
          </BootstrapGuard>
        </ProtectedRoute>
      }>
        <Route index element={<Navigate to="/app/design/facility" replace />} />
        
        <Route path="design/facility" element={<FacilityPage />} />
        <Route path="design/topology" element={<TopologyPage />} />
        <Route path="design/devices" element={<DevicesPage />} />
        <Route path="design/validation" element={<ValidationPage />} />

        <Route path="deploy/plan" element={<PlaceholderPage title="Deployment Plan" />} />
        <Route path="deploy/allocation" element={<PlaceholderPage title="Resource Allocation" />} />

        <Route path="operate/runtime" element={<RuntimePage />} />
        <Route path="operate/telemetry" element={<PlaceholderPage title="Telemetry Stream" />} />
        <Route path="operate/simulation" element={<PlaceholderPage title="Simulation Snapshot" />} />

        <Route path="incident/alerts" element={<AlertsPage />} />
        <Route path="incident/war-room" element={<WarRoomPage />} />
        <Route path="incident/topology" element={<TopologyWorkbenchPage />} />
        <Route path="incident/failures" element={<PlaceholderPage title="Failure Graph" />} />

        <Route path="governance/members" element={<MembersPage />} />
        <Route path="governance/invitations" element={<InvitationsPage />} />

        <Route path="platform/subscription" element={<PlaceholderPage title="Subscription" />} />
        <Route path="platform/settings" element={<PlaceholderPage title="Settings" />} />
      </Route>

      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <WsProvider>
        <AppRoutes />
      </WsProvider>
    </AuthProvider>
  );
}
