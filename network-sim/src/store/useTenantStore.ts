import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ─── Core Tenant Types ─────────────────────────────────────────────────────

export type TenantType = 'operator' | 'enterprise' | 'cloud' | 'team';

export interface Tenant {
  id: string;
  name: string;
  type: TenantType;
  parentTenantId?: string;
  color: string; // Hex color used for visual overlay
  description?: string;
  createdAt: number;
}

// ─── Physical Allocation ────────────────────────────────────────────────────

export type PhysicalResourceType = 'facility' | 'zone' | 'row' | 'rack' | 'equipment';

export interface PhysicalAllocation {
  id: string;
  tenantId: string;
  resourceType: PhysicalResourceType;
  resourceId: string;
  powerQuotaW: number;     // 0 = unlimited
  coolingQuotaW: number;   // 0 = unlimited
  leaseLabel?: string;     // e.g. "Lease A - 3yr"
}

// ─── Logical Allocation ─────────────────────────────────────────────────────

export type SlaTier = 'gold' | 'silver' | 'bronze';
export type WorkloadType = 'ai-training' | 'inference' | 'hpc' | 'storage' | 'general';

export interface LogicalAllocation {
  id: string;
  tenantId: string;
  clusterId: string;
  workloadType: WorkloadType;
  slaTier: SlaTier;
  costWeight: number; // 0.0–1.0, proportion of shared cost
}

// ─── Store State ────────────────────────────────────────────────────────────

interface TenantState {
  tenants: Record<string, Tenant>;
  physicalAllocations: PhysicalAllocation[];
  logicalAllocations: LogicalAllocation[];

  // Active filter for scoped views — null means 'show all'
  activeTenantFilter: string | null;

  // ── Tenant CRUD ──────────────────────────────────────────────────────────
  addTenant: (tenant: Omit<Tenant, 'id' | 'createdAt'>) => string;
  updateTenant: (id: string, updates: Partial<Omit<Tenant, 'id'>>) => void;
  removeTenant: (id: string) => void;

  // ── Physical Allocation ──────────────────────────────────────────────────
  assignPhysical: (
    tenantId: string,
    resourceType: PhysicalResourceType,
    resourceId: string,
    quotas?: { powerQuotaW?: number; coolingQuotaW?: number; leaseLabel?: string }
  ) => void;
  releasePhysical: (allocationId: string) => void;
  releasePhysicalByResource: (resourceType: PhysicalResourceType, resourceId: string) => void;

  // ── Logical Allocation ───────────────────────────────────────────────────
  assignLogical: (
    tenantId: string,
    clusterId: string,
    workloadType: WorkloadType,
    slaTier: SlaTier,
    costWeight: number
  ) => void;
  releaseLogical: (allocationId: string) => void;

  // ── Query Helpers ────────────────────────────────────────────────────────
  getEffectiveTenant: (
    resourceType: PhysicalResourceType,
    resourceId: string,
    // For walking up the hierarchy, provide parent IDs
    parentZoneId?: string,
    parentFacilityId?: string
  ) => Tenant | null;

  getTenantPhysicalAllocations: (tenantId: string) => PhysicalAllocation[];
  getTenantLogicalAllocations: (tenantId: string) => LogicalAllocation[];
  getAllocationForResource: (resourceType: PhysicalResourceType, resourceId: string) => PhysicalAllocation | null;

  // ── View Filter ──────────────────────────────────────────────────────────
  setActiveTenantFilter: (tenantId: string | null) => void;
}

// ─── Default Tenants (seed data) ────────────────────────────────────────────

const SEED_TENANTS: Record<string, Tenant> = {
  'tenant-operator-root': {
    id: 'tenant-operator-root',
    name: 'Facility Operator',
    type: 'operator',
    color: '#64748b', // slate — neutral root
    description: 'Root infrastructure owner. All unassigned resources inherit this tenant.',
    createdAt: Date.now(),
  }
};

// ─── Store ───────────────────────────────────────────────────────────────────

