import { create } from 'zustand';
import { useDataCenterStore } from './useDataCenterStore';
import { controlPlane } from '../infra-core/control-plane/infraManager';
import { tickEngine } from '../infra-core/tick-engine/clock';
import { runtimeManager } from '../infra-core/runtime/stateManager';
import { useClusterStore } from './useClusterStore';

export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertCategory = 'thermal' | 'power' | 'capacity' | 'hardware';

export interface Alert {
  id: string;
  entityId: string; // Rack ID or Cluster ID
  entityName?: string;
  severity: AlertSeverity;
  category: AlertCategory;
  message: string;
  timestamp: number;
}

export interface RackTelemetry {
  cpuUtilizationAvg: number;     // 0-100%
  powerDrawActiveW: number;      // Stochastic variation +/- base load
  thermalVariationBTU: number;   // Stochastic variation +/- base heat
  anomalyProbability: number;    // 0-100% (driven by load/heat stress)
  healthScore: number;           // 0-100 (100 is perfect)
  status: 'healthy' | 'degraded' | 'critical';
}

interface InfraHealthState {
  // Configurable temporal simulation speed
  tickIntervalMs: number;
  isPaused: boolean;
  
  // Real-time Synthetic Streams
  rackTelemetry: Record<string, RackTelemetry>;
  
  // Alerting
  activeAlerts: Alert[];
  
  // Aggregated globals
  globalHealthScore: number;
  
  // Actions
  setTemporalControl: (isPaused: boolean, intervalMs?: number) => void;
  dismissAlert: (id: string) => void;
  initializeOS: () => void;
  
  // Simulation Tick (invoked by App.tsx)
  tickTelemetrySimulation: (timeMs: number) => void;
}

export const useInfraHealthStore = create<InfraHealthState>((set, get) => ({
  tickIntervalMs: 1000,
  isPaused: false,
  rackTelemetry: {},
  activeAlerts: [],
  globalHealthScore: 100,

  setTemporalControl: (isPaused, intervalMs) => set((state) => ({
    isPaused,
    tickIntervalMs: intervalMs ?? state.tickIntervalMs
  })),

  dismissAlert: (id) => set((state) => ({
    activeAlerts: state.activeAlerts.filter(a => a.id !== id)
  })),

  initializeOS: () => {
    // 1. Initialize the Core Control Plane with the Facility Config
    const dcStore = useDataCenterStore.getState();
    controlPlane.initialize({
      id: 'facility-primary',
      name: 'Main Datacenter',
      totalPowerCapacityW: dcStore.facility.powerCapacityMW * 1000000,
      zones: [], // Zones will be registered dynamically
      runtime: {
        healthScore: 1.0,
        capacityUtilization: 0,
        thermalStressIndex: 0,
        failureRiskIndex: 0,
        activeIncidentCount: 0
      }
    });

    // 2. Register Physical Assets as Runtime Entities
    Object.values(dcStore.racks).forEach(rack => {
      // Register Rack in Core (as an aggregator)
      // Note: In Phase 2, we treat the Rack ID itself as a Device for aggregate telemetry
      runtimeManager.registerDevice(rack.id, {
        powerDrawW: 0,
        thermalLoadBTU: 0,
        healthScore: 1.0
      });

      // Register individual equipment if needed for granular distribution
      // In this phase, we aggregate at rack level for performance
    });

    // 3. Register Clusters
    const clusterStore = useClusterStore.getState();
    Object.values(clusterStore.clusters).forEach((cluster: any) => {
      runtimeManager.registerCluster({
        ...cluster,
        runtime: {
          workloadDemand: cluster.currentLoadMultiplier,
          saturation: 0,
          imbalanceFactor: 0.1,
          healthScore: 1.0
        }
      });
    });

    // 4. Start the core tick engine
    tickEngine.start();
  },

  tickTelemetrySimulation: (_timeMs: number) => {
    if (get().isPaused) return;

    // Flush current cluster demand to runtime
    const clusterStore = useClusterStore.getState();
    Object.values(clusterStore.clusters).forEach((cluster: any) => {
      // We push the "Demand" from the UI store to the Core Engine
      runtimeManager.registerCluster({
        ...cluster,
        runtime: {
          workloadDemand: cluster.currentLoadMultiplier,
          saturation: 0,
          imbalanceFactor: 0.1,
          healthScore: 1.0
        }
      });
    });

    // Sync UI Telemetry with Core Runtime States
    const metrics = controlPlane.getGlobalMetrics();
    const dcStore = useDataCenterStore.getState();
    
    const newTelemetry: Record<string, RackTelemetry> = {};
    const newAlerts: Alert[] = [...get().activeAlerts];

    Object.values(dcStore.racks).forEach(rack => {
      const coreState = runtimeManager.getDeviceState(rack.id);
      
      if (coreState) {
        let healthScore = coreState.healthScore * 100;
        let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
        if (healthScore < 80) status = 'degraded';
        if (healthScore < 50) status = 'critical';

        newTelemetry[rack.id] = {
          cpuUtilizationAvg: coreState.utilization * 100,
          powerDrawActiveW: coreState.powerDrawW,
          thermalVariationBTU: coreState.thermalLoadBTU,
          anomalyProbability: coreState.failureProbability * 100,
          healthScore,
          status
        };
      }
    });

    // Map Core Incidents to UI Alerts
    metrics.activeIncidents.forEach(inc => {
      const exists = newAlerts.some(a => a.id === inc.id);
      if (!exists) {
        newAlerts.unshift({
          id: inc.id,
          entityId: inc.entityId,
          severity: inc.severity === 'critical' ? 'critical' : 'warning',
          category: inc.category === 'overheat' ? 'thermal' : 'power',
          message: inc.message,
          timestamp: inc.timestamp
        });
      }
    });

    set({ 
      rackTelemetry: newTelemetry, 
      activeAlerts: newAlerts.slice(0, 50), 
      globalHealthScore: metrics.healthScore * 100 
    });
  }
}));
