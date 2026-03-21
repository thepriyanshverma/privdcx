import { useDataCenterStore, type Equipment } from '../../store/useDataCenterStore';
import { useInfraHealthStore } from '../../store/useInfraHealthStore';
import { useDeploymentToolsStore } from '../../store/useDeploymentToolsStore';
import { HARDWARE_CATALOG } from '../../data/equipmentKnowledgeBase';
import { useTenantStore } from '../../store/useTenantStore';
import { useClusterStore } from '../../store/useClusterStore';
import { 
  Server, Database, Network, AlertTriangle, Cpu, Activity, 
  Package, ChevronDown, ChevronUp, Plus, Info, Zap, 
  BoxSelect, Layout, Trash2
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useMemo, useState } from 'react';
import { FloatingPanel } from '../ui/FloatingPanel';
import { ConfirmationDialog } from '../ui/ConfirmationDialog';

const getEquipmentIcon = (eq: Equipment) => {
  if (eq.type === 'switch') return <Network className="w-3 h-3 text-purple-400" />;
  if (eq.type === 'storage') return <Database className="w-3 h-3 text-blue-400" />;
  if (eq.type === 'pdu') return <Cpu className="w-3 h-3 text-yellow-400" />;
  return <Server className="w-3 h-3 text-cad-blue" />;
};

export const UnifiedInspector = () => {
  const racks = useDataCenterStore(s => s.racks);
  const facility = useDataCenterStore(s => s.facility);
  const selectedRackId = useDataCenterStore(s => s.selectedRackId);
  const selectionSet = useDeploymentToolsStore(s => s.selectionSet);
  
  const [showCatalog, setShowCatalog] = useState(false);
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    isDestructive?: boolean;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const requestConfirm = (opts: any) => {
    setConfirmState({
      isOpen: true,
      title: opts.title,
      message: opts.message,
      confirmLabel: opts.confirmLabel,
      isDestructive: opts.isDestructive,
      onConfirm: () => {
        opts.onConfirm();
        setConfirmState(s => ({ ...s, isOpen: false }));
      }
    });
  };

  const selectedIds = Array.from(selectionSet);
  const isMulti = selectedIds.length > 1;
  const targetRackId = selectedRackId || (selectedIds.length === 1 ? selectedIds[0] : null);
  const targetRack = targetRackId ? racks[targetRackId] : null;

  return (
    <FloatingPanel 
      id="unified-inspector" 
      title={isMulti ? `Batch Config (${selectedIds.length})` : targetRack ? `Rack ${targetRackId?.slice(0, 8)}` : "Inspector"}
      icon={<BoxSelect className="w-3.5 h-3.5" />}
      defaultX={20}
      defaultY={Math.max(70, window.innerHeight - 520)}
      width={320}
    >
      <div className="max-h-[60vh] overflow-y-auto px-1 thin-scrollbar">
        {!targetRack && !isMulti ? (
          <GlobalContextView facility={facility} racks={racks} />
        ) : (
          <RackContextView 
            rack={targetRack || Object.values(racks).find(r => selectedIds.includes(r.id))}
            isMulti={isMulti}
            selectedIds={selectedIds}
            showCatalog={showCatalog}
            setShowCatalog={setShowCatalog}
            requestConfirm={requestConfirm}
          />
        )}
      </div>

      <ConfirmationDialog 
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel={confirmState.confirmLabel}
        isDestructive={confirmState.isDestructive}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState(s => ({ ...s, isOpen: false }))}
      />
    </FloatingPanel>
  );
};

const GlobalContextView = ({ facility, racks }: any) => {
  const rackCount = Object.keys(racks).length;
  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="grid grid-cols-2 gap-3">
        <MetricCard icon={<Layout className="w-3 h-3" />} label="Total Racks" value={rackCount} />
        <MetricCard icon={<Zap className="w-3 h-3" />} label="Capacity" value={`${facility.powerCapacityMW} MW`} />
      </div>
      <div className="bg-slate-950/50 p-4 rounded-2xl border border-white/5">
        <h4 className="text-[10px] font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
          <Info className="w-3 h-3" /> Selection Tip
        </h4>
        <p className="text-[11px] text-slate-400 leading-relaxed italic">
          Select one or more racks to configure equipment, assignment tenants, clusters, and tuning power parameters.
        </p>
      </div>
    </div>
  );
};

