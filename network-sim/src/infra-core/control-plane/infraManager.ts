import type { Facility, DeviceRuntimeState, EntityId, RackRuntimeState, Incident, IncidentCategory, Severity } from '../domain/types';
import { v4 as uuidv4 } from 'uuid';
import { failureManager } from '../runtime/failureManager';

/**
 * Infrastructure Control Plane
 * Responsible for aggregating facility-wide metrics, health, and incident management.
 */
export class InfraControlPlane {
  private static instance: InfraControlPlane;
  private facility: Facility | null = null;
  private deviceStates: Map<EntityId, DeviceRuntimeState> = new Map();
  private rackStates: Map<EntityId, RackRuntimeState> = new Map();
  private activeIncidents: Incident[] = [];

  private constructor() {}

  public static getInstance(): InfraControlPlane {
    if (!InfraControlPlane.instance) {
      InfraControlPlane.instance = new InfraControlPlane();
    }
    return InfraControlPlane.instance;
  }

  public initialize(facility: Facility) {
    this.facility = facility;
  }

  public updateDeviceState(deviceId: EntityId, state: DeviceRuntimeState) {
    this.deviceStates.set(deviceId, state);
    this.runAggregation();
  }

  /**
   * Hierarchical Aggregation
   * Recomputes Rack and Facility states based on Device telemetry.
   */
  private runAggregation() {
    if (!this.facility) return;

    // Reset Rack Counters
    const newRackStates = new Map<EntityId, RackRuntimeState>();
    
    // Aggregates for Global Facility
    let globalPowerW = 0;
    let globalThermalBTU = 0;
    let totalHealth = 0;
    let deviceCount = 0;

    // Map devices back to racks for aggregation
    // In this phase, we use the deviceId as the rackId as established in Phase 1 simplification
    this.deviceStates.forEach((state, rackId) => {
      globalPowerW += state.powerDrawW;
      globalThermalBTU += state.thermalLoadBTU;
      totalHealth += state.healthScore;
      deviceCount++;

      // Compute Rack Stress Level
      // threshold: 25kW is hot, 15kW is warm
      let stress: 'normal' | 'warm' | 'hot' | 'critical' = 'normal';
      if (state.powerDrawW > 35000 || state.healthScore < 0.4) stress = 'critical';
      else if (state.powerDrawW > 25000) stress = 'hot';
      else if (state.powerDrawW > 15000) stress = 'warm';

      const failure = failureManager.getFailureState(rackId);
      const status = failure?.status || 'healthy';

      newRackStates.set(rackId, {
        totalPowerW: state.powerDrawW,
        totalThermalBTU: state.thermalLoadBTU,
        slotUtilization: state.utilization,
        redundancyMargin: 1.0 - (state.utilization * 0.5),
        stressLevel: stress,
        activeIncidents: (state.healthScore < 0.5 ? 1 : 0) + (failure ? 1 : 0),
        status
      });

      // Incident detection
      this.detectDeviceIncidents(rackId, state);
    });

    this.rackStates = newRackStates;

    // 3. Update Facility State
    const activeIncidents = failureManager.getActiveIncidents().filter(i => !i.resolved);
    const affectedCount = Array.from(newRackStates.values()).filter(r => r.status !== 'healthy').length;

    this.facility.runtime = {
      healthScore: deviceCount > 0 ? totalHealth / deviceCount : 1.0,
      capacityUtilization: globalPowerW / (this.facility.totalPowerCapacityW || 1),
      thermalStressIndex: globalThermalBTU / 5000000, 
      failureRiskIndex: this.calculateGlobalRisk(),
      activeIncidentCount: activeIncidents.length,
      failureImpactScore: deviceCount > 0 ? affectedCount / deviceCount : 0,
    };
  }

  private detectDeviceIncidents(entityId: EntityId, state: DeviceRuntimeState) {
    // Basic threshold rules
    if (state.utilization > 0.98) {
      this.raiseIncident(entityId, 'saturation', 'medium', `Rack ${entityId.slice(0,8)} saturation reached 98%.`);
    }
    if (state.healthScore < 0.5) {
      this.raiseIncident(entityId, 'failure', 'critical', `Component failure risk detected in Rack ${entityId.slice(0,8)}.`);
    }
    if (state.powerDrawW > 38000) {
      this.raiseIncident(entityId, 'overload', 'high', `Power ceiling breach in Rack ${entityId.slice(0,8)}.`);
    }
  }

  private raiseIncident(entityId: EntityId, category: IncidentCategory, severity: Severity, message: string) {
    if (this.activeIncidents.some(inc => inc.entityId === entityId && inc.category === category)) return;

    const incident: Incident = {
      id: uuidv4(),
      entityId,
      category,
      severity,
      message,
      timestamp: Date.now(),
      resolved: false,
      lifecycle: 'detected',
      affectedEntityIds: [entityId],
      propagationState: 'static'
    };
    this.activeIncidents.push(incident);
  }

  public injectFault(entityId: EntityId, category: IncidentCategory, severity: number) {
    return failureManager.injectFailure(entityId, category, severity);
  }

  public resolveFault(incidentId: string) {
    failureManager.resolveIncident(incidentId);
  }

  public getRackState(rackId: EntityId): RackRuntimeState | undefined {
    return this.rackStates.get(rackId);
  }

  private calculateGlobalRisk(): number {
    let risk = 0;
    this.deviceStates.forEach(s => risk += s.failureProbability);
    return this.deviceStates.size > 0 ? risk / this.deviceStates.size : 0;
  }

  public getGlobalMetrics() {
    if (!this.facility) return this.getFallbackMetrics();

    let totalPower = 0;
    let totalThermal = 0;
    this.rackStates.forEach(r => {
      totalPower += r.totalPowerW;
      totalThermal += r.totalThermalBTU;
    });

    return {
      totalPowerW: totalPower,
      totalThermalBTU: totalThermal,
      ...this.facility.runtime,
      activeIncidents: [...this.activeIncidents, ...failureManager.getActiveIncidents()].filter(i => !i.resolved)
    };
  }

  private getFallbackMetrics() {
    return {
      totalPowerW: 0,
      totalThermalBTU: 0,
      healthScore: 1.0,
      capacityUtilization: 0,
      thermalStressIndex: 0,
      failureRiskIndex: 0,
      activeIncidentCount: 0,
      activeIncidents: []
    };
  }
}

export const controlPlane = InfraControlPlane.getInstance();
