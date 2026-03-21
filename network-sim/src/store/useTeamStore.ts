import { create } from 'zustand';
import { useAuthStore } from './useAuthStore';

const API_BASE = 'http://localhost:8000/api/v1';

export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked' | 'cancelled';
export type MembershipStatus = 'active' | 'suspended';

export interface WorkspaceMember {
  id: string;
  user_id: string;
  user_email: string;
  workspace_id: string;
  role: string;
  status: MembershipStatus;
  invited_by: string | null;
  joined_at: string;
}

export interface Invitation {
  id: string;
  email: string;
  role: string;
  scope_type: string;
  scope_id: string;
  invited_by: string;
  status: InvitationStatus;
  expires_at: string;
  created_at: string;
  accepted_at: string | null;
  token?: string; // Only present immediately after creation
}

function authHeaders(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

interface TeamState {
  members: WorkspaceMember[];
  invitations: Invitation[];
  myRole: string;
  isLoading: boolean;
  error: string | null;
  lastCreatedToken: string | null; // ONE-TIME token shown after creation

  fetchMembers: (workspaceId: string) => Promise<void>;
  fetchInvitations: (workspaceId: string) => Promise<void>;
  createInvitation: (workspaceId: string, data: {
    email: string;
    role: string;
    scope_type: string;
    scope_id: string;
    expires_in_days: number;
  }) => Promise<Invitation | null>;
  revokeInvitation: (workspaceId: string, invitationId: string) => Promise<void>;
  clearError: () => void;
  clearLastToken: () => void;
}

export const useTeamStore = create<TeamState>((set, get) => ({
  members: [],
  invitations: [],
  myRole: 'infra_viewer',
  isLoading: false,
  error: null,
  lastCreatedToken: null,

  fetchMembers: async (workspaceId) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`${API_BASE}/invitations/workspace/${workspaceId}/members`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      set({ members: data });
    } catch (e: any) {
      set({ error: e.message });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchInvitations: async (workspaceId) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`${API_BASE}/invitations/workspace/${workspaceId}/invites`, {
        headers: authHeaders(),
      });
      if (res.status === 403) {
        set({ invitations: [] }); // Operator/Viewer — no access, fail silently
        return;
      }
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      set({ invitations: data });
    } catch (e: any) {
      set({ error: e.message });
    } finally {
      set({ isLoading: false });
    }
  },

  createInvitation: async (workspaceId, data) => {
    set({ isLoading: true, error: null, lastCreatedToken: null });
    try {
      const res = await fetch(`${API_BASE}/invitations/workspace/${workspaceId}/invite`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail ?? JSON.stringify(err));
      }
      const invite: Invitation = await res.json();
      // One-time token — store separately for display, then clear
      if (invite.token) set({ lastCreatedToken: invite.token });
      // Add to list without token (never show again)
      const safeInvite = { ...invite, token: undefined };
      set((s) => ({ invitations: [safeInvite, ...s.invitations] }));
      return invite;
    } catch (e: any) {
      set({ error: e.message });
      return null;
    } finally {
      set({ isLoading: false });
    }
  },

  revokeInvitation: async (workspaceId, invitationId) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(
        `${API_BASE}/invitations/workspace/${workspaceId}/invite/${invitationId}/revoke`,
        { method: 'POST', headers: authHeaders() }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail ?? 'Failed to revoke');
      }
      set((s) => ({
        invitations: s.invitations.map((inv) =>
          inv.id === invitationId ? { ...inv, status: 'revoked' } : inv
        ),
      }));
    } catch (e: any) {
      set({ error: e.message });
    } finally {
      set({ isLoading: false });
    }
  },

  clearError: () => set({ error: null }),
  clearLastToken: () => set({ lastCreatedToken: null }),
}));