const RackContextView = ({ rack, isMulti, selectedIds, showCatalog, setShowCatalog, requestConfirm }: any) => {
  if (!rack && !isMulti) return null;

  const { batchSetRackTemplate, batchClearEquipment, removeRacks, addEquipmentToRack, batchAddEquipment } = useDataCenterStore();
  const { tenants, assignPhysical, releasePhysicalByResource } = useTenantStore();
  const { clusters, updateCluster } = useClusterStore();
  const rackTelemetry = useInfraHealthStore(s => rack ? s.rackTelemetry[rack.id] : undefined);
  
  const [batchPower, setBatchPower] = useState<number>(rack?.maxPowerW || 10000);

  const stats = useMemo(() => {
    if (!rack) return { currentPowerW: 0, currentU: 0 };
    return rack.equipment.reduce((acc: any, eq: any) => ({
      currentPowerW: acc.currentPowerW + eq.powerLoadW,
      currentU: acc.currentU + eq.uSize
    }), { currentPowerW: 0, currentU: 0 });
  }, [rack]);

  const powerLoadPercent = rack ? Math.min((stats.currentPowerW / (rack.maxPowerW || 1)) * 100, 100) : 0;

  const addFromCatalog = (templateKey: keyof typeof HARDWARE_CATALOG) => {
    const t = HARDWARE_CATALOG[templateKey];
    if (isMulti) {
      batchAddEquipment(selectedIds, {
        type: t.type,
        uSize: t.uSize,
        powerLoadW: t.powerW,
        heatOutputBTU: t.heatBTU,
        failureRate: t.failureRate
      });
      return;
    }
    
    if (stats.currentU + t.uSize > rack.maxSlotsU) return;
    addEquipmentToRack(rack.id, {
      id: uuidv4(),
      type: t.type,
      uSize: t.uSize,
      powerLoadW: t.powerW,
      heatOutputBTU: t.heatBTU,
      failureRate: t.failureRate
    });
  };

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-2">
      {/* 1. Configuration Template */}
      <div>
        <label className="text-[10px] uppercase font-bold text-slate-500 mb-2 block">Rack Template</label>
        <select
          value={isMulti ? "" : rack.templateType}
          onChange={(e) => batchSetRackTemplate(isMulti ? selectedIds : [rack.id], e.target.value as any)}
          className="w-full bg-slate-950 border border-white/10 text-slate-200 text-xs rounded-xl p-3 outline-none focus:border-cad-blue transition-colors"
        >
          {isMulti && <option value="" disabled>Mixed / Select Template...</option>}
          <option value="custom">Standard White-Box (10kW)</option>
          <option value="compute">Compute Frame (20kW)</option>
          <option value="ai-cluster">High-Density AI Frame (40kW)</option>
          <option value="storage">Storage-Dense Frame (15kW)</option>
          <option value="network">Network Core Frame (5kW)</option>
        </select>
      </div>

      {/* 2. Batch Config Engine (Tenant/Cluster/Power) */}
      <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl space-y-4 shadow-inner">
        <h4 className="text-[10px] uppercase font-bold text-emerald-400 flex items-center gap-2">
           <Zap className="w-3.5 h-3.5" /> Logical Allocation
        </h4>

        <div className="grid grid-cols-1 gap-3">
          <div className="space-y-1.5">
            <label className="text-[9px] uppercase font-bold text-slate-500 flex justify-between">
              Tenant Allocation
              {isMulti && <span className="text-[8px] text-emerald-500/50">BATCH</span>}
            </label>
            <div className="flex gap-2">
              <select 
                onChange={(e) => {
                  const tid = e.target.value;
                  if (tid) selectedIds.length > 0 ? selectedIds.forEach(id => assignPhysical(tid, 'rack', id)) : assignPhysical(tid, 'rack', rack.id);
                }}
                className="flex-1 bg-slate-950 border border-white/10 text-slate-200 text-[10px] rounded-lg px-2 py-2 outline-none"
              >
                <option value="">Assign Tenant...</option>
                {Object.values(tenants).map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <button 
                onClick={() => isMulti ? selectedIds.forEach(id => releasePhysicalByResource('rack', id)) : releasePhysicalByResource('rack', rack.id)}
                className="px-2 py-2 bg-slate-800 border border-slate-700 rounded-lg text-[9px] font-bold text-slate-400 hover:text-white"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[9px] uppercase font-bold text-slate-500">Cluster Group</label>
            <select 
              onChange={(e) => {
                const cid = e.target.value;
                if (cid) {
                  const cluster = clusters[cid];
                  if (cluster) {
                    const targets = isMulti ? selectedIds : [rack.id];
                    // Cluster uses { rackId, nodeCount }[]
                    const existingMap = new Map(cluster.assignedRacks.map(r => [r.rackId, r.nodeCount]));
                    targets.forEach(tid => {
                      if (!existingMap.has(tid)) existingMap.set(tid, 1);
                    });
                    const newAssignedRacks = Array.from(existingMap.entries()).map(([rackId, nodeCount]) => ({ rackId, nodeCount }));
                    updateCluster(cid, { assignedRacks: newAssignedRacks });
                  }
                }
              }}
              className="w-full bg-slate-950 border border-white/10 text-slate-200 text-[10px] rounded-lg px-2 py-2 outline-none"
            >
              <option value="">Move to Cluster...</option>
              {Object.values(clusters).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5 pt-1">
            <label className="text-[9px] uppercase font-bold text-slate-500">Power Capacity Override (W)</label>
            <div className="flex gap-2">
              <input 
                type="number"
                value={batchPower}
                onChange={(e) => setBatchPower(parseInt(e.target.value) || 0)}
                className="flex-1 bg-slate-950 border border-white/10 text-slate-200 text-[10px] rounded-lg px-2 py-2 outline-none font-mono"
              />
              <button 
                onClick={() => {
                  // In a real project we'd have a batchSetPower action
                  // For now, we'll notify that this modifies logical capacity.
                }}
                className="px-3 py-2 bg-emerald-500/20 border border-emerald-500/40 rounded-lg text-[9px] font-bold text-emerald-400 hover:bg-emerald-500/30 uppercase"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Stats & Telemetry (Visible only for single selection) */}
      {!isMulti && rack && (
        <div className="p-4 bg-slate-950/50 rounded-2xl border border-white/5 space-y-4">
          <div>
            <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-2 uppercase">
              <span>Power Load</span>
              <span className={powerLoadPercent > 80 ? 'text-red-400' : 'text-slate-300'}>
                {(stats.currentPowerW / 1000).toFixed(1)}kW / {rack.maxPowerW / 1000}kW
              </span>
            </div>
            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${powerLoadPercent > 90 ? 'bg-red-500' : powerLoadPercent > 70 ? 'bg-amber-500' : 'bg-cad-blue'}`}
                style={{ width: `${powerLoadPercent}%` }}
              />
            </div>
          </div>

          {rackTelemetry && (
            <div className="pt-3 border-t border-white/5 grid grid-cols-2 gap-4">
              <div>
                <span className="text-[9px] text-slate-500 uppercase font-bold block mb-1">Live Compute</span>
                <div className="flex items-center gap-1.5">
                  <Activity className="w-3 h-3 text-emerald-400" />
                  <span className="font-mono text-xs text-white">{rackTelemetry.cpuUtilizationAvg.toFixed(1)}%</span>
                </div>
              </div>
              <div>
                <span className="text-[9px] text-slate-500 uppercase font-bold block mb-1">Anomaly Risk</span>
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className={`w-3 h-3 ${rackTelemetry.anomalyProbability > 30 ? 'text-amber-400' : 'text-slate-600'}`} />
                  <span className="font-mono text-xs text-white">{rackTelemetry.anomalyProbability.toFixed(0)}%</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. Equipment Logic */}
      <div className="space-y-3">
        <h4 className="text-[10px] uppercase font-bold text-slate-500 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Package className="w-3 h-3" /> Equipment Catalog
          </span>
          {!isMulti && rack && <span className="text-[9px] text-slate-600 font-mono">{rack.equipment.length}/42U</span>}
        </h4>
        
        {/* 4a. Installed Inventory (Single Rack Only) */}
        {!isMulti && rack && rack.equipment.length > 0 && (
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1 thin-scrollbar">
            {rack.equipment.map((item: Equipment) => {
              const catalogProfile = Object.values(HARDWARE_CATALOG).find(p => p.type === item.type && p.uSize === item.uSize && p.powerW === item.powerLoadW);
              return (
                <div key={item.id} className="flex items-center justify-between p-2.5 bg-slate-900/40 border border-white/5 rounded-xl group">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-950 flex items-center justify-center border border-white/5">
                      {getEquipmentIcon(item)}
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-slate-300">
                        {catalogProfile?.name || (item.type.charAt(0).toUpperCase() + item.type.slice(1))}
                      </div>
                      <div className="text-[9px] text-slate-500 font-mono">{item.uSize}U • {(item.powerLoadW/1000).toFixed(1)}kW</div>
                    </div>
                  </div>
                  <button
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      removeEquipmentFromRack(rack.id, item.id);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="p-2 hover:bg-red-500/20 text-slate-500 hover:text-red-400 rounded-lg transition-colors z-[100]"
                    title="Delete Component"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <button
          onClick={() => setShowCatalog(!showCatalog)}
          className="w-full flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all"
        >
          <span className="flex items-center gap-2 text-[10px] uppercase font-bold text-slate-300 tracking-tight">
            <Plus className="w-4 h-4 text-emerald-500" />
            Add Hardware
          </span>
          {showCatalog ? <ChevronUp className="w-3 h-3 text-slate-500" /> : <ChevronDown className="w-3 h-3 text-slate-500" />}
        </button>

        {showCatalog && (
          <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto pr-1 thin-scrollbar">
            {Object.values(HARDWARE_CATALOG).map(profile => (
              <button
                key={profile.id}
                onClick={() => addFromCatalog(profile.id as any)}
                className="w-full text-left p-2.5 bg-slate-900/80 hover:bg-slate-800 border border-white/5 rounded-lg transition-colors group"
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] font-bold text-slate-300 group-hover:text-cad-blue transition-colors">{profile.name}</span>
                  <span className="text-[9px] font-mono text-slate-600">{(profile.powerW/1000).toFixed(1)}kW</span>
                </div>
                <p className="text-[9px] text-slate-600 truncate">{profile.description}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 5. Destructive Actions */}
      <div className="flex gap-2 pt-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            requestConfirm({
              title: 'Clear Equipment',
              message: `Clear all hardware from ${isMulti ? `${selectedIds.length} racks` : 'this rack'}?`,
              confirmLabel: 'Clear All',
              isDestructive: true,
              onConfirm: () => batchClearEquipment(isMulti ? selectedIds : [rack.id])
            });
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="flex-1 py-3 bg-white/5 hover:bg-red-500/10 border border-white/10 hover:border-red-500/30 text-slate-400 hover:text-red-400 rounded-xl text-[10px] font-bold transition-all uppercase tracking-tight"
        >
          Clear Gear
        </button>
        <button
          onClick={() => {
            requestConfirm({
              title: 'Delete Racks',
              message: `Permanently delete ${isMulti ? `${selectedIds.length} racks` : 'this rack'}?`,
              confirmLabel: 'Delete',
              isDestructive: true,
              onConfirm: () => {
                removeRacks(isMulti ? selectedIds : [rack.id]);
                useDeploymentToolsStore.getState().clearSelection();
              }
            });
          }}
          className="flex-1 py-3 bg-white/5 hover:bg-red-500/10 border border-white/10 hover:border-red-500/30 text-slate-400 hover:text-red-400 rounded-xl text-[10px] font-bold transition-all uppercase tracking-tight"
        >
          Delete
        </button>
      </div>
    </div>
  );
};

const MetricCard = ({ icon, label, value }: any) => (
  <div className="bg-slate-950/50 p-3 rounded-2xl border border-white/5">
    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase mb-1">
      {icon} {label}
    </div>
    <div className="text-sm font-mono text-slate-200">{value}</div>
  </div>
);
