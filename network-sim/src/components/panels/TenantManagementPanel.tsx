import { useState, useMemo } from 'react';
import { useTenantStore, type Tenant, type TenantType, type SlaTier } from '../../store/useTenantStore';
import { useDataCenterStore } from '../../store/useDataCenterStore';
import { useClusterStore } from '../../store/useClusterStore';
import { FloatingPanel } from '../ui/FloatingPanel';
import {
  Building2, Cloud, Users, Cpu, Plus, Trash2,
  Link, Link2Off, Eye, EyeOff, Check, X
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TENANT_TYPE_CONFIG: Record<TenantType, { icon: React.ReactNode; label: string; color: string }> = {
  operator: { icon: <Building2 className="w-3 h-3" />, label: 'Operator', color: 'text-slate-400' },
  enterprise: { icon: <Building2 className="w-3 h-3" />, label: 'Enterprise', color: 'text-blue-400' },
  cloud: { icon: <Cloud className="w-3 h-3" />, label: 'Cloud', color: 'text-cyan-400' },
  team: { icon: <Users className="w-3 h-3" />, label: 'Team', color: 'text-emerald-400' },
};

const SLA_BADGE: Record<SlaTier, string> = {
  gold: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  silver: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  bronze: 'bg-orange-700/20 text-orange-400 border-orange-700/30',
};

const TENANT_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
];

// ─── Sub-Components ───────────────────────────────────────────────────────────

