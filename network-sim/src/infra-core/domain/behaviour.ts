import type { DeviceRuntimeState, ClusterRuntimeState, EntityId } from './types';

/**
 * Infrastructure Behaviour Rules
 * 
 * Defines the deterministic physics of the digital twin.
 */
export const BehaviourRules = {
  // Utilization drives Power Draw (Linear + Base Load)
  calculatePowerDraw: (utilization: number, basePower: number = 150, maxPower: number = 450): number => {
    return basePower + (utilization * (maxPower - basePower));
  },

  // Power Draw drives Thermal Load (Watts to BTU/hr)
  calculateThermalLoad: (powerW: number): number => {
    return powerW * 3.41214163; // Standard conversion
  },

  // Thermal Load impacts Health degradation over time
  calculateHealthImpact: (thermalBTU: number, thresholdBTU: number = 1500): number => {
    if (thermalBTU <= thresholdBTU) return 0;
    // Exponential degradation above threshold
    return Math.pow((thermalBTU - thresholdBTU) / thresholdBTU, 2) * 0.005;
  },

  // Utilization increases failure probability
  calculateFailureRisk: (utilization: number): number => {
    if (utilization < 0.8) return 0.0001;
    return 0.0001 + Math.pow(utilization - 0.8, 2);
  }
};

/**
 * Cluster Load Propagation
 * 
 * Distributes aggregate demand across a set of device IDs.
 */
export const ClusterLoadModel = {
  distributeLoad: (
    demand: number, 
    deviceIds: EntityId[], 
    imbalanceFactor: number = 0.1
  ): Record<EntityId, number> => {
    if (deviceIds.length === 0) return {};
    
    const baseShare = demand / deviceIds.length;
    const distribution: Record<EntityId, number> = {};

    deviceIds.forEach(id => {
      // Add deterministic "jitter" based on ID to simulate uneven balancing
      const jitter = (parseInt(id.slice(-2), 16) / 255 - 0.5) * imbalanceFactor;
      distribution[id] = Math.max(0, Math.min(1.0, baseShare + jitter));
    });

    return distribution;
  }
};
