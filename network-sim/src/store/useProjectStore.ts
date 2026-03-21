import { create } from 'zustand';

interface ProjectState {
  projectName: string;
  viewMode: '2d' | '3d' | 'control';

  // Cost Variables
  pricing: {
    routerCost: number;
    switchCost: number;
    serverCost: number;
    rackCost: number;
    powerCostPerKwH: number;
  };

  setViewMode: (mode: '2d' | '3d' | 'control') => void;
  updatePricing: (key: keyof ProjectState['pricing'], value: number) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  projectName: 'New Design',
  viewMode: '2d',
  
  pricing: {
    routerCost: 3000,
    switchCost: 1500,
    serverCost: 5000,
    rackCost: 2000,
    powerCostPerKwH: 0.12, // example rate
  },

  setViewMode: (mode) => set({ viewMode: mode }),
  updatePricing: (key, value) => set((state) => ({ 
    pricing: { ...state.pricing, [key]: value } 
  })),
}));
