import { create } from 'zustand';
import { useClusterStore } from './useClusterStore';
import { useDeploymentToolsStore } from './useDeploymentToolsStore';

export interface Equipment {
  id: string;
  type: 'server' | 'storage' | 'switch' | 'pdu';
  uSize: number;
  slotPosition?: number; // Starting U-slot (0-41)
  powerLoadW: number;
  heatOutputBTU: number;
  failureRate: number;
}

export interface Rack {
  id: string;
  templateType: 'custom' | 'ai-cluster' | 'storage' | 'compute' | 'network';
  position: [number, number, number]; // 3D coordinates
  rotation: [number, number, number];
  equipment: Equipment[]; 
  maxPowerW: number;
  maxSlotsU: number;
}

export interface CoolingUnit {
  id: string;
  position: [number, number, number];
  capacityWatts: number;
}

export interface Aisle {
  id: string;
  type: 'hot' | 'cold';
  position: [number, number, number];
  size: [number, number];
}

export interface DeploymentZone {
  id: string;
  name: string;
  type: 'compute' | 'storage' | 'network' | 'mixed';
  boundary: { minX: number; minZ: number; maxX: number; maxZ: number };
  defaultTemplate?: Rack['templateType'];
  color: string;
}

export interface DeploymentBlock {
  id: string;
  name: string;
  rackIds: string[];
  templateType: Rack['templateType'];
  origin: [number, number, number];
}

export interface DeploymentRow {
  id: string;
  rackIds: string[];
  type: 'hot' | 'cold' | 'mixed';
}

export interface FacilityConfig {
  width: number; // meters
  length: number; // meters
  powerCapacityMW: number;
  coolingType: 'air' | 'liquid' | 'hybrid';
  redundancyTier: 1 | 2 | 3 | 4;
}

interface DataCenterState {
  racks: Record<string, Rack>;
  selectedRackId: string | null;
  coolingUnits: CoolingUnit[];
  aisles: Aisle[];
  zones: DeploymentZone[];
  blocks: DeploymentBlock[];
  rows: DeploymentRow[];
  facility: FacilityConfig;
  layoutVersion: number;
  metrics: {
    totalPowerW: number;
    totalHeatBTU: number;
    totalUUsed: number;
    totalUMax: number;
    overloadedRacksCount: number;
    thermalRiskRacksCount: number;
  };
  
  setSelectedRackId: (id: string | null) => void;
  setFacilityConfig: (config: Partial<FacilityConfig>) => void;
  generateLayout: () => Promise<void>;
  fetchRacks: () => Promise<void>;
  clearLayout: () => void;
  
  // Batch Operations
  batchSetRackTemplate: (rackIds: string[], templateType: Rack['templateType']) => void;
  batchClearEquipment: (rackIds: string[]) => void;
  removeRacks: (ids: string[]) => void;
  batchAddEquipment: (rackIds: string[], equipment: Omit<Equipment, 'id'>) => void;
  
  // Zone & Block Management
  addZone: (zone: Omit<DeploymentZone, 'id'>) => void;
  removeZone: (id: string) => void;
  addBlock: (block: Omit<DeploymentBlock, 'id'>) => void;
  replicateBlock: (blockId: string, offset: [number, number, number]) => void;
  detectRows: () => void;
  
  addRack: (rack: Rack) => void;
  removeRack: (id: string) => void;
  moveRack: (id: string, position: [number, number, number]) => void;
  cloneRack: (id: string, newPosition: [number, number, number]) => string | undefined;
  setRackTemplate: (rackId: string, templateType: Rack['templateType']) => void;
  addEquipmentToRack: (rackId: string, equipment: Equipment) => void;
  removeEquipmentFromRack: (rackId: string, equipmentId: string) => void;
  
  addCoolingUnit: (unit: CoolingUnit) => void;

  // --- Infrastructure Metrics System ---
  recalculateGlobalMetrics: () => void;
}

