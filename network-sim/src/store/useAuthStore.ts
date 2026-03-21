import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
  last_workspace_id?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  currentWorkspaceId: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  
  setAuth: (user: User, token: string) => void;
  setWorkspace: (workspaceId: string | null, skipSync?: boolean) => Promise<void>;
  logout: () => void;
  setError: (error: string | null) => void;
  setLoading: (isLoading: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      currentWorkspaceId: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      setAuth: (user, token) => set({ 
        user, 
        token, 
        isAuthenticated: true, 
        error: null 
      }),

      setWorkspace: async (workspaceId, skipSync = false) => {
        set({ currentWorkspaceId: workspaceId });
        
        if (!skipSync && workspaceId) {
          const { token } = get();
          if (!token) return;
          try {
            await fetch('http://localhost:8000/api/v1/tenants/auth/me', {
              method: 'PATCH',
              headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({ last_workspace_id: workspaceId }),
            });
          } catch (err) {
            console.error('Failed to sync workspace to backend', err);
          }
        }
      },
      
      logout: () => set({ 
        user: null, 
        token: null, 
        currentWorkspaceId: null,
        isAuthenticated: false, 
        error: null 
      }),
      
      setError: (error) => set({ error }),
      setLoading: (isLoading) => set({ isLoading }),
    }),
    {
      name: 'designdc-auth-storage',
      partialize: (state) => ({ 
        user: state.user, 
        token: state.token, 
        currentWorkspaceId: state.currentWorkspaceId,
        isAuthenticated: state.isAuthenticated 
      }),
    }
  )
);
