import type { 
  EntityId, 
  DeviceRuntimeState, 
  Cluster, 
  RackRuntimeState, 
  DependencyType,
} from '../domain/types';
import { controlPlane } from '../control-plane/infraManager';
import { BehaviourRules, ClusterLoadModel } from '../domain/behaviour';
import { failureManager } from './failureManager';

/**
 * Runtime Manager
 * Handles the actual state mutation of all devices in the facility.
 */
export class RuntimeManager {
  private static instance: RuntimeManager;
  private deviceStates: Map<EntityId, DeviceRuntimeState> = new Map();
  private clusters: Map<EntityId, Cluster> = new Map();

  private constructor() {}

  public static getInstance(): RuntimeManager {
    if (!RuntimeManager.instance) {
      RuntimeManager.instance = new RuntimeManager();
    }
    return RuntimeManager.instance;
  }

  public registerCluster(cluster: Cluster) {
    this.clusters.set(cluster.id, cluster);
  }

  public registerDevice(deviceId: EntityId, initialState?: Partial<DeviceRuntimeState>) {
    const state: DeviceRuntimeState = {
      healthScore: 1.0,
      utilization: 0.1,
      powerDrawW: 200, 
      thermalLoadBTU: 680,
      failureProbability: 0.001,
      workloadState: 'idle',
      throttlingState: 0,
      networkPressure: 0.0,
      maintenanceState: 'none',
      ...initialState
    };
    this.deviceStates.set(deviceId, state);
  }

  public registerDependency(providerId: EntityId, consumerId: EntityId, type: DependencyType) {
    failureManager.registerDependency(providerId, consumerId, type);
  }

  /**
   * Main Evolution Tick
   * 1. Propagate Cluster Demand -> Devices
   * 2. Evolve Device Physics (Power, Thermal, Health)
   * 3. Aggregate Upward -> Racks -> Facility
   */
  public tick(timeMs: number) {
    // 1. Failure Propagation
    failureManager.propagateFailures();

    // 2. Cluster Load Propagation
    this.propagateClusterLoads();

    // 3. Device Evolution & Aggregation
    this.deviceStates.forEach((state, deviceId) => {
      const nextState = this.evolveDeviceState(deviceId, state, timeMs);
      this.deviceStates.set(deviceId, nextState);
      
      // Notify control plane of leaf change
      controlPlane.updateDeviceState(deviceId, nextState);
    });

    // 4. Update Cluster Health based on device failures
    this.updateClusterHealth();
  }

  private propagateClusterLoads() {
    this.clusters.forEach(cluster => {
      const demand = cluster.runtime.workloadDemand;
      const distributions = ClusterLoadModel.distributeLoad(demand, cluster.deviceIds, cluster.runtime.imbalanceFactor);
      
      Object.entries(distributions).forEach(([deviceId, utilization]) => {
        const state = this.deviceStates.get(deviceId);
        if (state) {
          state.utilization = utilization;
        }
      });
    });
  }

  private updateClusterHealth() {
    this.clusters.forEach(cluster => {
      let totalHealth = 0;
      let failedCount = 0;
      cluster.deviceIds.forEach(id => {
        const state = this.deviceStates.get(id);
        if (state) {
          totalHealth += state.healthScore;
          if (state.workloadState === 'failed') failedCount++;
        }
      });
      
      cluster.runtime.healthScore = cluster.deviceIds.length > 0 ? totalHealth / cluster.deviceIds.length : 1.0;
      cluster.runtime.status = failedCount > cluster.deviceIds.length / 2 ? 'failed' : failedCount > 0 ? 'degraded' : 'healthy';
    });
  }

  private evolveDeviceState(deviceId: EntityId, state: DeviceRuntimeState, _timeMs: number): DeviceRuntimeState {
    const failure = failureManager.getFailureState(deviceId);
    
    // If failed, drop power and health immediately
    if (failure?.status === 'failed') {
      return {
        ...state,
        powerDrawW: 0,
        thermalLoadBTU: 0,
        healthScore: 0,
        workloadState: 'failed',
        failure
      };
    }

    // Rule 1: Utilization drives Power
    let nextPower = BehaviourRules.calculatePowerDraw(state.utilization);
    
    // Rule 2: Power drives Thermal
    let nextThermal = BehaviourRules.calculateThermalLoad(nextPower);
    
    // Rule 3: Thermal impacts Health
    let healthImpact = BehaviourRules.calculateHealthImpact(nextThermal);
    
    // Degradation impact
    if (failure?.status === 'degraded') {
       healthImpact += (failure.severity * 0.05);
       nextPower *= (1.0 - failure.severity * 0.2); // Efficiency loss
    }

    const nextHealth = Math.max(0, state.healthScore - healthImpact);

    // Rule 4: Risk index
    const nextRisk = BehaviourRules.calculateFailureRisk(state.utilization);

    return {
      ...state,
      powerDrawW: nextPower,
      thermalLoadBTU: nextThermal,
      healthScore: nextHealth,
      failureProbability: nextRisk,
      workloadState: state.utilization > 0.8 ? 'peak' : state.utilization > 0.1 ? 'active' : 'idle',
      failure
    };
  }

  public getDeviceState(deviceId: EntityId): DeviceRuntimeState | undefined {
    return this.deviceStates.get(deviceId);
  }
}

export const runtimeManager = RuntimeManager.getInstance();