// Default equipment sets per template type — used by batchSetRackTemplate for mass deployment
const TEMPLATE_DEFAULTS: Record<Rack['templateType'], { maxPowerW: number; equipment: Omit<Equipment, 'id'>[] }> = {
  'ai-cluster': {
    maxPowerW: 40000,
    equipment: [
      { type: 'server', uSize: 10, powerLoadW: 10000, heatOutputBTU: 34100, failureRate: 0.025 },
      { type: 'server', uSize: 4,  powerLoadW: 3500,  heatOutputBTU: 11935, failureRate: 0.015 },
      { type: 'switch', uSize: 1,  powerLoadW: 450,   heatOutputBTU: 1535,  failureRate: 0.004 },
    ]
  },
  'compute': {
    maxPowerW: 20000,
    equipment: [
      { type: 'server', uSize: 2, powerLoadW: 700, heatOutputBTU: 2387, failureRate: 0.01 },
      { type: 'server', uSize: 2, powerLoadW: 700, heatOutputBTU: 2387, failureRate: 0.01 },
      { type: 'server', uSize: 2, powerLoadW: 700, heatOutputBTU: 2387, failureRate: 0.01 },
      { type: 'switch', uSize: 1, powerLoadW: 180, heatOutputBTU: 614,  failureRate: 0.003 },
    ]
  },
  'storage': {
    maxPowerW: 15000,
    equipment: [
      { type: 'storage', uSize: 4, powerLoadW: 1800, heatOutputBTU: 6138, failureRate: 0.006 },
      { type: 'storage', uSize: 4, powerLoadW: 1800, heatOutputBTU: 6138, failureRate: 0.006 },
      { type: 'storage', uSize: 4, powerLoadW: 1800, heatOutputBTU: 6138, failureRate: 0.006 },
      { type: 'pdu',     uSize: 1, powerLoadW: 200,  heatOutputBTU: 682,  failureRate: 0.002 },
    ]
  },
  'network': {
    maxPowerW: 5000,
    equipment: [
      { type: 'switch', uSize: 2, powerLoadW: 800, heatOutputBTU: 2728, failureRate: 0.004 },
      { type: 'switch', uSize: 2, powerLoadW: 800, heatOutputBTU: 2728, failureRate: 0.004 },
      { type: 'switch', uSize: 1, powerLoadW: 300, heatOutputBTU: 1023, failureRate: 0.003 },
    ]
  },
  'custom': { maxPowerW: 10000, equipment: [] }
};

const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || "http://localhost:8000/api/v1";

