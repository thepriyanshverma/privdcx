import { create } from 'zustand';
import { useAuthStore } from './useAuthStore';

export interface DashboardOverview {
  facilities: any[];
  racks: any[];
  alert_status: {
    running: boolean;
    is_paused: boolean;
    rule_count: number;
  };
  metrics: {
    grid_load_mw: number;
    avg_inlet_temp_c: number;
    avg_risk_index: number;
  };
  runtime_snapshot: any;
}

interface TelemetryState {
  overview: DashboardOverview | null;
  isLoading: boolean;
  error: string | null;
  
  fetchOverview: () => Promise<void>;
  startPolling: (intervalMs?: number) => () => void;
}

const API_BASE_URL = "http://localhost:8000/api/v1";

export const useTelemetryStore = create<TelemetryState>((set, get) => ({
  overview: null,
  isLoading: false,
  error: null,

  fetchOverview: async () => {
    const { token } = useAuthStore.getState();
    if (!token) return;

    try {
      const response = await fetch(`${API_BASE_URL}/dashboard/overview`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          useAuthStore.getState().logout();
        }
        throw new Error('Failed to fetch dashboard overview');
      }
      
      const data = await response.json();
      set({ overview: data, error: null });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  startPolling: (intervalMs = 5000) => {
    const interval = setInterval(() => {
      get().fetchOverview();
    }, intervalMs);
    
    // Initial fetch
    get().fetchOverview();
    
    return () => clearInterval(interval);
  }
}));
