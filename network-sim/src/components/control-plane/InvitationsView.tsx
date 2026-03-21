import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UserPlus, Copy, CheckCircle2, XCircle, Clock, Mail, Shield,
  Users, RefreshCw, Plus, AlertTriangle, Trash2, Tag, Building2
} from 'lucide-react';
import { useInvitationStore, type Invitation, type ScopeType } from '../../store/useInvitationStore';
import { useAuthStore } from '../../store/useAuthStore';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getExpiryInfo(expiresAt: string): { label: string; color: string; urgent: boolean } {
  const now = new Date();
  const expiry = new Date(expiresAt);
  const diffMs = expiry.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffHours / 24;

  if (diffMs <= 0) return { label: 'Expired', color: 'text-red-400', urgent: true };
  if (diffHours < 24) return { label: `${Math.round(diffHours)}h left`, color: 'text-orange-400', urgent: true };
  if (diffDays < 3) return { label: `${Math.round(diffDays)}d left`, color: 'text-yellow-400', urgent: false };
  return { label: `${Math.round(diffDays)}d left`, color: 'text-green-400', urgent: false };
}

function StatusBadge({ status }: { status: Invitation['status'] }) {
  const config = {
    pending: { color: 'bg-blue-500/10 text-blue-400 border-blue-500/20', label: 'Pending' },
    accepted: { color: 'bg-green-500/10 text-green-400 border-green-500/20', label: 'Accepted' },
    expired: { color: 'bg-red-500/10 text-red-400 border-red-500/20', label: 'Expired' },
    revoked: { color: 'bg-gray-500/10 text-gray-400 border-gray-500/20', label: 'Revoked' },
  }[status] ?? { color: 'bg-gray-500/10 text-gray-400 border-gray-500/20', label: status };

  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${config.color}`}>
      {config.label}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    org_owner: 'text-purple-300 bg-purple-500/10 border-purple-500/20',
    workspace_owner: 'text-blue-300 bg-blue-500/10 border-blue-500/20',
    infra_architect: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20',
    infra_operator: 'text-green-300 bg-green-500/10 border-green-500/20',
    infra_viewer: 'text-gray-300 bg-gray-500/10 border-gray-500/20',
  };
  return (
    <span className={`text-xs font-mono px-2 py-0.5 rounded border ${colors[role] ?? 'text-gray-300 bg-gray-500/10 border-gray-500/20'}`}>
      {role}
    </span>
  );
}

// ─── Token Code Box ───────────────────────────────────────────────────────────

function TokenCodeBox({ token, status }: { token: string; status: Invitation['status'] }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [token]);

  const isActive = status === 'pending';

  return (
    <div className={`relative rounded-lg border ${isActive ? 'border-blue-500/30 bg-[#0d1a2d]' : 'border-[#2D343F] bg-[#0B0F14] opacity-50'} p-3 font-mono`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 overflow-hidden">
          <p className="text-[10px] text-[#4A5568] uppercase tracking-widest mb-1">Invitation Code</p>
          <p className={`text-xs break-all leading-relaxed ${isActive ? 'text-cyan-300' : 'text-gray-500'}`}>
            {token}
          </p>
        </div>
        {isActive && (
          <button
            onClick={handleCopy}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 transition-colors"
            title="Copy code"
          >
            {copied ? (
              <CheckCircle2 className="w-4 h-4 text-green-400" />
            ) : (
              <Copy className="w-4 h-4 text-blue-400" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Invitation Card ──────────────────────────────────────────────────────────

function InvitationCard({
  invitation,
  onRevoke,
}: {
  invitation: Invitation;
  onRevoke: (token: string) => void;
}) {
  const expiry = getExpiryInfo(invitation.expires_at);
  const isActive = invitation.status === 'pending';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`rounded-xl border p-4 space-y-3 transition-all ${
        isActive
          ? 'bg-[#0F1720] border-[#2D343F] hover:border-blue-500/30'
          : 'bg-[#0B0F14] border-[#1A2030] opacity-70'
      }`}
    >
      {/* Header Row */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <Mail className="w-3.5 h-3.5 text-[#4A5568]" />
            <span className="text-sm font-medium text-white">{invitation.email}</span>
            <StatusBadge status={invitation.status} />
          </div>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <RoleBadge role={invitation.role} />
            <span className="text-xs text-[#4A5568]">
              {invitation.scope_type === 'workspace' ? 'Workspace' :
               invitation.scope_type === 'org' ? 'Organization' : 'Logical Space'}
            </span>
          </div>
        </div>

        {isActive && (
          <button
            onClick={() => onRevoke(invitation.token)}
            className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-red-400/70 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all"
            title="Revoke invitation"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Token Code Box */}
      <TokenCodeBox token={invitation.token} status={invitation.status} />

      {/* Footer Meta */}
      <div className="flex items-center justify-between text-xs text-[#4A5568]">
        <span>Created {new Date(invitation.created_at).toLocaleDateString()}</span>
        {invitation.status === 'pending' && (
          <span className={`flex items-center gap-1 font-semibold ${expiry.color}`}>
            {expiry.urgent && <AlertTriangle className="w-3 h-3" />}
            <Clock className="w-3 h-3" />
            {expiry.label}
          </span>
        )}
        {invitation.status === 'accepted' && invitation.accepted_at && (
          <span className="text-green-400">
            ✓ Accepted {new Date(invitation.accepted_at).toLocaleDateString()}
          </span>
        )}
      </div>
    </motion.div>
  );
}

// ─── Create Invitation Form ───────────────────────────────────────────────────

interface CreateFormProps {
  scopeId: string;
  onClose: () => void;
}

function CreateInvitationForm({ scopeId, onClose }: CreateFormProps) {
  const { createInvitation, isLoading } = useInvitationStore();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('infra_architect');
  const [scopeType, setScopeType] = useState<ScopeType>('workspace');
  const [expiryDays, setExpiryDays] = useState(7);
  const [created, setCreated] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await createInvitation({
      email,
      role,
      scope_type: scopeType,
      scope_id: scopeId,
      expires_in_days: expiryDays,
    });
    if (result) setCreated(result);
  };

  const handleCopyToken = async () => {
    if (!created) return;
    await navigator.clipboard.writeText(created.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (created) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="space-y-5"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <p className="text-white font-semibold">Invitation Created!</p>
            <p className="text-xs text-[#8E95A2]">
              Share this code manually with <span className="text-white">{created.email}</span>
            </p>
          </div>
        </div>

        <div className="bg-[#0d1a2d] rounded-xl border border-blue-500/30 p-4">
          <p className="text-[10px] text-[#4A5568] uppercase tracking-widest mb-2">Invitation Code (share this)</p>
          <p className="text-cyan-300 font-mono text-xs break-all leading-relaxed">{created.token}</p>
        </div>

        <div className="bg-[#1a1f2e] rounded-lg border border-[#2D343F] p-3 space-y-1 text-xs">
          <div className="flex justify-between text-[#8E95A2]">
            <span>Role</span><span className="text-white">{created.role}</span>
          </div>
          <div className="flex justify-between text-[#8E95A2]">
            <span>Expires</span>
            <span className="text-yellow-400">
              {new Date(created.expires_at).toLocaleString()}
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleCopyToken}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/20 text-sm font-medium transition-colors"
          >
            {copied ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy Code'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-[#1A2030] hover:bg-[#252D3D] text-white border border-[#2D343F] text-sm font-medium transition-colors"
          >
            Done
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs text-[#8E95A2] mb-1.5">Email Address *</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="colleague@company.com"
          className="w-full bg-[#0F1720] border border-[#2D343F] rounded-xl px-3 py-2.5 text-sm text-white placeholder-[#3A4555] focus:outline-none focus:border-blue-500/50 transition-colors"
        />
      </div>

      <div>
        <label className="block text-xs text-[#8E95A2] mb-1.5">Role</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="w-full bg-[#0F1720] border border-[#2D343F] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors"
        >
          <option value="workspace_owner">Workspace Owner</option>
          <option value="infra_architect">Infrastructure Architect</option>
          <option value="infra_operator">Infrastructure Operator</option>
          <option value="infra_viewer">Viewer (Read-only)</option>
        </select>
      </div>

      <div>
        <label className="block text-xs text-[#8E95A2] mb-1.5">Scope</label>
        <select
          value={scopeType}
          onChange={(e) => setScopeType(e.target.value as ScopeType)}
          className="w-full bg-[#0F1720] border border-[#2D343F] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors"
        >
          <option value="workspace">Workspace</option>
          <option value="org">Organization</option>
          <option value="logical_space">Logical Space</option>
        </select>
      </div>

      <div>
        <label className="block text-xs text-[#8E95A2] mb-1.5">
          Expires In <span className="text-blue-400 font-semibold">{expiryDays} days</span>
        </label>
        <input
          type="range"
          min={1}
          max={30}
          value={expiryDays}
          onChange={(e) => setExpiryDays(Number(e.target.value))}
          className="w-full accent-blue-500"
        />
        <div className="flex justify-between text-[10px] text-[#3A4555] mt-1">
          <span>1 day</span><span>30 days</span>
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 py-2.5 rounded-xl bg-[#1A2030] text-[#8E95A2] border border-[#2D343F] text-sm font-medium hover:text-white transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white text-sm font-semibold transition-colors"
        >
          {isLoading ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <UserPlus className="w-4 h-4" />
          )}
          {isLoading ? 'Creating…' : 'Create Invitation'}
        </button>
      </div>
    </form>
  );
}

// ─── Main View ────────────────────────────────────────────────────────────────

export const InvitationsView: React.FC = () => {
  const currentWorkspaceId = useAuthStore((s) => s.currentWorkspaceId);
  const { invitations, isLoading, error, fetchInvitations, revokeInvitation, clearError } =
    useInvitationStore();

  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'accepted' | 'expired'>('all');

  // Normalize status (backend has "revOKed" typo, status may vary)
  const normalize = (s: string) => s.toLowerCase().replace('revoked', 'revoked');

  const filtered = invitations.filter((inv) => {
    if (filter === 'all') return true;
    return normalize(inv.status) === filter;
  });

  const counts = {
    all: invitations.length,
    pending: invitations.filter((i) => i.status === 'pending').length,
    accepted: invitations.filter((i) => i.status === 'accepted').length,
    expired: invitations.filter((i) => ['expired', 'revOKed'].includes(i.status)).length,
  };

  useEffect(() => {
    if (currentWorkspaceId) fetchInvitations(currentWorkspaceId);
  }, [currentWorkspaceId]);

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-400" /> Team Invitations
          </h2>
          <p className="text-sm text-[#8E95A2] mt-1">
            Invite colleagues by generating a secure access code — share it manually.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-all shadow-[0_0_20px_rgba(59,130,246,0.2)]"
        >
          <Plus className="w-4 h-4" /> Invite
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-3">
        {(['all', 'pending', 'accepted', 'expired'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-xl p-3 border text-center transition-all ${
              filter === f
                ? 'bg-blue-600/10 border-blue-500/30 text-blue-400'
                : 'bg-[#0F1720] border-[#1D2535] text-[#4A5568] hover:border-[#2D343F]'
            }`}
          >
            <p className={`text-lg font-bold ${filter === f ? 'text-white' : 'text-[#8E95A2]'}`}>
              {counts[f]}
            </p>
            <p className="text-[10px] uppercase tracking-widest capitalize">{f}</p>
          </button>
        ))}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={clearError} className="text-red-300 hover:text-white">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Info Banner (no email) */}
      <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-amber-400/80 text-xs">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-500" />
        <p>
          <span className="font-semibold text-amber-400">Email delivery is disabled.</span> Copy the
          invitation code from the card below and share it directly with your teammate. They can use it
          at the Join screen.
        </p>
      </div>

      {/* Create Form (Modal-style) */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-2xl border border-blue-500/20 bg-[#0d1520] p-5 shadow-xl"
          >
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-blue-400" /> New Invitation
            </h3>
            <CreateInvitationForm
              scopeId={currentWorkspaceId ?? ''}
              onClose={() => setShowCreate(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* List */}
      <div className="space-y-3">
        {isLoading && invitations.length === 0 && (
          <div className="flex items-center justify-center py-12 text-[#4A5568]">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading invitations…
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-12 text-[#4A5568]">
            <UserPlus className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No invitations yet for this filter.</p>
            <p className="text-xs mt-1">Click <span className="text-blue-400">Invite</span> to get started.</p>
          </div>
        )}

        <AnimatePresence mode="popLayout">
          {filtered.map((invite) => (
            <InvitationCard
              key={invite.id}
              invitation={invite}
              onRevoke={(token) => revokeInvitation(token)}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Refresh */}
      {invitations.length > 0 && (
        <div className="flex justify-center pt-2">
          <button
            onClick={() => currentWorkspaceId && fetchInvitations(currentWorkspaceId)}
            className="flex items-center gap-2 text-xs text-[#4A5568] hover:text-white transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      )}
    </div>
  );
};
