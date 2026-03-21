import { Header } from './components/layout/Header';
import { useProjectStore } from './store/useProjectStore';
import { DataCenterCanvas } from './components/3d/DataCenterCanvas';
import { CostPanel } from './components/panels/CostPanel';
import { FacilityOperatorOS } from './components/panels/CommandCenter';
import { ClusterPlannerPanel } from './components/panels/ClusterPlannerPanel';
import { FacilityWizard } from './components/panels/FacilityWizard';
import { TenantManagementPanel } from './components/panels/TenantManagementPanel';
import { useState, useEffect } from 'react';
import { useClusterStore } from './store/useClusterStore';
import { useDataCenterStore } from './store/useDataCenterStore';
import { useInfraHealthStore } from './store/useInfraHealthStore';
import { useAuthStore } from './store/useAuthStore';
import { LoginPage } from './components/auth/LoginPage';
import { RegisterPage } from './components/auth/RegisterPage';
import { WorkspaceSelectorPage } from './components/auth/WorkspaceSelectorPage';
import type { SpatialOverlayMode } from './components/3d/DataCenterCanvas';
import { UnifiedInspector } from './components/panels/UnifiedInspector';
import { WorkflowTabs } from './components/ui/WorkflowTabs';
import { DeploymentToolbar } from './components/ui/DeploymentToolbar';
import { useDeploymentToolsStore } from './store/useDeploymentToolsStore';
import { ControlPlaneView } from './components/control-plane/ControlPlaneView';
import React from 'react';

// Global Error Catcher Hack
class ErrorBoundary extends React.Component<any, { hasError: boolean, error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(255,0,0,0.9)', color: 'white', padding: '2rem', whiteSpace: 'pre-wrap', fontFamily: 'monospace', overflow: 'auto' }}>
          <h2>React Crash Detected:</h2>
          {this.state.error?.toString()}
          <br/><br/>
          {this.state.error?.stack}
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const viewMode = useProjectStore((s: any) => s.viewMode);
  const { activeWorkflow } = useDeploymentToolsStore();
  const [spatialOverlay, setSpatialOverlay] = useState<SpatialOverlayMode>('none');
  const [authView, setAuthView] = useState<'login' | 'register'>('login');
  
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const currentWorkspaceId = useAuthStore(s => s.currentWorkspaceId);
  const user = useAuthStore(s => s.user);
  const setWorkspace = useAuthStore(s => s.setWorkspace);

  // Auto-select workspace from profile if local session is empty
  useEffect(() => {
    if (isAuthenticated && !currentWorkspaceId && user?.last_workspace_id) {
       console.log('Restoring workspace from backend profile:', user.last_workspace_id);
       setWorkspace(user.last_workspace_id, true); // true = skip redundant sync back
    }
  }, [isAuthenticated, currentWorkspaceId, user?.last_workspace_id]);

  // Infrastructure Simulation & Initialization
  useEffect(() => {
    if (!isAuthenticated || !currentWorkspaceId) return;

    // 1. Initialize Core Infrastructure OS
    useInfraHealthStore.getState().initializeOS();

    const dcState = useDataCenterStore.getState();
    if (Object.keys(dcState.racks).length === 0) {
      dcState.generateLayout();
    }
    
    // 2. High-level UI sync loop (Tick the React stores)
    const tickInterval = useInfraHealthStore.getState().tickIntervalMs;
    const interval = setInterval(() => {
      const now = performance.now();
      useClusterStore.getState().tickSimulation(now);
      useInfraHealthStore.getState().tickTelemetrySimulation(now);
    }, tickInterval);
    
    return () => clearInterval(interval);
  }, [isAuthenticated, currentWorkspaceId]); 

  if (!isAuthenticated) {
    return authView === 'login' 
      ? <LoginPage onToggle={() => setAuthView('register')} /> 
      : <RegisterPage onToggle={() => setAuthView('login')} />;
  }

  if (!currentWorkspaceId) {
    return <WorkspaceSelectorPage onSelect={(id) => setWorkspace(id)} />;
  }

  return (
    <ErrorBoundary>
    <div className="flex flex-col h-screen w-screen bg-[var(--color-dark-bg)] text-[var(--color-text-primary)] font-sans overflow-hidden">
      <Header />
      
      <main className="flex-1 flex overflow-hidden relative">
        <div className="flex-1 relative bg-[#0f172a]">
          {viewMode === 'control' ? (
            <ControlPlaneView />
          ) : viewMode === '3d' ? (
            <>
              <DataCenterCanvas spatialOverlay={spatialOverlay} />
              <WorkflowTabs />
              <UnifiedInspector />
              
              {/* Workflow-Scoped Panels */}
              {activeWorkflow === 'operations' && (
                <>
                  <FacilityOperatorOS 
                    currentOverlay={spatialOverlay}
                    onSetOverlay={(mode) => setSpatialOverlay(mode)} 
                  />
                  <TenantManagementPanel />
                </>
              )}
              
              {activeWorkflow === 'deployment' && <ClusterPlannerPanel />}
              {activeWorkflow === 'finance' && <CostPanel />}
              {(activeWorkflow === 'layout' || activeWorkflow === 'deployment') && (
                <>
                  <FacilityWizard />
                  <DeploymentToolbar />
                </>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-500 font-mono text-sm">
              Please design your infrastructure using the 3D Data Center view.
            </div>
          )}
        </div>
      </main>
    </div>
    </ErrorBoundary>
  );
}

export default App;