const TenantRow = ({
  tenant,
  depth,
  isActive,
  onSelect,
  onDelete,
}: {
  tenant: Tenant;
  depth: number;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) => {
  const cfg = TENANT_TYPE_CONFIG[tenant.type];
  // Use a primitive selector (count) to avoid Zustand returning a new array reference every render
  // which would cause an infinite re-render loop.
  const allocationCount = useTenantStore(
    s => s.physicalAllocations.filter(a => a.tenantId === tenant.id).length
  );

  return (
    <div
      onClick={onSelect}
      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all group ${
        isActive ? 'bg-slate-700 ring-1 ring-cad-blue/40' : 'hover:bg-slate-800/60'
      }`}
      style={{ paddingLeft: `${8 + depth * 16}px` }}
    >
      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: tenant.color }} />
      <div className={`flex-shrink-0 ${cfg.color}`}>{cfg.icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-bold text-slate-200 truncate">{tenant.name}</div>
        <div className={`text-[9px] ${cfg.color}`}>{cfg.label} · {allocationCount} alloc.</div>
      </div>
      {tenant.id !== 'tenant-operator-root' && (
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          className="p-1 text-slate-600 hover:text-rose-400 rounded opacity-0 group-hover:opacity-100 transition-all"
          title="Remove tenant"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};

// ─── Main Panel ───────────────────────────────────────────────────────────────

export const TenantManagementPanel = () => {
  const {
    tenants, physicalAllocations, logicalAllocations,
    addTenant, removeTenant,
    assignPhysical, releasePhysicalByResource,
    assignLogical, releaseLogical,
    activeTenantFilter, setActiveTenantFilter,
    getTenantPhysicalAllocations, getTenantLogicalAllocations,
  } = useTenantStore();

  const { zones } = useDataCenterStore();
  const { clusters } = useClusterStore();

  const [selectedTenantId, setSelectedTenantId] = useState<string | null>('tenant-operator-root');
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<TenantType>('enterprise');
  const [newColor, setNewColor] = useState(TENANT_COLORS[1]);
  const [newParent, setNewParent] = useState<string>('');
  const [assignZoneId, setAssignZoneId] = useState('');
  const [assignZonePower, setAssignZonePower] = useState('0');
  const [assignClusterId, setAssignClusterId] = useState('');
  const [assignSla, setAssignSla] = useState<SlaTier>('silver');

  const selectedTenant = selectedTenantId ? tenants[selectedTenantId] : null;

  // Build hierarchy tree
  const tenantTree = useMemo(() => {
    const roots: Tenant[] = [];
    const childMap: Record<string, Tenant[]> = {};

    Object.values(tenants).forEach(t => {
      if (!t.parentTenantId) {
        roots.push(t);
      } else {
        if (!childMap[t.parentTenantId]) childMap[t.parentTenantId] = [];
        childMap[t.parentTenantId].push(t);
      }
    });

    return { roots, childMap };
  }, [tenants]);

  const renderTree = (tenantList: Tenant[], depth = 0): React.ReactNode =>
    tenantList.map(t => (
      <div key={t.id}>
        <TenantRow
          tenant={t}
          depth={depth}
          isActive={selectedTenantId === t.id}
          onSelect={() => setSelectedTenantId(t.id)}
          onDelete={() => {
            if (confirm(`Remove tenant "${t.name}" and all its allocations?`)) {
              removeTenant(t.id);
              if (selectedTenantId === t.id) setSelectedTenantId('tenant-operator-root');
            }
          }}
        />
        {tenantTree.childMap[t.id] && renderTree(tenantTree.childMap[t.id], depth + 1)}
      </div>
    ));

  const physAllocs = selectedTenantId ? getTenantPhysicalAllocations(selectedTenantId) : [];
  const logAllocs = selectedTenantId ? getTenantLogicalAllocations(selectedTenantId) : [];

  const unassignedZones = zones.filter(z =>
    !physicalAllocations.some(a => a.resourceType === 'zone' && a.resourceId === z.id)
  );
  const unassignedClusters = Object.values(clusters).filter(c =>
    !logicalAllocations.some(a => a.clusterId === c.id)
  );

  return (
    <FloatingPanel
      id="tenant-management"
      title="Multi-Tenant Management"
      icon={<Building2 className="w-4 h-4" />}
      defaultX={20}
      defaultY={80}
      width={400}
    >
      <div className="space-y-4">

        {/* ── View Filter Toggle ── */}
        <div className="flex items-center gap-2 p-2 bg-slate-800/60 rounded-lg border border-slate-700/50">
          <div className="flex-1">
            <div className="text-[10px] font-bold text-slate-400 uppercase">Tenant Filter</div>
            <div className="text-[9px] text-slate-500">
              {activeTenantFilter ? `Viewing: ${tenants[activeTenantFilter]?.name}` : 'Showing all tenants'}
            </div>
          </div>
          <button
            onClick={() => setActiveTenantFilter(activeTenantFilter ? null : selectedTenantId)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
              activeTenantFilter
                ? 'bg-cad-blue text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            {activeTenantFilter ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            {activeTenantFilter ? 'Filtered' : 'Filter'}
          </button>
          {activeTenantFilter && (
            <button onClick={() => setActiveTenantFilter(null)} className="p-1.5 text-slate-500 hover:text-slate-300 rounded hover:bg-slate-700 transition-colors">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* ── Tenant Tree ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase text-slate-500">Tenant Hierarchy</span>
            <button
              onClick={() => setShowNewForm(!showNewForm)}
              className="flex items-center gap-1 px-2 py-1 bg-cad-blue/10 border border-cad-blue/30 text-cad-blue rounded text-[10px] font-bold hover:bg-cad-blue/20 transition-colors"
            >
              <Plus className="w-3 h-3" />
              Add Tenant
            </button>
          </div>

          {/* New Tenant Form */}
          {showNewForm && (
            <div className="mb-3 p-3 bg-slate-800/80 border border-slate-700 rounded-xl space-y-2">
              <input
                autoFocus
                type="text"
                placeholder="Tenant name..."
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-cad-blue"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={newType}
                  onChange={e => setNewType(e.target.value as TenantType)}
                  className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 outline-none"
                >
                  <option value="operator">Operator</option>
                  <option value="enterprise">Enterprise</option>
                  <option value="cloud">Cloud Provider</option>
                  <option value="team">Team / BU</option>
                </select>
                <select
                  value={newParent}
                  onChange={e => setNewParent(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 outline-none"
                >
                  <option value="">No parent (root)</option>
                  {Object.values(tenants).map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-1 items-center">
                <span className="text-[9px] text-slate-500 mr-1">Color:</span>
                {TENANT_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setNewColor(c)}
                    className={`w-5 h-5 rounded-full transition-transform ${newColor === c ? 'scale-125 ring-2 ring-white/40' : ''}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => {
                    if (!newName.trim()) return;
                    addTenant({
                      name: newName.trim(),
                      type: newType,
                      color: newColor,
                      parentTenantId: newParent || undefined
                    });
                    setNewName('');
                    setShowNewForm(false);
                  }}
                  className="flex-1 py-1.5 bg-cad-blue text-white rounded text-[10px] font-bold hover:bg-cad-blue/80 transition-colors"
                >
                  Create Tenant
                </button>
                <button onClick={() => setShowNewForm(false)} className="px-3 py-1.5 bg-slate-700 rounded text-[10px] text-slate-300 hover:bg-slate-600 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="space-y-0.5 max-h-48 overflow-y-auto">
            {renderTree(tenantTree.roots)}
          </div>
        </div>

        {/* ── Selected Tenant Detail ── */}
        {selectedTenant && (
          <div className="border-t border-slate-700/50 pt-4 space-y-4">
            {/* Header */}
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedTenant.color }} />
              <div>
                <div className="text-[11px] font-bold text-slate-200">{selectedTenant.name}</div>
                <div className="text-[9px] text-slate-500">{TENANT_TYPE_CONFIG[selectedTenant.type].label}</div>
              </div>
            </div>

            {/* Physical Allocations */}
            <div>
              <div className="text-[10px] font-bold uppercase text-slate-500 mb-1.5 flex items-center gap-1.5">
                <Link className="w-3 h-3" /> Physical Allocations ({physAllocs.length})
              </div>
              {physAllocs.length === 0 ? (
                <p className="text-[9px] text-slate-600 italic ml-1">No physical resources assigned yet.</p>
              ) : (
                <div className="space-y-1">
                  {physAllocs.map(a => (
                    <div key={a.id} className="flex items-center gap-2 p-1.5 bg-slate-800/60 rounded border border-slate-700/30 group">
                      <div className="flex-1">
                        <span className="text-[10px] font-bold text-slate-300 capitalize">{a.resourceType}</span>
                        <span className="text-[9px] text-slate-500 ml-2 font-mono">{a.resourceId.slice(0, 16)}…</span>
                        {a.powerQuotaW > 0 && (
                          <span className="text-[9px] text-amber-400 ml-2">{(a.powerQuotaW/1000).toFixed(0)}kW quota</span>
                        )}
                        {a.leaseLabel && (
                          <span className="text-[8px] text-slate-500 ml-2 italic">{a.leaseLabel}</span>
                        )}
                      </div>
                      <button
                        onClick={() => releasePhysicalByResource(a.resourceType, a.resourceId)}
                        className="p-1 text-slate-600 hover:text-rose-400 rounded opacity-0 group-hover:opacity-100 transition-all"
                        title="Release allocation"
                      >
                        <Link2Off className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Assign Zone */}
              {unassignedZones.length > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <select
                    value={assignZoneId}
                    onChange={e => setAssignZoneId(e.target.value)}
                    className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[10px] text-slate-300 outline-none"
                  >
                    <option value="">Assign zone to tenant…</option>
                    {unassignedZones.map(z => (
                      <option key={z.id} value={z.id}>{z.name}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={assignZonePower}
                    onChange={e => setAssignZonePower(e.target.value)}
                    placeholder="kW quota"
                    className="w-20 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[10px] text-slate-300 outline-none"
                  />
                  <button
                    disabled={!assignZoneId}
                    onClick={() => {
                      if (!assignZoneId || !selectedTenantId) return;
                      assignPhysical(selectedTenantId, 'zone', assignZoneId, {
                        powerQuotaW: parseFloat(assignZonePower) * 1000 || 0
                      });
                      setAssignZoneId('');
                      setAssignZonePower('0');
                    }}
                    className="p-1.5 bg-cad-blue/20 border border-cad-blue/30 text-cad-blue rounded hover:bg-cad-blue/30 transition-colors disabled:opacity-40"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            {/* Logical Allocations */}
            <div>
              <div className="text-[10px] font-bold uppercase text-slate-500 mb-1.5 flex items-center gap-1.5">
                <Cpu className="w-3 h-3" /> Logical Allocations ({logAllocs.length})
              </div>
              {logAllocs.length === 0 ? (
                <p className="text-[9px] text-slate-600 italic ml-1">No workloads assigned yet.</p>
              ) : (
                <div className="space-y-1">
                  {logAllocs.map(a => {
                    const cluster = clusters[a.clusterId];
                    return (
                      <div key={a.id} className="flex items-center gap-2 p-1.5 bg-slate-800/60 rounded border border-slate-700/30 group">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cluster?.color ?? '#888' }} />
                        <div className="flex-1">
                          <span className="text-[10px] font-bold text-slate-300">{cluster?.name ?? 'Unknown Cluster'}</span>
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ml-2 ${SLA_BADGE[a.slaTier]}`}>{a.slaTier.toUpperCase()}</span>
                        </div>
                        <button
                          onClick={() => releaseLogical(a.id)}
                          className="p-1 text-slate-600 hover:text-rose-400 rounded opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Link2Off className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Assign Cluster */}
              {unassignedClusters.length > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <select
                    value={assignClusterId}
                    onChange={e => setAssignClusterId(e.target.value)}
                    className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[10px] text-slate-300 outline-none"
                  >
                    <option value="">Assign cluster…</option>
                    {unassignedClusters.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <select
                    value={assignSla}
                    onChange={e => setAssignSla(e.target.value as SlaTier)}
                    className="w-20 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[10px] text-slate-300 outline-none"
                  >
                    <option value="gold">Gold</option>
                    <option value="silver">Silver</option>
                    <option value="bronze">Bronze</option>
                  </select>
                  <button
                    disabled={!assignClusterId}
                    onClick={() => {
                      if (!assignClusterId || !selectedTenantId) return;
                      assignLogical(selectedTenantId, assignClusterId, 'general', assignSla, 1.0);
                      setAssignClusterId('');
                    }}
                    className="p-1.5 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded hover:bg-emerald-500/30 transition-colors disabled:opacity-40"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </FloatingPanel>
  );
};
