import { create } from 'zustand';

export type WorkloadProfile = 'steady' | 'bursty' | 'periodic';
export type ClusterType = 'ai' | 'compute' | 'storage' | 'mixed';

export interface Cluster {
  id: string;
  name: string;
  type: ClusterType;
  nodeCount: number;
  powerPerNodeW: number;
  workloadProfile: WorkloadProfile;
  color: string;           // Used for the color band in 3D
  assignedRacks: { rackId: string, nodeCount: number }[]; // Explicit distribution
  
  // Real-time analytical simulation state
  currentLoadMultiplier: number; // e.g. 0.0 to 1.0 representing active CPU/workload usage
}

interface ClusterState {
  clusters: Record<string, Cluster>;
  
  addCluster: (cluster: Cluster) => void;
  removeCluster: (id: string) => void;
  updateCluster: (id: string, updates: Partial<Cluster>) => void;
  
  // Simulation tick hook (Sync with core engine)
  tickSimulation: (timeMs: number) => void;
}

export const useClusterStore = create<ClusterState>((set) => ({
  clusters: {},

  addCluster: (cluster) => set((state) => ({ 
    clusters: { ...state.clusters, [cluster.id]: cluster } 
  })),

  removeCluster: (id) => set((state) => {
    const newClusters = { ...state.clusters };
    delete newClusters[id];
    return { clusters: newClusters };
  }),

  updateCluster: (id, updates) => set((state) => {
    const c = state.clusters[id];
    if (!c) return state;
    return {
      clusters: { ...state.clusters, [id]: { ...c, ...updates } }
    };
  }),

  // Simulation tick hook (Sync with core engine)
  tickSimulation: (_timeMs: number) => {
    // In Phase 2, the core logic moves to RuntimeManager.
    // This store remains a registry for cluster metadata.
  }
}));
