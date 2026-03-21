import { Activity, Zap, Cpu, AlertTriangle, Layers, Server, Map, Gauge, HeartPulse, Building2, Eye, EyeOff, LayoutGrid } from 'lucide-react';
import { useDataCenterStore } from '../../store/useDataCenterStore';
import { useInfraHealthStore } from '../../store/useInfraHealthStore';
import { useTenantStore } from '../../store/useTenantStore';
import { useClusterStore } from '../../store/useClusterStore';
import { controlPlane } from '../../infra-core/control-plane/infraManager';
import { useEffect, useMemo, useState } from 'react';
import type { SpatialOverlayMode } from '../3d/DataCenterCanvas';
import { FloatingPanel } from '../ui/FloatingPanel';

export const FacilityOperatorOS = ({ currentOverlay, onSetOverlay }: { currentOverlay?: SpatialOverlayMode, onSetOverlay?: (m: SpatialOverlayMode) => void }) => {
  const { metrics, racks, recalculateGlobalMetrics } = useDataCenterStore();
  const zones = useDataCenterStore(s => s.zones);
  const { globalHealthScore, rackTelemetry, tickIntervalMs, setTemporalControl, isPaused } = useInfraHealthStore();
  const { tenants, physicalAllocations, logicalAllocations, activeTenantFilter, setActiveTenantFilter } = useTenantStore();
  const { clusters } = useClusterStore();
  
  const [activeTab, setActiveTab] = useState<'overview' | 'tenants' | 'clusters' | 'incidents'>('overview');

  const coreMetrics = useMemo(() => controlPlane.getGlobalMetrics() as any, [rackTelemetry]);

  useEffect(() => {
    recalculateGlobalMetrics();
  }, [racks, recalculateGlobalMetrics]);

  const totalRacks = Object.keys(racks).length;
  const avgUtilization = metrics.totalUMax > 0 
    ? ((metrics.totalUUsed / metrics.totalUMax) * 100).toFixed(1) 
    : '0.0';

  const stressRatio = coreMetrics.thermalStressIndex || 0;
  let stressColor = 'text-emerald-400';
  let stressLabel = 'STABLE';
  if (stressRatio > 0.5) { stressColor = 'text-orange-400'; stressLabel = 'STRESSED'; }
  if (stressRatio > 0.8) { stressColor = 'text-red-400'; stressLabel = 'CRITICAL'; }

  const tenantMetrics = useMemo(() => {
    return Object.values(tenants).map(tenant => {
      const physAllocs = physicalAllocations.filter(a => a.tenantId === tenant.id);
      const rackAllocs = physAllocs.filter(a => a.resourceType === 'rack');
      const zoneAllocs = physAllocs.filter(a => a.resourceType === 'zone');

      const zoneRackIds = new Set<string>();
      zoneAllocs.forEach(za => {
        const zone = zones.find(z => z.id === za.resourceId);
        if (zone) {
          Object.values(racks).forEach(r => {
            if (r.position[0] >= zone.boundary.minX && r.position[0] <= zone.boundary.maxX &&
                r.position[2] >= zone.boundary.minZ && r.position[2] <= zone.boundary.maxZ) {
              zoneRackIds.add(r.id);
            }
          });
        }
      });
      const directRackIds = new Set(rackAllocs.map(a => a.resourceId));
      const allRackIds = new Set([...zoneRackIds, ...directRackIds]);

      let usedPowerW = 0;
      let anomalySum = 0;
      allRackIds.forEach(rid => {
        const r = racks[rid];
        if (r) usedPowerW += r.equipment.reduce((acc, e) => acc + e.powerLoadW, 0);
        const tel = rackTelemetry[rid];
        if (tel) anomalySum += tel.anomalyProbability;
      });

      const quotaW = physAllocs.reduce((acc, a) => acc + a.powerQuotaW, 0);
      const logAllocs = logicalAllocations.filter(a => a.tenantId === tenant.id);

      return {
        tenant,
        rackCount: allRackIds.size,
        usedPowerW,
        quotaW,
        clusterCount: logAllocs.length,
        anomalyScore: allRackIds.size > 0 ? anomalySum / allRackIds.size : 0,
        slaTiers: logAllocs.map(a => a.slaTier)
      };
    });
  }, [tenants, physicalAllocations, logicalAllocations, zones, racks, rackTelemetry]);

  return (
    <FloatingPanel
      id="command-center"
      title="Facility Operator OS"
      icon={<HeartPulse className="w-4 h-4" />}
      defaultX={16}
      defaultY={16}
      headerRight={
        <div className="flex items-center gap-1 bg-slate-950 rounded px-1.5 py-1 border border-slate-800">
           <button onClick={() => setTemporalControl(!isPaused, tickIntervalMs)} className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded ${isPaused ? 'bg-orange-500/20 text-orange-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
             {isPaused ? 'Paused' : 'Live'}
           </button>
           <button onClick={() => setTemporalControl(false, 200)} className={`px-2 py-0.5 text-[9px] font-bold rounded hover:bg-slate-800 ${tickIntervalMs === 200 ? 'text-white bg-slate-800' : 'text-slate-500'}`}>5x</button>
           <button onClick={() => setTemporalControl(false, 1000)} className={`px-2 py-0.5 text-[9px] font-bold rounded hover:bg-slate-800 ${tickIntervalMs === 1000 ? 'text-white bg-slate-800' : 'text-slate-500'}`}>1x</button>
        </div>
      }
    >
      <div className="flex gap-1 bg-slate-800/40 rounded-lg p-1 mb-4">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded transition-all ${
            activeTab === 'overview' ? 'bg-slate-700 text-slate-200' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('tenants')}
          className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded transition-all flex items-center justify-center gap-1 ${
            activeTab === 'tenants' ? 'bg-cad-blue/20 text-cad-blue border border-cad-blue/30' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <Building2 className="w-3 h-3" /> Tenants
        </button>
        <button
          onClick={() => setActiveTab('clusters')}
          className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded transition-all flex items-center justify-center gap-1 ${
            activeTab === 'clusters' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <LayoutGrid className="w-3 h-3" /> Clusters
        </button>
        <button
          onClick={() => setActiveTab('incidents')}
          className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded transition-all flex items-center justify-center gap-1 ${
            activeTab === 'incidents' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <AlertTriangle className="w-3 h-3" /> Incident
        </button>
      </div>

      {activeTab === 'overview' && (
        <div className="animate-in fade-in duration-300">
          <div className="flex items-center justify-between bg-slate-950 p-4 rounded-xl border border-slate-800 mb-5 shadow-inner relative overflow-hidden">
            <div className="absolute top-0 right-0 p-2">
              <div className="flex gap-1">
                {coreMetrics.activeIncidentCount > 0 && (
                  <span className="flex h-2 w-2 rounded-full bg-red-500 animate-ping" />
                )}
              </div>
            </div>
            <div>
              <h3 className="text-[10px] uppercase font-bold text-slate-500 mb-1">Global Health Score</h3>
              <div className="flex items-baseline gap-2">
                <span className={`text-4xl font-light font-mono ${globalHealthScore > 90 ? 'text-emerald-400' : globalHealthScore > 75 ? 'text-orange-400' : 'text-red-500'}`}>
                  {(globalHealthScore * 1).toFixed(0)}
                </span>
                <span className="text-slate-400 text-xs font-mono">/ 100</span>
              </div>
            </div>
            <div className="h-12 w-12 rounded-full border-4 flex items-center justify-center bg-slate-900 border-slate-800" style={{ borderColor: globalHealthScore > 90 ? '#10b981' : globalHealthScore > 75 ? '#f59e0b' : '#ef4444' }}>
              <Activity className={`w-5 h-5 ${globalHealthScore > 90 ? 'text-emerald-500' : globalHealthScore > 75 ? 'text-orange-500' : 'text-red-500'}`} />
            </div>
          </div>

          <h3 className="text-[10px] uppercase font-bold text-slate-500 mb-2">Capacity & Loads</h3>
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/50">
              <div className="flex items-center gap-1.5 text-amber-500 mb-1">
                <Zap className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold">Power Load</span>
              </div>
              <span className="font-mono text-lg text-amber-100">{(coreMetrics.totalPowerW / 1000000).toFixed(2)} MW</span>
            </div>

            <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/50">
              <div className="flex items-center gap-1.5 text-red-400 mb-1">
                <Cpu className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold">Thermal Load</span>
              </div>
              <span className="font-mono text-lg text-red-100">{(coreMetrics.totalThermalBTU / 1000000).toFixed(2)}m BTU</span>
            </div>

            <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/50">
              <div className="flex items-center gap-1.5 text-cad-blue mb-1">
                <Server className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold">Physical Racks</span>
              </div>
              <span className="font-mono text-lg text-blue-100">{totalRacks.toLocaleString()}</span>
            </div>

            <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/50">
              <div className="flex items-center gap-1.5 text-emerald-400 mb-1">
                <Layers className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold">Avg Utilization</span>
              </div>
              <span className="font-mono text-lg text-emerald-100">{avgUtilization}%</span>
            </div>
          </div>

          <div className="mb-4">
            <div className="flex justify-between items-center mb-1.5">
              <div className="flex items-center gap-1.5">
                <Gauge className={`w-4 h-4 ${stressColor}`} />
                <span className="text-[10px] uppercase font-bold text-slate-400">Stress Index</span>
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-current ${stressColor} bg-opacity-10`} style={{ backgroundColor: 'currentColor', color: '#fff' }}>
                {stressLabel}
              </span>
            </div>
            
            {coreMetrics.failureImpactScore > 0 && (
               <div className="mb-4 bg-red-950/20 border border-red-900/30 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-1">
                     <span className="text-[9px] font-bold text-red-400 uppercase">Facility Impact Score</span>
                     <span className="text-[10px] font-mono font-bold text-red-500">{(coreMetrics.failureImpactScore * 100).toFixed(1)}% Affected</span>
                  </div>
                  <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                     <div className="h-full bg-red-500" style={{ width: `${coreMetrics.failureImpactScore * 100}%` }} />
                  </div>
               </div>
            )}
          </div>

          {coreMetrics.activeIncidents.length > 0 && (
            <div className="mb-4 bg-slate-900 border border-slate-800 rounded-lg p-3">
              <h4 className="text-[9px] uppercase font-bold text-slate-500 mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3 text-red-500" /> Active Operational Incidents
                </div>
                <button onClick={() => setActiveTab('incidents')} className="text-[8px] text-cad-blue hover:underline">View All</button>
              </h4>
              <div className="space-y-2 max-h-24 overflow-y-auto pr-1 custom-scrollbar">
                {coreMetrics.activeIncidents.slice(0, 3).map((inc: any) => (
                  <div key={inc.id} className="flex gap-2 text-[10px] border-b border-slate-800 pb-1.5 mb-1.5 last:border-0 items-center">
                    <span className={`w-1.5 h-1.5 rounded-full ${inc.severity === 'critical' ? 'bg-red-500' : 'bg-orange-400'}`} title={inc.severity} />
                    <span className="font-bold uppercase text-slate-400 text-[8px] tracking-tighter">[{inc.category}]</span>
                    <span className="text-slate-200 truncate">{inc.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 mb-4">
            <button 
              onClick={() => onSetOverlay?.(currentOverlay === 'heatmap' ? 'none' : 'heatmap')}
              className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase transition-colors flex items-center justify-center gap-1.5 flex-1 ${currentOverlay === 'heatmap' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/50' : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'}`}
            >
              <Map className="w-3.5 h-3.5" /> Thermal Map
            </button>
            <button 
              onClick={() => onSetOverlay?.(currentOverlay === 'health' ? 'none' : 'health')}
              className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase transition-colors flex items-center justify-center gap-1.5 flex-1 ${currentOverlay === 'health' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/50' : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'}`}
            >
              <Activity className="w-3.5 h-3.5" /> Anomaly Map
            </button>
          </div>
        </div>
      )}

      {activeTab === 'tenants' && (
        <div className="space-y-4 animate-in slide-in-from-right-2 duration-300">
          <div className="space-y-2">
            {tenantMetrics.map(({ tenant, rackCount, usedPowerW, quotaW, clusterCount, anomalyScore }) => {
              const powerPercent = quotaW > 0 ? Math.min((usedPowerW / quotaW) * 100, 100) : 0;
              const isActive = activeTenantFilter === tenant.id;
              return (
                <div key={tenant.id} className={`p-2.5 rounded-lg border transition-all ${isActive ? 'border-cad-blue/50 bg-cad-blue/5' : 'border-slate-700/50 bg-slate-800/40'}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: tenant.color }} />
                      <span className="text-[11px] font-bold text-slate-200">{tenant.name}</span>
                    </div>
                    <button onClick={() => setActiveTenantFilter(isActive ? null : tenant.id)} className={`p-1 rounded transition-colors ${isActive ? 'text-cad-blue bg-cad-blue/10' : 'text-slate-500 hover:text-slate-200'}`}>
                      {isActive ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 mb-1.5 text-center">
                    <div><div className="text-[8px] text-slate-500">Racks</div><div className="text-[11px] font-mono text-slate-300">{rackCount}</div></div>
                    <div><div className="text-[8px] text-slate-500">Clusters</div><div className="text-[11px] font-mono text-slate-300">{clusterCount}</div></div>
                    <div><div className="text-[8px] text-slate-500">Anomaly</div><div className={`text-[11px] font-mono font-bold ${anomalyScore > 50 ? 'text-red-400' : 'text-emerald-400'}`}>{anomalyScore.toFixed(0)}%</div></div>
                  </div>
                  {quotaW > 0 && (
                    <div className="h-1 bg-slate-900 rounded overflow-hidden mt-1">
                      <div className={`h-full transition-all ${powerPercent > 90 ? 'bg-red-500' : 'bg-cad-blue'}`} style={{ width: `${powerPercent}%` }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'clusters' && (
        <div className="space-y-4 animate-in slide-in-from-right-2 duration-300">
          <div className="space-y-3">
            {Object.values(clusters).map(cluster => (
              <div key={cluster.id} className="p-3 bg-slate-800/40 border border-slate-700/50 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: cluster.color }} />
                    <span className="text-[11px] font-bold text-slate-200">{cluster.name}</span>
                  </div>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${cluster.type === 'ai' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400'}`}>
                    {cluster.type}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-2">
                  <div><div className="text-[8px] text-slate-500 uppercase font-bold">Nodes</div><div className="text-xs font-mono text-slate-300">{cluster.nodeCount}</div></div>
                  <div><div className="text-[8px] text-slate-500 uppercase font-bold">Load</div><div className="text-xs font-mono text-slate-300">{(cluster.currentLoadMultiplier * 100).toFixed(1)}%</div></div>
                </div>
                <div className="h-1 bg-slate-900 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 transition-all duration-700" style={{ width: `${cluster.currentLoadMultiplier * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'incidents' && (
        <div className="space-y-4 animate-in slide-in-from-right-2 duration-300">
           <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl mb-4">
              <h4 className="text-[9px] uppercase font-bold text-slate-500 mb-3 text-center tracking-widest">Fault Injection Engine</h4>
              <div className="grid grid-cols-2 gap-2">
                 <button 
                   onClick={() => {
                     const rid = Object.keys(racks)[0];
                     if (rid) controlPlane.injectFault(rid, 'power', 1.0);
                   }}
                   className="py-1.5 bg-slate-800 hover:bg-red-900/40 text-slate-300 text-[9px] font-bold rounded border border-slate-700 transition-colors"
                 >
                   Inject PDU Failure
                 </button>
                 <button 
                   onClick={() => {
                     const rid = Object.keys(racks)[1] || Object.keys(racks)[0];
                     if (rid) controlPlane.injectFault(rid, 'thermal', 0.6);
                   }}
                   className="py-1.5 bg-slate-800 hover:bg-orange-900/40 text-slate-300 text-[9px] font-bold rounded border border-slate-700 transition-colors"
                 >
                   Inject Overheat
                 </button>
                 <button 
                   onClick={() => {
                     const cid = Object.keys(clusters)[0];
                     if (cid) controlPlane.injectFault(cid, 'hardware', 0.8);
                   }}
                   className="py-1.5 bg-slate-800 hover:bg-amber-900/40 text-slate-300 text-[9px] font-bold rounded border border-slate-700 transition-colors"
                 >
                   Cluster Degradation
                 </button>
                 <button 
                   onClick={() => coreMetrics.activeIncidents.forEach((i: any) => controlPlane.resolveFault(i.id))}
                   className="py-1.5 bg-slate-800 hover:bg-emerald-900/40 text-emerald-400 text-[9px] font-bold rounded border border-slate-700 transition-colors"
                 >
                   Clear All Incidents
                 </button>
              </div>
           </div>

           <div className="space-y-2">
              <h4 className="text-[9px] uppercase font-bold text-slate-500 mb-1">Active Incident Lifecycle</h4>
              {coreMetrics.activeIncidents.length === 0 ? (
                 <div className="text-center py-8 text-slate-600 italic text-[10px]">No active infrastructure incidents detected.</div>
              ) : (
                coreMetrics.activeIncidents.map((inc: any) => (
                  <div key={inc.id} className="p-2.5 bg-slate-800/40 border border-slate-700/50 rounded-lg">
                    <div className="flex items-center justify-between mb-1.5">
                       <div className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${inc.severity === 'critical' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)] animate-pulse' : 'bg-orange-500'}`} />
                          <span className="text-[10px] font-bold text-slate-200 uppercase">{inc.category}</span>
                       </div>
                       <span className={`text-[8px] font-mono px-1 rounded uppercase ${
                          inc.lifecycle === 'resolved' ? 'text-emerald-400 bg-emerald-500/10' :
                          inc.lifecycle === 'propagated' ? 'text-red-400 bg-red-500/10 border border-red-500/20' : 'text-slate-400 bg-slate-500/10'
                       }`}>
                          {inc.lifecycle}
                       </span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-tight mb-2">{inc.message}</p>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-700/30">
                       <span className="text-[8px] font-mono text-slate-600">INC-{inc.id.slice(0, 8).toUpperCase()}</span>
                       <button onClick={() => controlPlane.resolveFault(inc.id)} className="text-[8px] text-emerald-500 font-bold hover:text-emerald-400 transition-colors uppercase tracking-tighter underline">RESOLVE</button>
                    </div>
                  </div>
                ))
              )}
           </div>
        </div>
      )}
    </FloatingPanel>
  );
};
