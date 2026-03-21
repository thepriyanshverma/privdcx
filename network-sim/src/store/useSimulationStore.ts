import { create } from 'zustand';
import type { Packet } from '../types/network';

interface SimulationState {
  packets: Record<string, Packet>;
  isRunning: boolean;
  tickRateMs: number;
  
  // Actions
  addPacket: (packet: Packet) => void;
  removePacket: (id: string) => void;
  updatePacket: (id: string, updates: Partial<Packet>) => void;
  toggleSimulation: () => void;
  setTickRate: (ms: number) => void;
  stepSimulation: () => void; // Triggered by engine loop
}

export const useSimulationStore = create<SimulationState>((set) => ({
  packets: {},
  isRunning: false,
  tickRateMs: 16, // ~60fps target for smooth animation locally

  addPacket: (packet) => set((state) => ({ 
    packets: { ...state.packets, [packet.id]: packet } 
  })),

  removePacket: (id) => set((state) => {
    const newPackets = { ...state.packets };
    delete newPackets[id];
    return { packets: newPackets };
  }),

  updatePacket: (id, updates) => set((state) => {
    const pkt = state.packets[id];
    if (!pkt) return state;
    return {
      packets: { ...state.packets, [id]: { ...pkt, ...updates } }
    };
  }),

  toggleSimulation: () => set((state) => ({ isRunning: !state.isRunning })),
  
  setTickRate: (ms) => set({ tickRateMs: ms }),

  stepSimulation: () => set((state) => {
    // Engine ticks will call this to flush packet progress.
    // For now, we will just rely on the engine.ts to push updatePacket explicitly for logic.
    return state;
  })
}));