export const useDataCenterStore = create<DataCenterState>((set, get) => ({
  racks: {},
  selectedRackId: null,
  coolingUnits: [],
  aisles: [],
  zones: [],
  blocks: [],
  rows: [],
  layoutVersion: 0,
  metrics: {
    totalPowerW: 0,
    totalHeatBTU: 0,
    totalUUsed: 0,
    totalUMax: 0,
    overloadedRacksCount: 0,
    thermalRiskRacksCount: 0
  },
  facility: {
    width: 20,
    length: 30,
    powerCapacityMW: 2,
    coolingType: 'air',
    redundancyTier: 3,
  },

  setFacilityConfig: (config) =>
    set((state) => ({ facility: { ...state.facility, ...config } })),

  clearLayout: () => undefined, // Assigned properly later

  setSelectedRackId: (id) => set({ selectedRackId: id }),

  fetchRacks: async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/facilities/fac-1/racks`);
      const data = await res.json();
      const newRacks: Record<string, Rack> = {};
      data.forEach((r: any) => {
        newRacks[r.id] = {
          id: r.id,
          templateType: r.template_type || 'custom',
          position: [r.pos_x, r.pos_y, r.pos_z],
          rotation: [0, r.rotation_y || 0, 0], // Map backend rotation_y
          equipment: r.equipment ? r.equipment.map((eq: any) => ({
            id: eq.id,
            type: eq.type,
            uSize: eq.u_size,
            slotPosition: eq.slot_position,
            powerLoadW: eq.specifications?.powerLoadW || 500,
            heatOutputBTU: eq.specifications?.heatOutputBTU || 1700,
            failureRate: 0.01
          })) : [],
          maxPowerW: r.max_power_w,
          maxSlotsU: r.max_slots_u
        };
      });
      set({ racks: newRacks, layoutVersion: get().layoutVersion + 1 });
      console.log(`[Proj] Synced ${Object.keys(newRacks).length} racks from Infra Domain.`);
    } catch (e) {
      console.error("[Proj] Failed to sync racks from backend", e);
    }
  },

  generateLayout: async () => {
    console.log("[Proj] Dispatching layout orchestration to Infra Runtime...");
    try {
      // First ensure the facility exists in the backend DB
      const { facility } = get();
      await fetch(`${API_BASE_URL}/facilities/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'fac-1',
          name: 'Main Facility',
          width: facility.width,
          length: facility.length,
          max_power_mw: facility.powerCapacityMW,
          cooling_type: facility.coolingType
        })
      }).catch(() => {}); // Ignore if already exists

      // Trigger auto-layout generation
      const res = await fetch(`${API_BASE_URL}/facilities/fac-1/generate-layout`, {
        method: 'POST'
      });
      
      if (res.ok) {
        // Sync the projection layer downstream
        useDeploymentToolsStore.getState().clearSelection();
        set({ selectedRackId: null, aisles: [], zones: [], blocks: [], rows: [] });
        await get().fetchRacks();
        
        // Compute UI derived states locally since the graph engine is not fully hooked to websocket yet
        get().detectRows();
        get().recalculateGlobalMetrics();
      }
    } catch (e) {
      console.error("[Proj] Failed to orchestrate layout", e);
    }
  },

  batchSetRackTemplate: (rackIds, templateType) => {
    set((state) => {
      const defaults = TEMPLATE_DEFAULTS[templateType];
      const nextRacks = { ...state.racks };
      rackIds.forEach(id => {
        const rack = nextRacks[id];
        if (rack) {
          // Safety: Skip if it's the same template AND has same gear (allows refreshing gear if click again)
          // Removed strict length check to allow some flexibility if user wants to reset a rack to its template default
          nextRacks[id] = {
            ...rack,
            templateType,
            maxPowerW: defaults.maxPowerW,
            equipment: defaults.equipment.map(eq => ({ ...eq, id: crypto.randomUUID() }))
          };
        }
      });
      return { racks: nextRacks };
    });
    get().recalculateGlobalMetrics();
  },

  batchClearEquipment: (rackIds) => {
    set((state) => {
      const nextRacks = { ...state.racks };
      rackIds.forEach(id => {
        if (nextRacks[id]) {
          nextRacks[id] = { ...nextRacks[id], equipment: [] };
        }
      });
      return { racks: nextRacks };
    });
    get().recalculateGlobalMetrics();
  },

  removeRacks: (ids) => {
    const dtStore = useDeploymentToolsStore.getState();
    const newSelection = new Set(dtStore.selectionSet);
    let changed = false;
    ids.forEach(id => {
      if (newSelection.has(id)) {
        newSelection.delete(id);
        changed = true;
      }
    });
    if (changed) dtStore.setSelection(Array.from(newSelection));

    set((state) => {
      const nextRacks = { ...state.racks };
      ids.forEach(id => delete nextRacks[id]);

      return { 
        racks: nextRacks, 
        selectedRackId: ids.includes(state.selectedRackId || '') ? null : state.selectedRackId,
        layoutVersion: state.layoutVersion + 1 
      };
    });
    get().detectRows();
    get().recalculateGlobalMetrics();
  },

  batchAddEquipment: (rackIds, equipment) => {
    set((state) => {
      const nextRacks = { ...state.racks };
      rackIds.forEach(id => {
        if (nextRacks[id]) {
          const currentU = nextRacks[id].equipment.reduce((acc, eq) => acc + eq.uSize, 0);
          if (currentU + equipment.uSize <= nextRacks[id].maxSlotsU) {
            nextRacks[id] = {
              ...nextRacks[id],
              equipment: [...nextRacks[id].equipment, { ...equipment, id: crypto.randomUUID() }]
            };
          }
        }
      });
      return { racks: nextRacks };
    });
    get().recalculateGlobalMetrics();
  },

  detectRows: () => set((state) => {
    const racks = Object.values(state.racks);
    const rows: DeploymentRow[] = [];
    const processed = new Set<string>();

    // Simple proximity detection: racks within 10cm on X are in same row
    racks.forEach(rack => {
      if (processed.has(rack.id)) return;
      
      const rowRacks = racks.filter(r => 
        Math.abs(r.position[0] - rack.position[0]) < 0.1 && 
        Math.abs(r.position[1] - rack.position[1]) < 0.1
      );

      if (rowRacks.length > 2) {
        rowRacks.forEach(r => processed.add(r.id));
        rows.push({
          id: `row-${rack.id}`,
          rackIds: rowRacks.map(r => r.id),
          type: 'mixed'
        });
      }
    });

    return { rows };
  }),

  addZone: (zoneDef) => set((state) => ({
    zones: [...state.zones, { ...zoneDef, id: `zone-${Date.now()}` }]
  })),

  removeZone: (id) => set((state) => ({
    zones: state.zones.filter(z => z.id !== id)
  })),

  addBlock: (blockDef) => set((state) => ({
    blocks: [...state.blocks, { ...blockDef, id: `block-${Date.now()}` }]
  })),

  replicateBlock: (blockId, offset) => {
    const { blocks, racks } = get();
    const sourceBlock = blocks.find(b => b.id === blockId);
    if (!sourceBlock) return;

    const newRackBatch: Record<string, Rack> = {};
    const newRackIds: string[] = [];

    sourceBlock.rackIds.forEach(originalId => {
      const originalRack = racks[originalId];
      if (!originalRack) return;

      const newId = `rack-replica-${Date.now()}-${originalId}`;
      const newPos: [number, number, number] = [
        originalRack.position[0] + offset[0],
        originalRack.position[1] + offset[1],
        originalRack.position[2] + offset[2]
      ];

      // Boundary check: Don't place racks outside the facility dimensions
      const { facility } = get();
      const halfW = facility.width / 2;
      const halfL = facility.length / 2;
      if (Math.abs(newPos[0]) > halfW || Math.abs(newPos[2]) > halfL) {
        console.warn(`Block replication skipped rack ${originalId} - Out of boundaries.`);
        return;
      }

      newRackBatch[newId] = {
        ...originalRack,
        id: newId,
        position: newPos,
        equipment: originalRack.equipment.map(eq => ({ ...eq, id: crypto.randomUUID() }))
      };
      newRackIds.push(newId);
    });

    set((state) => ({
      racks: { ...state.racks, ...newRackBatch },
      layoutVersion: state.layoutVersion + 1,
      blocks: [...state.blocks, {
        id: `block-replica-${Date.now()}`,
        name: `${sourceBlock.name} (Copy)`,
        rackIds: newRackIds,
        templateType: sourceBlock.templateType,
        origin: [
          sourceBlock.origin[0] + offset[0],
          sourceBlock.origin[1] + offset[1],
          sourceBlock.origin[2] + offset[2]
        ]
      }]
    }));
  },
  addRack: (rack) => {
    set((state) => ({ racks: { ...state.racks, [rack.id]: rack }, layoutVersion: state.layoutVersion + 1 }));
    get().recalculateGlobalMetrics();
  },
  removeRack: (id) => {
    const dtStore = useDeploymentToolsStore.getState();
    if (dtStore.selectionSet.has(id)) {
      const nextSelection = new Set(dtStore.selectionSet);
      nextSelection.delete(id);
      dtStore.setSelection(Array.from(nextSelection));
    }

    set((state) => {
      const newRacks = { ...state.racks };
      delete newRacks[id];

      return { 
        racks: newRacks, 
        selectedRackId: state.selectedRackId === id ? null : state.selectedRackId,
        layoutVersion: state.layoutVersion + 1 
      };
    });
    get().detectRows();
    get().recalculateGlobalMetrics();
  },
  moveRack: (id, position) => set((state) => {
    const rack = state.racks[id];
    if (!rack) return state;
    return {
      racks: {
        ...state.racks,
        [id]: { ...rack, position }
      }
    };
  }),
  cloneRack: (id, newPosition) => {
    const rack = get().racks[id];
    if (!rack) return undefined;
    const newId = crypto.randomUUID();
    const clonedRack: Rack = {
      ...rack,
      id: newId,
      position: newPosition,
      equipment: rack.equipment.map(eq => ({ ...eq, id: crypto.randomUUID() }))
    };
    get().addRack(clonedRack); // This will bump layoutVersion implicitly
    return newId;
  },

  setRackTemplate: (rackId, templateType) => {
    set((state) => {
      const rack = state.racks[rackId];
      if (!rack) return state;
      let maxPowerW = rack.maxPowerW;
      if (templateType === 'ai-cluster') maxPowerW = 40000;
      if (templateType === 'storage') maxPowerW = 15000;
      if (templateType === 'network') maxPowerW = 5000;
      if (templateType === 'compute') maxPowerW = 20000;

      return {
        racks: {
          ...state.racks,
          [rackId]: { ...rack, templateType, maxPowerW, equipment: [] }
        }
      };
    });
    get().recalculateGlobalMetrics();
  },

  addEquipmentToRack: (rackId, equipment) => {
    set((state) => {
      const rack = state.racks[rackId];
      if (!rack) return state;
      return {
        racks: {
          ...state.racks,
          [rackId]: { ...rack, equipment: [...rack.equipment, equipment] }
        }
      };
    });
    get().recalculateGlobalMetrics();
  },

  removeEquipmentFromRack: (rackId, equipmentId) => {
    set((state) => {
      const rack = state.racks[rackId];
      if (!rack) return state;
      return {
        racks: {
          ...state.racks,
          [rackId]: { ...rack, equipment: rack.equipment.filter(eq => eq.id !== equipmentId) }
        }
      };
    });
    get().recalculateGlobalMetrics();
  },
  
  addCoolingUnit: (unit) => set((state) => ({ coolingUnits: [...state.coolingUnits, unit] })),

  recalculateGlobalMetrics: () => set((state) => {
    let totalPowerW = 0;
    let totalHeatBTU = 0;
    let totalUUsed = 0;
    let totalUMax = 0;
    let overloadedRacksCount = 0;
    let thermalRiskRacksCount = 0;

    Object.values(state.racks).forEach(rack => {
      let rPower = 0;
      let rHeat = 0;
      let rU = 0;

      rack.equipment.forEach(eq => {
        rPower += eq.powerLoadW;
        rHeat += eq.heatOutputBTU;
        rU += eq.uSize;
      });

      totalPowerW += rPower;
      totalHeatBTU += rHeat;
      totalUUsed += rU;
      totalUMax += rack.maxSlotsU;

      if (rPower > rack.maxPowerW * 0.9) overloadedRacksCount++;
      if (rHeat > 35000) thermalRiskRacksCount++; // Simple heuristic for thermal risk threshold
    });

    // --- Inject Logical Cluster Analytical Workloads ---
    const clusters = useClusterStore.getState().clusters;
    // We attribute the cluster power and heat on top of the physical equipment
    Object.values(clusters).forEach(cluster => {
      cluster.assignedRacks.forEach(assignment => {
        const rack = state.racks[assignment.rackId];
        if (rack) {
          // A cluster node adds its max power scaled by the current load multiplier
          const activeNodes = assignment.nodeCount;
          const nodeBasePower = cluster.powerPerNodeW;
          // Approximate heat: 1 Watt = 3.41 BTU/hr
          const nodeBaseHeat = cluster.powerPerNodeW * 3.41;
          
          const clusterAddedPower = activeNodes * nodeBasePower * cluster.currentLoadMultiplier;
          const clusterAddedHeat = activeNodes * nodeBaseHeat * cluster.currentLoadMultiplier;
          
          totalPowerW += clusterAddedPower;
          totalHeatBTU += clusterAddedHeat;
        }
      });
    });

    return {
      metrics: {
        totalPowerW,
        totalHeatBTU,
        totalUUsed,
        totalUMax,
        overloadedRacksCount,
        thermalRiskRacksCount
      }
    };
  })
}));
