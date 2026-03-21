import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface PanelState {
  x: number;
  y: number;
  isCollapsed: boolean;
  zIndex: number;
}

interface LayoutStore {
  panels: Record<string, PanelState>;
  topZIndex: number;
  updatePanelPosition: (id: string, x: number, y: number) => void;
  toggleCollapse: (id: string) => void;
  bringToFront: (id: string) => void;
  registerPanel: (id: string, defaultX: number, defaultY: number) => void;
  resetLayout: () => void;
}

export const useLayoutStore = create<LayoutStore>()(
  persist(
    (set) => ({
      panels: {},
      topZIndex: 500,
      
      updatePanelPosition: (id, x, y) => set((state) => ({
        panels: {
          ...state.panels,
          [id]: { ...state.panels[id], x, y }
        }
      })),
      
      toggleCollapse: (id) => set((state) => ({
        panels: {
          ...state.panels,
          [id]: { ...state.panels[id], isCollapsed: !state.panels[id]?.isCollapsed }
        }
      })),
      
      bringToFront: (id) => set((state) => {
        const newTop = state.topZIndex + 1;
        return {
          topZIndex: newTop,
          panels: {
            ...state.panels,
            [id]: { ...state.panels[id], zIndex: newTop }
          }
        };
      }),
      
      registerPanel: (id, defaultX, defaultY) => set((state) => {
        if (state.panels[id]) return state; // Already registered
        return {
          panels: {
            ...state.panels,
            [id]: { x: defaultX, y: defaultY, isCollapsed: false, zIndex: 500 }
          }
        };
      }),

      resetLayout: () => set(() => ({
        panels: {},
        topZIndex: 500
      }))
    }),
    {
      name: 'network-sim-layout-store-v2',
    }
  )
);
