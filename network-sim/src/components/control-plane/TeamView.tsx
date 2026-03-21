import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Mail, Plus, Shield, Copy, CheckCircle2, Trash2, Clock,
  AlertTriangle, RefreshCw, UserPlus, ChevronRight, X, Key,
  LayoutGrid, Star, Zap, Eye, Lock
} from 'lucide-react';
import { useTeamStore, type WorkspaceMember, type Invitation } from '../../store/useTeamStore';
import { useAuthStore } from '../../store/useAuthStore';

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_CONFIG: Record<string, { label: string; color: string; bgColor: string; borderColor: string; icon: React.FC<any>; level: number }> = {
  org_owner:        { label: 'Org Owner',        color: 'text-purple-300', bgColor: 'bg-purple-500/10', borderColor: 'border-purple-500/30', icon: Star,    level: 0 },
  workspace_owner:  { label: 'Workspace Owner',  color: 'text-blue-300',   bgColor: 'bg-blue-500/10',   borderColor: 'border-blue-500/30',   icon: Shield,  level: 1 },
  infra_architect:  { label: 'Infra Architect',  color: 'text-cyan-300',   bgColor: 'bg-cyan-500/10',   borderColor: 'border-cyan-500/30',   icon: LayoutGrid, level: 2 },
  infra_operator:   { label: 'Infra Operator',   color: 'text-green-300',  bgColor: 'bg-green-500/10',  borderColor: 'border-green-500/30',  icon: Zap,     level: 3 },
  infra_viewer:     { label: 'Viewer',           color: 'text-gray-300',   bgColor: 'bg-gray-500/10',   borderColor: 'border-gray-500/30',   icon: Eye,     level: 4 },
};

const ROLE_PERMISSIONS: Record<string, Record<string, boolean>> = {
  'Create Invitations':     { org_owner: true,  workspace_owner: true,  infra_architect: true,  infra_operator: false, infra_viewer: false },
  'Revoke Invitations':     { org_owner: true,  workspace_owner: true,  infra_architect: false, infra_operator: false, infra_viewer: false },
  'See All Invitations':    { org_owner: true,  workspace_owner: true,  infra_architect: false, infra_operator: false, infra_viewer: false },
  'See Own Invitations':    { org_owner: true,  workspace_owner: true,  infra_architect: true,  infra_operator: false, infra_viewer: false },
  'View Members':           { org_owner: true,  workspace_owner: true,  infra_architect: true,  infra_operator: true,  infra_viewer: true  },
  'Design Infrastructure':  { org_owner: true,  workspace_owner: true,  infra_architect: true,  infra_operator: false, infra_viewer: false },
  'Run Simulations':        { org_owner: true,  workspace_owner: true,  infra_architect: true,  infra_operator: true,  infra_viewer: false },
  'View Telemetry':         { org_owner: true,  workspace_owner: true,  infra_architect: true,  infra_operator: true,  infra_viewer: true  },
  'Change Member Roles':    { org_owner: true,  workspace_owner: true,  infra_architect: false, infra_operator: false, infra_viewer: false },
};

const OWNER_ROLES = new Set(['org_owner', 'workspace_owner']);
const MANAGEMENT_ROLES = new Set(['org_owner', 'workspace_owner', 'infra_architect']);

