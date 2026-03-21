import { useDataCenterStore, type Equipment } from '../../store/useDataCenterStore';
import { useInfraHealthStore } from '../../store/useInfraHealthStore';
import { useLayoutStore } from '../../store/useLayoutStore';
import { useDeploymentToolsStore } from '../../store/useDeploymentToolsStore';
import { HARDWARE_CATALOG } from '../../data/equipmentKnowledgeBase';
import { Server, Database, Network, AlertTriangle, Cpu, Activity, Trash2, Package, ChevronDown, ChevronUp, Plus } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useMemo, useState, useEffect } from 'react';
import { FloatingPanel } from '../ui/FloatingPanel';

const getEquipmentIcon = (eq: Equipment) => {
  if (eq.type === 'switch') return <Network className="w-3 h-3 text-purple-400" />;
  if (eq.type === 'storage') return <Database className="w-3 h-3 text-blue-400" />;
  if (eq.type === 'pdu') return <Cpu className="w-3 h-3 text-yellow-400" />;
  return <Server className="w-3 h-3 text-cad-blue" />;
};

export const RackConfigPanel = () => {
  const racks = useDataCenterStore(s => s.racks);
  const selectedRackId = useDataCenterStore(s => s.selectedRackId);
  const setSelectedRackId = useDataCenterStore(s => s.setSelectedRackId);
  const addEquipmentToRack = useDataCenterStore(s => s.addEquipmentToRack);
  const removeEquipmentFromRack = useDataCenterStore(s => s.removeEquipmentFromRack);
  const setRackTemplate = useDataCenterStore(s => s.setRackTemplate);
  const batchAddEquipment = useDataCenterStore(s => s.batchAddEquipment);
  const batchSetRackTemplate = useDataCenterStore(s => s.batchSetRackTemplate);
  const batchClearEquipment = useDataCenterStore(s => s.batchClearEquipment);
  const removeRacks = useDataCenterStore(s => s.removeRacks);

  const { updatePanelPosition } = useLayoutStore();
  const selectionSet = useDeploymentToolsStore(s => s.selectionSet);
  const [showCatalog, setShowCatalog] = useState(false);

  const rackId = selectedRackId || (selectionSet.size > 0 ? Array.from(selectionSet)[0] : null);
  const rackTelemetry = useInfraHealthStore(s => rackId ? s.rackTelemetry[rackId] : undefined);
  const rack = rackId ? racks[rackId] : null;

  // Always snap to safe visible position below header when rack inspector opens
  useEffect(() => {
    if (rackId) {
      const safeX = Math.max(20, window.innerWidth - 440);
      const safeY = 68; // just below the header
      updatePanelPosition('rack-inspector', safeX, safeY);
    }
  }, [rackId, updatePanelPosition]);

  const stats = useMemo(() => {
    if (!rack) return { currentPowerW: 0, currentHeatBTU: 0, currentU: 0 };
    return rack.equipment.reduce((acc, eq) => ({
      currentPowerW: acc.currentPowerW + eq.powerLoadW,
      currentHeatBTU: acc.currentHeatBTU + eq.heatOutputBTU,
      currentU: acc.currentU + eq.uSize
    }), { currentPowerW: 0, currentHeatBTU: 0, currentU: 0 });
  }, [rack]);

  if (!rack) return null;

  const powerLoadPercent = Math.min((stats.currentPowerW / (rack.maxPowerW || 1)) * 100, 100);
  const uSlotsPercent = Math.min((stats.currentU / (rack.maxSlotsU || 1)) * 100, 100);

  const addFromCatalog = (templateKey: keyof typeof HARDWARE_CATALOG) => {
    const t = HARDWARE_CATALOG[templateKey];
    const ids = selectionSet.size > 1 ? Array.from(selectionSet) : (rackId ? [rackId] : []);
    if (ids.length === 0) return;
    
    if (ids.length > 1) {
      batchAddEquipment(ids, {
        type: t.type,
        uSize: t.uSize,
        powerLoadW: t.powerW,
        heatOutputBTU: t.heatBTU,
        failureRate: t.failureRate
      });
      return;
    }
    
    if (!rackId) return;
    if (stats.currentU + t.uSize > rack.maxSlotsU) return;
    addEquipmentToRack(rackId, {
      id: uuidv4(),
      type: t.type,
      uSize: t.uSize,
      powerLoadW: t.powerW,
      heatOutputBTU: t.heatBTU,
      failureRate: t.failureRate
    });
  };

  const statusColor = rackTelemetry?.status === 'critical' ? 'text-red-400 border-red-500/30 bg-red-950/30'
    : rackTelemetry?.status === 'degraded' ? 'text-amber-400 border-amber-500/30 bg-amber-950/30'
    : 'text-emerald-400 border-emerald-500/30 bg-emerald-950/30';

  return (
    <FloatingPanel
      id="rack-inspector"
      title={selectionSet.size > 1 ? `Multi-Rack Inspector (${selectionSet.size})` : "Rack Inspector"}
      icon={<Database className="w-4 h-4" />}
      defaultX={Math.max(20, window.innerWidth - 430)}
      defaultY={80}
      onClose={() => setSelectedRackId(null)}
      headerRight={
        <div className="flex items-center gap-2">
          {rackTelemetry && (
            <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded border ${statusColor}`}>
              {rackTelemetry.status}
            </span>
          )}
          <span className="text-[10px] uppercase font-mono bg-slate-800 px-2 py-0.5 rounded border border-slate-700 text-slate-400">
            {rack.templateType}
          </span>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Frame Type */}
        <div>
          <label className="text-[10px] uppercase font-bold text-slate-500 mb-1.5 block">Frame Type</label>
          <select
            value={rack.templateType}
            onChange={(e) => {
              const newTemplate = e.target.value as any;
              if (selectionSet.size > 1) {
                batchSetRackTemplate(Array.from(selectionSet), newTemplate);
              } else if (rackId) {
                setRackTemplate(rackId, newTemplate);
              }
            }}
            className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded p-1.5 outline-none focus:border-cad-blue"
          >
            <option value="custom">Standard White-Box (10kW)</option>
            <option value="compute">Compute Frame (20kW)</option>
            <option value="ai-cluster">High-Density AI Frame (40kW)</option>
            <option value="storage">Storage-Dense Frame (15kW)</option>
            <option value="network">Network Core Frame (5kW)</option>
          </select>
          <p className="text-[9px] text-slate-600 mt-1">Changing frame type resets equipment.</p>
        </div>

        {/* Capacity Bars */}
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1">
              <span>Power Draw</span>
              <span className={powerLoadPercent > 80 ? 'text-red-400' : 'text-slate-500'}>
                {(stats.currentPowerW / 1000).toFixed(1)}kW / {rack.maxPowerW / 1000}kW
              </span>
            </div>
            <div className="h-2 w-full bg-slate-800 rounded overflow-hidden">
              <div
                className={`h-full transition-all ${powerLoadPercent > 90 ? 'bg-red-500' : powerLoadPercent > 70 ? 'bg-amber-500' : 'bg-cad-blue'}`}
                style={{ width: `${powerLoadPercent}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1">
              <span>U-Space</span>
              <span className={uSlotsPercent > 90 ? 'text-red-400' : 'text-slate-500'}>
                {stats.currentU}U / {rack.maxSlotsU}U
              </span>
            </div>
            <div className="h-2 w-full bg-slate-800 rounded overflow-hidden">
              <div
                className={`h-full transition-all ${uSlotsPercent > 90 ? 'bg-red-500' : 'bg-slate-500'}`}
                style={{ width: `${uSlotsPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Live Telemetry */}
        {rackTelemetry && (
          <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
            <span className="text-[10px] text-slate-500 font-bold uppercase flex items-center gap-1.5 mb-2">
              <Activity className="w-3 h-3 text-emerald-400 animate-pulse" />
              Live Telemetry
            </span>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <span className="text-[9px] text-slate-500 block">CPU Util</span>
                <span className="font-mono text-emerald-300 text-xs">{rackTelemetry.cpuUtilizationAvg.toFixed(1)}%</span>
              </div>
              <div>
                <span className="text-[9px] text-slate-500 block">Live Power</span>
                <span className="font-mono text-amber-300 text-xs">{(rackTelemetry.powerDrawActiveW / 1000).toFixed(2)}kW</span>
              </div>
              <div>
                <span className="text-[9px] text-slate-500 block">Anomaly</span>
                <span className={`text-xs font-mono font-bold ${rackTelemetry.anomalyProbability > 50 ? 'text-red-400' : rackTelemetry.anomalyProbability > 20 ? 'text-orange-400' : 'text-emerald-400'}`}>
                  {rackTelemetry.anomalyProbability.toFixed(0)}%
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── INSTALLED EQUIPMENT ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1.5 min-w-0 flex-1">
              <Package className="w-3 h-3 text-slate-500" />
              {selectionSet.size > 1 ? "Summary (Batch Mode)" : "Equipment"}
              <span className="text-slate-600 font-mono ml-1">({rack.equipment.length})</span>
              {rack.templateType !== 'custom' && rack.equipment.length >= 3 && (
                <span className="text-[8px] text-cad-blue/50 uppercase font-bold ml-2 truncate">Template Defaults</span>
              )}
            </h4>
            {rack && (
              <button
                onClick={() => {
                  const ids = selectionSet.size > 1 ? Array.from(selectionSet) : [rack.id];
                  if (confirm(`Permanently wipe ALL equipment from ${ids.length === 1 ? 'this rack' : `${ids.length} racks`}?`)) {
                    batchClearEquipment(ids);
                  }
                }}
                className="px-3 py-1.5 bg-rose-600 text-white rounded text-[10px] font-bold hover:bg-rose-700 transition-colors shadow-lg shadow-rose-900/20"
                title="Clear all equipment from selection"
              >
                CLEAR ALL
              </button>
            )}
          </div>

          {rack.equipment.length === 0 ? (
            <div className="border border-dashed border-slate-700 rounded-lg p-5 text-center bg-slate-900/40">
              <Package className="w-5 h-5 text-slate-600 mx-auto mb-2" />
              <p className="text-[10px] text-slate-400 font-bold uppercase">Rack is Empty</p>
              <p className="text-[9px] text-slate-500 mt-1">
                Select a template above to auto-populate default hardware,<br/>or add custom gear from the catalog below.
              </p>
            </div>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
              {rack.equipment.map((eq, idx) => (
                <div
                  key={eq.id}
                  className="flex items-center gap-2 p-2 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 rounded-lg group transition-colors"
                >
                  <div className="flex-shrink-0">{getEquipmentIcon(eq)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-bold text-slate-200 truncate capitalize">
                      {eq.type.charAt(0).toUpperCase() + eq.type.slice(1)} Unit #{idx + 1}
                    </div>
                    <div className="flex gap-2 text-[9px] font-mono text-slate-500">
                      <span>{eq.uSize}U</span>
                      <span>·</span>
                      <span>{(eq.powerLoadW / 1000).toFixed(1)}kW</span>
                      <span>·</span>
                      <span>{(eq.heatOutputBTU / 1000).toFixed(1)}k BTU</span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (!rackId) return;
                      if (selectionSet.size > 1) {
                        const ids = Array.from(selectionSet);
                        if (confirm(`Remove this component type from ALL ${ids.length} selected racks?`)) {
                           removeEquipmentFromRack(rackId, eq.id);
                        }
                      } else {
                        removeEquipmentFromRack(rackId, eq.id);
                      }
                    }}
                    className="p-1 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded opacity-0 group-hover:opacity-100 transition-all"
                    title={selectionSet.size > 1 ? "Remove from this rack" : "Remove equipment"}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── HARDWARE CATALOG ── */}
        <div>
          <button
            onClick={() => setShowCatalog(!showCatalog)}
            className="w-full flex items-center justify-between p-2 bg-slate-800/40 hover:bg-slate-800 border border-slate-700 rounded-lg transition-colors"
          >
            <span className="flex items-center gap-2 text-[10px] uppercase font-bold text-slate-400">
              <Plus className="w-3 h-3 text-cad-blue" />
              Add Hardware from Catalog
            </span>
            {showCatalog ? <ChevronUp className="w-3 h-3 text-slate-500" /> : <ChevronDown className="w-3 h-3 text-slate-500" />}
          </button>

          {showCatalog && (
            <div className="mt-2 flex flex-col gap-1.5 max-h-64 overflow-y-auto pr-1">
              {Object.values(HARDWARE_CATALOG).map(profile => {
                const isFull = stats.currentU + profile.uSize > rack.maxSlotsU;
                let Icon = Server;
                let color = 'text-cad-blue';
                if (profile.type === 'switch') { Icon = Network; color = 'text-purple-400'; }
                if (profile.type === 'storage') { Icon = Database; color = 'text-blue-400'; }
                if (profile.id.includes('dgx') || profile.id.includes('gpu')) { Icon = Cpu; color = 'text-emerald-400'; }

                return (
                  <button
                    key={profile.id}
                    onClick={() => addFromCatalog(profile.id as any)}
                    disabled={isFull}
                    className="text-left bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 hover:border-slate-500 rounded p-2 transition disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <div className="flex justify-between items-start mb-1">
                      <div className={`flex items-center gap-1.5 ${color}`}>
                        <Icon className="w-3 h-3" />
                        <span className="text-[10px] font-bold">{profile.name}</span>
                      </div>
                      <span className={`text-[9px] font-mono px-1 rounded ${isFull ? 'bg-red-900/40 text-red-400' : 'bg-slate-900 text-slate-400'}`}>
                        {isFull ? 'FULL' : `${profile.uSize}U`}
                      </span>
                    </div>
                    <p className="text-[9px] text-slate-400 leading-tight mb-1">{profile.description}</p>
                    <div className="flex gap-3 text-[8px] font-mono text-slate-500 border-t border-slate-700/50 pt-1">
                      <span>PWR: {(profile.powerW / 1000).toFixed(1)}kW</span>
                      <span>HEAT: {(profile.heatBTU / 1000).toFixed(1)}k BTU</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Power Warning */}
        {powerLoadPercent > 90 && (
          <div className="bg-red-950/40 border border-red-500/30 p-2 rounded flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-[10px] font-bold text-red-400 uppercase leading-none">Critical Power Load</span>
              <p className="text-[9px] text-red-200/70 leading-tight mt-0.5">
                Rack is at {powerLoadPercent.toFixed(0)}% capacity. Risk of thermal runaway.
              </p>
            </div>
          </div>
        )}

        {/* Global Rack Actions */}
        <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
            {(() => {
              const ids = selectionSet.size > 1 ? Array.from(selectionSet) : (rackId ? [rackId] : []);
              if (ids.length === 0) return null;
              return (
                <button
                  onClick={() => {
                    if (confirm(`Permanently remove ${ids.length} rack${ids.length > 1 ? 's' : ''}?`)) {
                      removeRacks(ids);
                      setSelectedRackId(null);
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-rose-500/20 border border-rose-500/30 text-rose-400 rounded-lg text-[10px] font-bold hover:bg-rose-500/30 transition-colors w-full justify-center"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  DELETE {ids.length > 1 ? `SELECTION (${ids.length})` : 'RACK'}
                </button>
              );
            })()}
        </div>
      </div>
    </FloatingPanel>
  );
};
