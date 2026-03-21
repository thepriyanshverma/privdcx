import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Layout, Plus, ArrowRight, Loader2, Users, Ticket, CheckCircle2, X, AlertTriangle, Key } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';

interface Workspace {
  id: string;
  name: string;
  org_id: string;
}

const API_BASE = 'http://localhost:8000/api/v1';

export const WorkspaceSelectorPage: React.FC<{ onSelect: (id: string) => void }> = ({ onSelect }) => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newWsName, setNewWsName] = useState('');

  // ── Invite code state ─────────────────────────────────────────────
  const [showInvite, setShowInvite] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [redeemSuccess, setRedeemSuccess] = useState(false);

  const token = useAuthStore(s => s.token);
  const user = useAuthStore(s => s.user);

  const fetchWorkspaces = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/tenants/workspaces`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setWorkspaces(data);
      } else if (response.status === 401) {
        useAuthStore.getState().logout();
      }
    } catch (err) {
      console.error('Failed to fetch workspaces', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkspaces();
  }, []);

  // ── Invite Redemption ─────────────────────────────────────────────
  const handleRedeemInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    setIsRedeeming(true);
    setRedeemError(null);

    try {
      // 1. Verify the invitation token
      const verifyRes = await fetch(
        `${API_BASE}/invitations/invitations/${encodeURIComponent(inviteCode.trim())}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (!verifyRes.ok) {
        const err = await verifyRes.json();
        throw new Error(err.detail ?? 'Invalid or expired invite code.');
      }

      const invitation = await verifyRes.json();

      // 2. Accept the invitation
      const acceptRes = await fetch(`${API_BASE}/invitations/invitations/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ token: inviteCode.trim(), email: user?.email }),
      });

      if (!acceptRes.ok) {
        const err = await acceptRes.json();
        throw new Error(err.detail ?? 'Failed to accept invitation.');
      }

      // 3. Success — refresh workspaces and show success message
      setRedeemSuccess(true);
      setInviteCode('');
      await fetchWorkspaces();

      // 4. If the invitation is scoped to a workspace, auto-select after a brief delay
      if (invitation.scope_type === 'workspace' && invitation.scope_id) {
        setTimeout(() => onSelect(invitation.scope_id), 1500);
      }
    } catch (err: any) {
      setRedeemError(err.message ?? 'Something went wrong. Please try again.');
    } finally {
      setIsRedeeming(false);
    }
  };

  // ── Create Workspace ──────────────────────────────────────────────
  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWsName.trim()) return;
    
    setIsCreating(true);
    try {
      const orgsRes = await fetch(`${API_BASE}/tenants/organizations`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      let orgs: any[] = [];
      if (orgsRes.ok) orgs = await orgsRes.json();

      let activeOrgId: string | null = null;
      if (Array.isArray(orgs) && orgs.length > 0) {
        activeOrgId = orgs[0].id;
      } else {
        const createOrgRes = await fetch(`${API_BASE}/tenants/organizations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ 
            name: `${user?.full_name || 'Default'} Organization`,
            billing_email: user?.email || 'billing@example.com'
          }),
        });
        if (createOrgRes.ok) {
          const newOrg = await createOrgRes.json();
          activeOrgId = newOrg.id;
        } else {
          const orgErr = await createOrgRes.json();
          throw new Error(`Failed to create organization: ${JSON.stringify(orgErr.detail)}`);
        }
      }

      if (!activeOrgId) throw new Error('Could not resolve an organization ID.');

      const response = await fetch(`${API_BASE}/tenants/workspaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ name: newWsName, organization_id: activeOrgId, region: 'us-east-1' }),
      });

      if (response.ok) {
        const newWs = await response.json();
        setWorkspaces([...workspaces, newWs]);
        setNewWsName('');
      } else {
        const errData = await response.json();
        let detail = errData.detail;
        if (Array.isArray(detail)) detail = detail.map((e: any) => `${e.loc.join('.')}: ${e.msg}`).join(', ');
        else if (typeof detail === 'object') detail = JSON.stringify(detail);
        alert(`Failed to create workspace: ${detail || 'Unknown error'}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message || 'Something went wrong'}`);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#0B0F14] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-2xl bg-[#151921] border border-[#2D343F] rounded-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-8 border-b border-[#2D343F] bg-[#1A1F29]">
          <h1 className="text-2xl font-bold text-white mb-1">Welcome, {user?.full_name || 'User'}</h1>
          <p className="text-[#8E95A2] text-sm">Select a workspace, create a new one, or join a team with an invite code.</p>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          {/* ── Invite Code Section ─────────────────────────────────── */}
          <div>
            <button
              onClick={() => { setShowInvite(v => !v); setRedeemError(null); setRedeemSuccess(false); }}
              className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl border transition-all ${
                showInvite
                  ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
                  : 'bg-[#0B0F14] border-[#2D343F] text-[#8E95A2] hover:border-indigo-500/30 hover:text-indigo-300'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Key className="w-4 h-4" />
                <span className="text-sm font-semibold">I have an invite code</span>
              </div>
              <span className="text-xs bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full border border-indigo-500/20 font-bold">
                Join a team
              </span>
            </button>

            <AnimatePresence>
              {showInvite && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 p-4 rounded-xl bg-[#0d1520] border border-indigo-500/20 space-y-3">
                    {redeemSuccess ? (
                      <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-3 text-green-400"
                      >
                        <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                        <div>
                          <p className="font-semibold text-sm">Invitation accepted!</p>
                          <p className="text-xs text-green-400/70">Redirecting you to your workspace…</p>
                        </div>
                      </motion.div>
                    ) : (
                      <>
                        <p className="text-xs text-[#8E95A2]">
                          Paste the invite code that was shared with you. It looks like a long string of random characters.
                        </p>
                        <form onSubmit={handleRedeemInvite} className="space-y-2">
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <Ticket className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400/50" />
                              <input
                                type="text"
                                value={inviteCode}
                                onChange={(e) => { setInviteCode(e.target.value); setRedeemError(null); }}
                                placeholder="Paste invite code here…"
                                className="w-full bg-[#0B0F14] border border-[#2D343F] focus:border-indigo-500/50 rounded-lg pl-9 pr-3 py-2.5 text-xs text-white placeholder-[#3A4555] font-mono focus:outline-none transition-colors"
                              />
                              {inviteCode && (
                                <button type="button" onClick={() => setInviteCode('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                                  <X className="w-3.5 h-3.5 text-[#4A5568] hover:text-white" />
                                </button>
                              )}
                            </div>
                            <button
                              type="submit"
                              disabled={isRedeeming || !inviteCode.trim()}
                              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors whitespace-nowrap"
                            >
                              {isRedeeming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                              {isRedeeming ? 'Joining…' : 'Join Team'}
                            </button>
                          </div>

                          {redeemError && (
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg"
                            >
                              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                              {redeemError}
                            </motion.div>
                          )}
                        </form>
                      </>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Divider ──────────────────────────────────────────────── */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[#2D343F]" />
            <span className="text-xs text-[#4A5568] uppercase tracking-widest">or select workspace</span>
            <div className="flex-1 h-px bg-[#2D343F]" />
          </div>

          {/* ── Workspace Grid ───────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {isLoading ? (
              <div className="col-span-full flex justify-center py-12">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              </div>
            ) : workspaces.length === 0 ? (
              <div className="col-span-full text-center py-12 bg-[#0B0F14] rounded-lg border border-dashed border-[#2D343F]">
                <Users className="w-12 h-12 text-[#4A5568] mx-auto mb-4" />
                <p className="text-[#8E95A2] text-sm">No workspaces found.</p>
                <p className="text-xs text-[#4A5568] mt-1">Enter an invite code above, or create your own workspace below.</p>
              </div>
            ) : (
              workspaces.map(ws => (
                <button
                  key={ws.id}
                  onClick={() => onSelect(ws.id)}
                  className="group flex flex-col p-6 bg-[#0B0F14] border border-[#2D343F] rounded-xl hover:border-blue-500 transition-all text-left"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="p-2 bg-blue-500/10 rounded-lg group-hover:bg-blue-500/20 transition-colors">
                      <Layout className="w-5 h-5 text-blue-400" />
                    </div>
                    <ArrowRight className="w-4 h-4 text-[#4A5568] group-hover:text-blue-400 transition-colors" />
                  </div>
                  <h3 className="text-white font-semibold mb-1">{ws.name}</h3>
                  <p className="text-xs text-[#4A5568]">Click to enter workspace</p>
                </button>
              ))
            )}
          </div>
        </div>

        {/* ── Footer: Create Workspace ──────────────────────────────── */}
        <div className="p-6 bg-[#1A1F29] border-t border-[#2D343F]">
          <p className="text-[10px] text-[#4A5568] uppercase tracking-widest mb-3">Create New Workspace</p>
          <form onSubmit={handleCreateWorkspace} className="flex gap-3">
            <input
              type="text"
              value={newWsName}
              onChange={(e) => setNewWsName(e.target.value)}
              placeholder="e.g. Production Cluster A"
              className="flex-1 bg-[#0B0F14] border border-[#2D343F] rounded-lg px-4 py-2.5 text-sm text-white placeholder-[#4A5568] focus:outline-none focus:border-blue-500 transition-colors"
            />
            <button
              type="submit"
              disabled={isCreating}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors whitespace-nowrap text-sm font-semibold"
            >
              {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              New Workspace
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
};
