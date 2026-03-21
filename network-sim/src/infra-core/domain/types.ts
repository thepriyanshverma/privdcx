/**
 * Infrastructure Operating System — Core Domain Types
 */

export type EntityId = string;

export type EntityStatus = 'healthy' | 'degraded' | 'failed' | 'unknown';
export type DependencyType = 'power' | 'cooling' | 'fabric';

export interface FailureState {
  status: EntityStatus;
  causeType: IncidentCategory;
  severity: number;              // 0.0 to 1.0
  timestamp: number;
}

export interface DeviceRuntimeState {
  healthScore: number;           // 0.0 to 1.0
  utilization: number;           // 0.0 to 1.0 (Demand)
  powerDrawW: number;            // Watts
  thermalLoadBTU: number;        // BTU/hr
  failureProbability: number;    // 0.0 to 1.0
  workloadState: 'idle' | 'active' | 'peak' | 'failed';
  throttlingState: number;       // 0.0 (none) to 1.0 (max)
  networkPressure: number;       // 0.0 to 1.0
  maintenanceState: 'none' | 'scheduled' | 'active';
  failure?: FailureState;        // Phase 3: Explicit failure tracking
}

export interface RackRuntimeState {
  totalPowerW: number;
  totalThermalBTU: number;
  slotUtilization: number;
  redundancyMargin: number;      // 0.0 to 1.0
  stressLevel: 'normal' | 'warm' | 'hot' | 'critical';
  activeIncidents: number;
  status: EntityStatus;          // Phase 3
  redundancyConfig?: {           // Phase 3
    level: 'N+1' | '2N' | 'none';
    failoverCapacityW: number;
  };
}

export interface ClusterRuntimeState {
  workloadDemand: number;        // Normalized aggregate demand
  saturation: number;            // 0.0 to 1.0
  imbalanceFactor: number;       // 0.0 to 1.0 (Variability across nodes)
  healthScore: number;
  status: EntityStatus;          // Phase 3
}

export interface FacilityRuntimeState {
  healthScore: number;
  capacityUtilization: number;
  thermalStressIndex: number;
  failureRiskIndex: number;
  activeIncidentCount: number;
  failureImpactScore?: number;   // Phase 3 (Aggregate impact percentage)
  criticalZoneIds?: EntityId[];  // Phase 3
}

export type IncidentCategory = 'overload' | 'overheat' | 'saturation' | 'failure' | 'margin_breach' | 'manual' | 'power' | 'thermal' | 'hardware' | 'network';
export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentLifecycle = 'detected' | 'active' | 'propagated' | 'stabilized' | 'resolved';

export interface Incident {
  id: EntityId;
  entityId: EntityId;            // Device, Rack, etc.
  category: IncidentCategory;
  severity: Severity;
  message: string;
  timestamp: number;
  resolved: boolean;
  lifecycle: IncidentLifecycle;  // Phase 3
  affectedEntityIds: EntityId[]; // Phase 3: Cascading impact
  propagationState: 'static' | 'spreading' | 'contained'; // Phase 3
}

export interface Device {
  id: EntityId;
  type: 'server' | 'storage' | 'switch' | 'pdu' | 'accelerator';
  model: string;
  uSize: number;
  rackId: EntityId;
  tenantId: EntityId | null;
  runtime: DeviceRuntimeState;
}

export interface Rack {
  id: EntityId;
  rowId: EntityId;
  zoneId: EntityId;
  tenantId: EntityId | null;
  devices: Device[];
  maxPowerW: number;
  maxSlotsU: number;
  runtime: RackRuntimeState;
}

export interface Row {
  id: EntityId;
  zoneId: EntityId;
  rackIds: EntityId[];
  type: 'hot' | 'cold' | 'mixed';
}

export interface Zone {
  id: EntityId;
  facilityId: EntityId;
  name: string;
  type: 'compute' | 'storage' | 'network' | 'mixed';
  rowIds: EntityId[];
}

export interface Facility {
  id: EntityId;
  name: string;
  totalPowerCapacityW: number;
  zones: Zone[];
  runtime: FacilityRuntimeState;
}

export interface Tenant {
  id: EntityId;
  name: string;
  color: string;
  contractedPowerW: number;
}

export interface Allocation {
  id: EntityId;
  tenantId: EntityId;
  entityType: 'device' | 'rack' | 'cluster';
  entityId: EntityId;
  reservedAt: number;
}

export interface Cluster {
  id: EntityId;
  name: string;
  tenantId: EntityId;
  type: 'ai' | 'compute' | 'storage';
  deviceIds: EntityId[];
  runtime: ClusterRuntimeState;
}