export const useTenantStore = create<TenantState>()(
  persist(
    (set, get) => ({
      tenants: SEED_TENANTS,
      physicalAllocations: [],
      logicalAllocations: [],
      activeTenantFilter: null,

      // ── Tenant CRUD ───────────────────────────────────────────────────────

      addTenant: (tenantDef) => {
        const id = `tenant-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        set(state => ({
          tenants: {
            ...state.tenants,
            [id]: { ...tenantDef, id, createdAt: Date.now() }
          }
        }));
        return id;
      },

      updateTenant: (id, updates) => set(state => ({
        tenants: state.tenants[id]
          ? { ...state.tenants, [id]: { ...state.tenants[id], ...updates } }
          : state.tenants
      })),

      removeTenant: (id) => set(state => {
        const next = { ...state.tenants };
        delete next[id];
        // Also remove all allocations for this tenant
        return {
          tenants: next,
          physicalAllocations: state.physicalAllocations.filter(a => a.tenantId !== id),
          logicalAllocations: state.logicalAllocations.filter(a => a.tenantId !== id),
          activeTenantFilter: state.activeTenantFilter === id ? null : state.activeTenantFilter
        };
      }),

      // ── Physical Allocation ───────────────────────────────────────────────

      assignPhysical: (tenantId, resourceType, resourceId, quotas = {}) => set(state => {
        // Remove any existing allocation for this resource first
        const filtered = state.physicalAllocations.filter(
          a => !(a.resourceType === resourceType && a.resourceId === resourceId)
        );
        const alloc: PhysicalAllocation = {
          id: `palloc-${Date.now()}`,
          tenantId,
          resourceType,
          resourceId,
          powerQuotaW: quotas.powerQuotaW ?? 0,
          coolingQuotaW: quotas.coolingQuotaW ?? 0,
          leaseLabel: quotas.leaseLabel
        };
        return { physicalAllocations: [...filtered, alloc] };
      }),

      releasePhysical: (id) => set(state => ({
        physicalAllocations: state.physicalAllocations.filter(a => a.id !== id)
      })),

      releasePhysicalByResource: (resourceType, resourceId) => set(state => ({
        physicalAllocations: state.physicalAllocations.filter(
          a => !(a.resourceType === resourceType && a.resourceId === resourceId)
        )
      })),

      // ── Logical Allocation ────────────────────────────────────────────────

      assignLogical: (tenantId, clusterId, workloadType, slaTier, costWeight) => set(state => {
        const filtered = state.logicalAllocations.filter(a => a.clusterId !== clusterId);
        const alloc: LogicalAllocation = {
          id: `lalloc-${Date.now()}`,
          tenantId, clusterId, workloadType, slaTier, costWeight
        };
        return { logicalAllocations: [...filtered, alloc] };
      }),

      releaseLogical: (id) => set(state => ({
        logicalAllocations: state.logicalAllocations.filter(a => a.id !== id)
      })),

      // ── Query Helpers ─────────────────────────────────────────────────────

      getEffectiveTenant: (resourceType, resourceId, parentZoneId, parentFacilityId) => {
        const { tenants, physicalAllocations } = get();

        // 1. Direct allocation on resource itself
        const direct = physicalAllocations.find(
          a => a.resourceType === resourceType && a.resourceId === resourceId
        );
        if (direct) return tenants[direct.tenantId] ?? null;

        // 2. Inherit from parent zone (for racks/equipment)
        if (parentZoneId) {
          const zoneAlloc = physicalAllocations.find(
            a => a.resourceType === 'zone' && a.resourceId === parentZoneId
          );
          if (zoneAlloc) return tenants[zoneAlloc.tenantId] ?? null;
        }

        // 3. Inherit from facility root
        if (parentFacilityId) {
          const facilityAlloc = physicalAllocations.find(
            a => a.resourceType === 'facility' && a.resourceId === parentFacilityId
          );
          if (facilityAlloc) return tenants[facilityAlloc.tenantId] ?? null;
        }

        // 4. Fall back to root operator tenant
        return tenants['tenant-operator-root'] ?? null;
      },

      getAllocationForResource: (resourceType, resourceId) => {
        return get().physicalAllocations.find(
          a => a.resourceType === resourceType && a.resourceId === resourceId
        ) ?? null;
      },

      getTenantPhysicalAllocations: (tenantId) =>
        get().physicalAllocations.filter(a => a.tenantId === tenantId),

      getTenantLogicalAllocations: (tenantId) =>
        get().logicalAllocations.filter(a => a.tenantId === tenantId),

      setActiveTenantFilter: (tenantId) => set({ activeTenantFilter: tenantId }),
    }),
    {
      name: 'infra-tenant-store-v1',
    }
  )
);