// ─── Micro Components ─────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const cfg = ROLE_CONFIG[role] ?? ROLE_CONFIG['infra_viewer'];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold border ${cfg.color} ${cfg.bgColor} ${cfg.borderColor}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-green-500',
    suspended: 'bg-orange-500',
    pending: 'bg-blue-500 animate-pulse',
    accepted: 'bg-green-500',
    expired: 'bg-red-500',
    revoked: 'bg-gray-500',
    cancelled: 'bg-gray-500',
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[status] ?? 'bg-gray-500'}`} />;
}

function ExpiryBadge({ expiresAt, status }: { expiresAt: string; status: string }) {
  if (status !== 'pending') return null;
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  const diffH = diffMs / 3_600_000;
  if (diffMs <= 0) return <span className="text-xs text-red-400 font-semibold">Expired</span>;
  if (diffH < 24) return <span className="text-xs text-orange-400 font-semibold">{Math.round(diffH)}h left</span>;
  return <span className="text-xs text-[#8E95A2]">{Math.round(diffH / 24)}d left</span>;
}

function Avatar({ email }: { email: string }) {
  const initials = email.slice(0, 2).toUpperCase();
  const hue = Array.from(email).reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
      style={{ background: `hsl(${hue},60%,35%)` }}
    >
      {initials}
    </div>
  );
}

// ─── One-Time Token Modal ─────────────────────────────────────────────────────

function TokenModal({ token, onClose }: { token: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { await navigator.clipboard.writeText(token); setCopied(true); };
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-[#0d1520] border border-indigo-500/30 rounded-2xl p-6 w-full max-w-md shadow-2xl"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <p className="text-white font-bold">Invitation Created!</p>
            <p className="text-xs text-[#8E95A2]">Share this code — it won't be shown again.</p>
          </div>
        </div>

        <div className="bg-[#060d18] rounded-xl border border-indigo-500/20 p-4 mb-4">
          <p className="text-[10px] text-[#4A5568] uppercase tracking-widest mb-2 flex items-center gap-1">
            <Lock className="w-3 h-3" /> One-Time Invitation Code
          </p>
          <p className="text-cyan-300 text-xs font-mono break-all leading-relaxed">{token}</p>
        </div>

        <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 mb-4">
          <p className="text-xs text-amber-400/80">
            <span className="font-semibold text-amber-400">Security Notice:</span> This code is only shown once and cannot be retrieved. Copy it now and share via secure channel (Slack, Teams, etc.).
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={copy}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/20 text-indigo-300 text-sm font-semibold transition-colors"
          >
            {copied ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy Code'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-[#1a2030] hover:bg-[#252d3d] border border-[#2D343F] text-white text-sm font-semibold transition-colors"
          >
            Done
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Create Invitation Form ───────────────────────────────────────────────────

function CreateForm({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const { createInvitation, isLoading, lastCreatedToken, clearLastToken } = useTeamStore();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('infra_architect');
  const [expiryDays, setExpiryDays] = useState(7);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createInvitation(workspaceId, {
      email, role,
      scope_type: 'workspace',
      scope_id: workspaceId,
      expires_in_days: expiryDays,
    });
  };

  if (lastCreatedToken) {
    return <TokenModal token={lastCreatedToken} onClose={() => { clearLastToken(); onClose(); }} />;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="bg-[#0d1520] border border-indigo-500/20 rounded-2xl p-5 space-y-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-indigo-400" /> New Invitation
        </h3>
        <button onClick={onClose} className="text-[#4A5568] hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs text-[#8E95A2] mb-1">Email Address *</label>
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
            placeholder="colleague@company.com"
            className="w-full bg-[#0B0F14] border border-[#2D343F] focus:border-indigo-500/50 rounded-xl px-3 py-2.5 text-sm text-white placeholder-[#3A4555] focus:outline-none transition-colors" />
        </div>

        <div>
          <label className="block text-xs text-[#8E95A2] mb-1">Role</label>
          <select value={role} onChange={e => setRole(e.target.value)}
            className="w-full bg-[#0B0F14] border border-[#2D343F] focus:border-indigo-500/50 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none transition-colors">
            <option value="workspace_owner">Workspace Owner</option>
            <option value="infra_architect">Infra Architect</option>
            <option value="infra_operator">Infra Operator</option>
            <option value="infra_viewer">Viewer (Read-only)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-[#8E95A2] mb-1">
            Expires in <span className="text-indigo-400 font-semibold">{expiryDays} days</span>
          </label>
          <input type="range" min={1} max={30} value={expiryDays}
            onChange={e => setExpiryDays(Number(e.target.value))}
            className="w-full accent-indigo-500" />
          <div className="flex justify-between text-[10px] text-[#3A4555] mt-1">
            <span>1 day</span><span>30 days</span>
          </div>
        </div>

        <button type="submit" disabled={isLoading}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
          {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
          {isLoading ? 'Creating…' : 'Create Invitation'}
        </button>
      </form>
    </motion.div>
  );
}

// ─── TAB 1: Members ───────────────────────────────────────────────────────────

function MembersTab({ members, isLoading }: { members: WorkspaceMember[]; isLoading: boolean }) {
  if (isLoading && members.length === 0) {
    return <div className="flex justify-center py-16 text-[#4A5568]"><RefreshCw className="w-5 h-5 animate-spin" /></div>;
  }
  if (members.length === 0) {
    return (
      <div className="text-center py-16 text-[#4A5568]">
        <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No members yet.</p>
        <p className="text-xs mt-1 opacity-60">Members appear here after accepting an invitation.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {members.map(m => (
        <motion.div key={m.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="flex items-center gap-4 p-4 rounded-xl bg-[#0F1720] border border-[#1D2535] hover:border-[#2D343F] transition-all">
          <Avatar email={m.user_email} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{m.user_email}</p>
            <p className="text-xs text-[#4A5568]">
              Joined {new Date(m.joined_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
            </p>
          </div>
          <RoleBadge role={m.role} />
          <div className="flex items-center gap-1.5 text-xs text-[#4A5568]">
            <StatusDot status={m.status} />
            <span className="capitalize">{m.status}</span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ─── TAB 2: Invitations ───────────────────────────────────────────────────────

function InvitationsTab({
  invitations, workspaceId, myRole, myUserId, isLoading
}: {
  invitations: Invitation[];
  workspaceId: string;
  myRole: string;
  myUserId: string;
  isLoading: boolean;
}) {
  const { revokeInvitation } = useTeamStore();
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'accepted' | 'expired'>('all');
  const canCreate = MANAGEMENT_ROLES.has(myRole);
  const canSeeAll = OWNER_ROLES.has(myRole);

  // Operator/Viewer sees nothing
  if (!canCreate) {
    return (
      <div className="text-center py-16 text-[#4A5568]">
        <Lock className="w-10 h-10 mx-auto mb-3 opacity-20" />
        <p className="text-sm font-semibold">Access Restricted</p>
        <p className="text-xs mt-1 opacity-60">Your role does not have permission to view invitations.</p>
      </div>
    );
  }

  const normalizeStatus = (s: string) => s.toLowerCase();
  const filtered = invitations.filter(inv =>
    filter === 'all' ? true : normalizeStatus(inv.status) === filter
  );
  const counts = {
    all: invitations.length,
    pending: invitations.filter(i => i.status === 'pending').length,
    accepted: invitations.filter(i => i.status === 'accepted').length,
    expired: invitations.filter(i => ['expired', 'revoked', 'cancelled'].includes(i.status)).length,
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-[#4A5568]">
            {canSeeAll ? 'Showing all workspace invitations' : 'Showing invitations you created'}
          </p>
        </div>
        <button onClick={() => setShowCreate(v => !v)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors">
          <Plus className="w-3.5 h-3.5" /> Invite
        </button>
      </div>

      <AnimatePresence>
        {showCreate && <CreateForm workspaceId={workspaceId} onClose={() => setShowCreate(false)} />}
      </AnimatePresence>

      {/* Filter Pills */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'pending', 'accepted', 'expired'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
              filter === f
                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                : 'text-[#4A5568] border-[#1D2535] hover:border-[#2D343F]'
            }`}>
            {f.charAt(0).toUpperCase() + f.slice(1)}{' '}
            <span className="opacity-60">({counts[f]})</span>
          </button>
        ))}
      </div>

      {/* Invite List */}
      <div className="space-y-2">
        {isLoading && invitations.length === 0 && (
          <div className="flex justify-center py-8 text-[#4A5568]">
            <RefreshCw className="w-5 h-5 animate-spin" />
          </div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-10 text-[#4A5568]">
            <Mail className="w-8 h-8 mx-auto mb-2 opacity-20" />
            <p className="text-sm">No invitations matching this filter.</p>
          </div>
        )}
        <AnimatePresence mode="popLayout">
          {filtered.map(inv => {
            const isCreator = inv.invited_by === myUserId;
            const canRevoke = (OWNER_ROLES.has(myRole) || isCreator) && inv.status === 'pending';
            return (
              <motion.div key={inv.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${
                  inv.status === 'pending'
                    ? 'bg-[#0F1720] border-[#1D2535] hover:border-[#2D343F]'
                    : 'bg-[#0B0F14] border-[#141820] opacity-60'
                }`}>
                <Mail className="w-4 h-4 text-[#4A5568] flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{inv.email}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <RoleBadge role={inv.role} />
                    <ExpiryBadge expiresAt={inv.expires_at} status={inv.status} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusDot status={inv.status} />
                  <span className="text-xs text-[#4A5568] capitalize">{inv.status}</span>
                </div>
                {canRevoke && (
                  <button onClick={() => revokeInvitation(workspaceId, inv.id)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-all"
                    title="Revoke invitation">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                {!canRevoke && inv.status === 'pending' && (
                  <span className="text-[10px] text-[#3A4555] bg-[#1A2030] px-2 py-0.5 rounded-full border border-[#252D3D]">
                    issued by you
                  </span>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── TAB 3: Roles ────────────────────────────────────────────────────────────

function RolesTab() {
  const roles = ['org_owner', 'workspace_owner', 'infra_architect', 'infra_operator', 'infra_viewer'];
  const permissions = Object.keys(ROLE_PERMISSIONS);

  return (
    <div className="space-y-6">
      {/* Hierarchy Tree */}
      <div className="bg-[#0F1720] rounded-xl border border-[#1D2535] p-5">
        <h3 className="text-xs text-[#8E95A2] uppercase tracking-widest font-bold mb-4">Role Hierarchy (Cascades Downward)</h3>
        <div className="space-y-2 font-mono">
          {[
            { role: 'org_owner', prefix: '', hasLine: false },
            { role: 'workspace_owner', prefix: '├─ ', hasLine: true },
            { role: 'infra_architect', prefix: '│  ├─ ', hasLine: true },
            { role: 'infra_operator', prefix: '│  │  └─ ', hasLine: true },
            { role: 'infra_viewer', prefix: '│     └─ ', hasLine: true },
          ].map(({ role, prefix }) => {
            const cfg = ROLE_CONFIG[role];
            const Icon = cfg.icon;
            return (
              <div key={role} className="flex items-center gap-2">
                <span className="text-[#2D343F] text-xs select-none">{prefix}</span>
                <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold border ${cfg.color} ${cfg.bgColor} ${cfg.borderColor}`}>
                  <Icon className="w-3 h-3" />
                  {cfg.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Permission Matrix */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left">
              <th className="text-[#4A5568] font-semibold pb-3 pr-4 whitespace-nowrap">Capability</th>
              {roles.map(r => {
                const cfg = ROLE_CONFIG[r];
                const Icon = cfg.icon;
                return (
                  <th key={r} className="pb-3 px-3 text-center">
                    <div className={`inline-flex flex-col items-center gap-1 px-2 py-1 rounded-lg border ${cfg.bgColor} ${cfg.borderColor}`}>
                      <Icon className={`w-3 h-3 ${cfg.color}`} />
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1A2030]">
            {permissions.map(perm => (
              <tr key={perm} className="hover:bg-white/[0.02] transition-colors">
                <td className="py-2.5 pr-4 text-[#8E95A2] whitespace-nowrap">{perm}</td>
                {roles.map(r => {
                  const allowed = ROLE_PERMISSIONS[perm]?.[r] ?? false;
                  return (
                    <td key={r} className="py-2.5 px-3 text-center">
                      {allowed
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400 mx-auto" />
                        : <span className="text-[#2D343F] mx-auto block text-center">—</span>
                      }
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main TeamView ────────────────────────────────────────────────────────────

type Tab = 'members' | 'invitations' | 'roles';

export const TeamView: React.FC = () => {
  const workspaceId = useAuthStore(s => s.currentWorkspaceId) ?? '';
  const user = useAuthStore(s => s.user);
  const { members, invitations, isLoading, error, fetchMembers, fetchInvitations, clearError } = useTeamStore();
  const [activeTab, setActiveTab] = useState<Tab>('members');

  // Derive role from membership list (fallback to workspace_owner for root)
  const myMembership = members.find(m => m.user_email === user?.email);
  const myRole = myMembership?.role ?? 'workspace_owner';
  const canSeeInvitations = MANAGEMENT_ROLES.has(myRole);

  useEffect(() => {
    if (!workspaceId) return;
    fetchMembers(workspaceId);
    fetchInvitations(workspaceId);
  }, [workspaceId]);

  const TABS: { id: Tab; label: string; icon: React.FC<any>; restricted?: boolean }[] = [
    { id: 'members', label: 'Members', icon: Users },
    { id: 'invitations', label: 'Invitations', icon: Mail, restricted: !canSeeInvitations },
    { id: 'roles', label: 'Roles', icon: Shield },
  ];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-400" /> Team Governance
          </h2>
          <p className="text-sm text-[#8E95A2] mt-1">
            Enterprise-grade membership and collaboration control.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RoleBadge role={myRole} />
          <span className="text-xs text-[#4A5568]">your role</span>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex items-center gap-1 bg-[#0F1720] rounded-xl p-1 border border-[#1D2535]">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                activeTab === tab.id
                  ? 'bg-[#1a2540] text-white shadow-[0_0_20px_rgba(99,102,241,0.1)] border border-indigo-500/20'
                  : 'text-[#4A5568] hover:text-[#8E95A2]'
              }`}>
              <Icon className="w-4 h-4" />
              {tab.label}
              {tab.restricted && <Lock className="w-3 h-3 opacity-50" />}
              {tab.id === 'members' && members.length > 0 && (
                <span className="text-xs bg-[#252d3d] text-[#8E95A2] px-1.5 py-0.5 rounded-full">
                  {members.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={clearError}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
          {activeTab === 'members' && (
            <MembersTab members={members} isLoading={isLoading} />
          )}
          {activeTab === 'invitations' && (
            <InvitationsTab
              invitations={invitations}
              workspaceId={workspaceId}
              myRole={myRole}
              myUserId={user?.id ?? ''}
              isLoading={isLoading}
            />
          )}
          {activeTab === 'roles' && <RolesTab />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
