import { create } from 'zustand';
import { useAuthStore } from './useAuthStore';

const API_BASE = 'http://localhost:8000/api/v1';

export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';
export type ScopeType = 'org' | 'workspace' | 'logical_space';

export interface Invitation {
  id: string;
  email: string;
  role: string;
  scope_type: ScopeType;
  scope_id: string;
  invited_by: string;
  token: string;
  status: InvitationStatus;
  expires_at: string;
  created_at: string;
  accepted_at: string | null;
}

interface InvitationState {
  invitations: Invitation[];
  isLoading: boolean;
  error: string | null;
  
  fetchInvitations: (scopeId: string) => Promise<void>;
  createInvitation: (data: {
    email: string;
    role: string;
    scope_type: ScopeType;
    scope_id: string;
    expires_in_days?: number;
  }) => Promise<Invitation | null>;
  revokeInvitation: (token: string) => Promise<void>;
  acceptInvitation: (token: string) => Promise<void>;
  clearError: () => void;
}

function getAuthHeaders(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export const useInvitationStore = create<InvitationState>((set, get) => ({
  invitations: [],
  isLoading: false,
  error: null,

  fetchInvitations: async (scopeId: string) => {
    set({ isLoading: true, error: null });
    try {
      const resp = await fetch(
        `${API_BASE}/invitations/invitations?scope_id=${scopeId}`,
        { headers: getAuthHeaders() }
      );
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();
      set({ invitations: data });
    } catch (err: any) {
      set({ error: err.message });
    } finally {
      set({ isLoading: false });
    }
  },

  createInvitation: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const resp = await fetch(`${API_BASE}/invitations/invitations`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const newInvite = await resp.json();
      set((s) => ({ invitations: [newInvite, ...s.invitations] }));
      return newInvite;
    } catch (err: any) {
      set({ error: err.message });
      return null;
    } finally {
      set({ isLoading: false });
    }
  },

  revokeInvitation: async (token: string) => {
    set({ isLoading: true, error: null });
    try {
      const resp = await fetch(`${API_BASE}/invitations/invitations/revoke`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ token }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      // Update local state
      set((s) => ({
        invitations: s.invitations.map((inv) =>
          inv.token === token ? { ...inv, status: 'revoked' } : inv
        ),
      }));
    } catch (err: any) {
      set({ error: err.message });
    } finally {
      set({ isLoading: false });
    }
  },

  acceptInvitation: async (token: string) => {
    set({ isLoading: true, error: null });
    try {
      const resp = await fetch(`${API_BASE}/invitations/invitations/accept`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ token }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      set((s) => ({
        invitations: s.invitations.map((inv) =>
          inv.token === token ? { ...inv, status: 'accepted' } : inv
        ),
      }));
    } catch (err: any) {
      set({ error: err.message });
    } finally {
      set({ isLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
