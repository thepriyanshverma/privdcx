import { 
  MousePointer2, BoxSelect, Paintbrush, LayoutGrid, Map as MapIcon, 
  Layers, ChevronDown, Copy, Rocket, Wrench, Check, X, Trash2,
  PlusSquare, Columns, Rows, ThermometerSun, ThermometerSnowflake, ChevronUp
} from 'lucide-react';
import { useDeploymentToolsStore } from '../../store/useDeploymentToolsStore';
import type { DeploymentTool } from '../../store/useDeploymentToolsStore';
import { useDataCenterStore } from '../../store/useDataCenterStore';
import { useState, useMemo } from 'react';
import { FloatingPanel } from './FloatingPanel';

export const DeploymentToolbar = () => {
  const activeTool = useDeploymentToolsStore(s => s.activeTool);
  const setActiveTool = useDeploymentToolsStore(s => s.setActiveTool);
  const activeTemplate = useDeploymentToolsStore(s => s.activeTemplate);
  const setActiveTemplate = useDeploymentToolsStore(s => s.setActiveTemplate);
  const brushRadius = useDeploymentToolsStore(s => s.brushRadius);
  const setBrushRadius = useDeploymentToolsStore(s => s.setBrushRadius);
  const selectionSet = useDeploymentToolsStore(s => s.selectionSet);
  const setSelection = useDeploymentToolsStore(s => s.setSelection);
  const clearSelection = useDeploymentToolsStore(s => s.clearSelection);

  const racks = useDataCenterStore(s => s.racks);
  const rows = useDataCenterStore(s => s.rows);
  const zones = useDataCenterStore(s => s.zones);
  const blocks = useDataCenterStore(s => s.blocks);
  const batchSetRackTemplate = useDataCenterStore(s => s.batchSetRackTemplate);
  const removeRacks = useDataCenterStore(s => s.removeRacks);
  const addBlock = useDataCenterStore(s => s.addBlock);
  const replicateBlock = useDataCenterStore(s => s.replicateBlock);
  const removeZone = useDataCenterStore(s => s.removeZone);
  const addRack = useDataCenterStore(s => s.addRack);

  const [showTemplates, setShowTemplates] = useState(false);
  const [showBlocks, setShowBlocks] = useState(false);
  const [showBlockInput, setShowBlockInput] = useState(false);
  const [blockNameInput, setBlockNameInput] = useState('AI Cluster Block');
  const [showSelectionAssistant, setShowSelectionAssistant] = useState(false);

  // Tools configuration
  const tools: { id: DeploymentTool; icon: any; label: string; shortcut: string }[] = [
    { id: 'navigate', icon: <MousePointer2 className="w-4 h-4" />, label: 'Navigate', shortcut: 'V' },
    { id: 'select', icon: <BoxSelect className="w-4 h-4" />, label: 'Region Select', shortcut: 'M' },
    { id: 'add-rack', icon: <PlusSquare className="w-4 h-4" />, label: 'Add Rack', shortcut: 'A' },
    { id: 'paint', icon: <Paintbrush className="w-4 h-4" />, label: 'Paint', shortcut: 'B' },
    { id: 'block', icon: <LayoutGrid className="w-4 h-4" />, label: 'Blocks', shortcut: 'L' },
    { id: 'zone', icon: <MapIcon className="w-4 h-4" />, label: 'Zone', shortcut: 'Z' },
  ];

  const templates = [
    { id: 'ai-cluster', label: 'AI Compute (DGX)', color: 'bg-emerald-500' },
    { id: 'compute', label: 'General Compute', color: 'bg-amber-500' },
    { id: 'storage', label: 'Dense Storage', color: 'bg-blue-500' },
    { id: 'network', label: 'Networking', color: 'bg-purple-500' },
    { id: 'custom', label: 'Custom / Empty', color: 'bg-slate-500' },
  ];

  // Helper Logic for Selection Assistant
  const { gridRows, gridCols } = useMemo(() => {
    const rSet = new Set<number>();
    const cSet = new Set<number>();
    Object.values(racks).forEach(rack => {
      rSet.add(Math.round(rack.position[0]));
      cSet.add(Math.round(rack.position[2]));
    });
    return { 
      gridRows: Array.from(rSet).sort((a, b) => a - b),
      gridCols: Array.from(cSet).sort((a, b) => a - b)
    };
  }, [racks]);

  const selectRow = (x: number) => {
    const ids = Object.values(racks).filter(r => Math.round(r.position[0]) === x).map(r => r.id);
    setSelection(ids);
  };

  const selectCol = (z: number) => {
    const ids = Object.values(racks).filter(r => Math.round(r.position[2]) === z).map(r => r.id);
    setSelection(ids);
  };

  const selectAisle = (type: 'hot' | 'cold') => {
    const ids = Object.values(racks).filter(rack => {
      const isCold = Math.abs(rack.rotation[1]) < 0.1;
      return type === 'cold' ? isCold : !isCold;
    }).map(r => r.id);
    setSelection(ids);
  };

  return (
    <FloatingPanel
      id="deployment-toolbar"
      title="Deployment Tools"
      icon={<Rocket className="w-4 h-4" />}
      defaultX={20}
      defaultY={window.innerHeight - 240}
      width={520}
    >
      <div className="flex flex-col gap-3">
        {/* Tool Selector Row */}
        <div className="flex items-center gap-1 p-1 bg-slate-800/60 rounded-xl border border-slate-700/50">
          {tools.map((tool) => (
            <button
              key={tool.id}
              onClick={() => setActiveTool(tool.id)}
              title={`${tool.label} (${tool.shortcut})`}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg transition-all text-[11px] font-bold uppercase tracking-wide ${
                activeTool === tool.id
                  ? 'bg-cad-blue text-white shadow-[0_0_15px_rgba(30,144,255,0.4)] scale-105 z-10'
                  : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
              }`}
            >
              <div className={activeTool === tool.id ? 'text-white' : 'text-cad-blue/80'}>{tool.icon}</div>
              <span>{tool.label}</span>
            </button>
          ))}
        </div>

        {/* Global Selection Overlay (Visible when anything selected) */}
        {selectionSet.size > 0 && (
          <div className="flex items-center gap-2 p-1.5 bg-cad-blue/10 border border-cad-blue/30 rounded-lg animate-in fade-in slide-in-from-bottom-2 duration-300 overflow-x-auto thin-scrollbar">
            <span className="text-[10px] font-bold text-cad-blue px-2 border-r border-cad-blue/20 whitespace-nowrap">
              {selectionSet.size} SELECTED
            </span>
            
            <button
              onClick={() => {
                if (confirm(`Remove ${selectionSet.size} racks?`)) {
                  removeRacks(Array.from(selectionSet));
                  clearSelection();
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1 bg-rose-500/20 border border-rose-500/30 text-rose-400 rounded text-[10px] font-bold hover:bg-rose-500/30 transition-colors whitespace-nowrap"
            >
              <Trash2 className="w-3 h-3" />
              DELETE RACKS
            </button>

            <button
              onClick={() => {
                if (confirm(`Clear all equipment from ${selectionSet.size} racks?`)) {
                  useDataCenterStore.getState().batchClearEquipment(Array.from(selectionSet));
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1 bg-orange-500/20 border border-orange-500/30 text-orange-400 rounded text-[10px] font-bold hover:bg-orange-500/30 transition-colors whitespace-nowrap"
              title="Clear all equipment from selected racks"
            >
              <Wrench className="w-3 h-3" />
              CLEAR ALL
            </button>

            <button 
              onClick={clearSelection}
              className="p-1 text-slate-500 hover:text-slate-300 transition-colors ml-auto"
              title="Clear Selection"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Contextual Options */}
        <div className="flex flex-col gap-2 min-h-[32px]">
          {/* NAVIGATE Context */}
          {activeTool === 'navigate' && (
            <div className="flex items-center gap-2 text-[10px] text-slate-500">
              <Wrench className="w-3 h-3" />
              <span className="italic">Click a rack to inspect. Use right-click or scroll to navigate.</span>
            </div>
          )}

          {/* ADD RACK Context */}
          {activeTool === 'add-rack' && (
            <div className="flex items-center gap-2 text-[10px] text-slate-500">
              <PlusSquare className="w-3 h-3 text-cad-blue" />
              <span className="italic uppercase">Click on the floor to place a new rack.</span>
            </div>
          )}

          {/* REGION SELECT Context */}
          {activeTool === 'select' && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-500 italic">Drag on floor to select multiple.</span>
                <button 
                  onClick={() => setShowSelectionAssistant(!showSelectionAssistant)}
                  className="flex items-center gap-1 text-[10px] font-bold text-cad-blue hover:text-white transition-colors"
                >
                  {showSelectionAssistant ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  SELECTION ASSISTANT
                </button>
              </div>

              {showSelectionAssistant && (
                <div className="p-3 bg-slate-900/50 border border-slate-700/50 rounded-xl space-y-3 animate-in fade-in zoom-in-95 duration-200">
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => selectAisle('cold')} className="flex items-center gap-2 px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-lg text-[10px] font-bold text-blue-400 hover:bg-blue-500/20 transition-colors uppercase">
                      <ThermometerSnowflake className="w-3 h-3" />
                      Cold Aisles
                    </button>
                    <button onClick={() => selectAisle('hot')} className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-[10px] font-bold text-red-400 hover:bg-red-500/20 transition-colors uppercase">
                      <ThermometerSun className="w-3 h-3" />
                      Hot Aisles
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2"><Rows className="w-2.5 h-2.5" /> Select Row</div>
                    <div className="flex flex-wrap gap-1">
                      {gridRows.map(x => (
                        <button key={x} onClick={() => selectRow(x)} className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-[9px] text-slate-300 hover:bg-slate-700 transition-colors">R-{x}</button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2"><Columns className="w-2.5 h-2.5" /> Select Column</div>
                    <div className="flex flex-wrap gap-1">
                      {gridCols.map(z => (
                        <button key={z} onClick={() => selectCol(z)} className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-[9px] text-slate-300 hover:bg-slate-700 transition-colors">C-{z}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PAINT: Brush + Template */}
          {activeTool === 'paint' && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-tighter">Brush Size: {brushRadius}m</span>
                <input
                  type="range" min="1" max="10" step="0.5" value={brushRadius}
                  onChange={(e) => setBrushRadius(parseFloat(e.target.value))}
                  className="w-28 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cad-blue"
                />
              </div>
              <div className="relative">
                <button
                  onClick={() => setShowTemplates(!showTemplates)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg hover:border-slate-500 transition-colors"
                >
                  <div className={`w-2 h-2 rounded-full ${templates.find(t => t.id === activeTemplate)?.color || 'bg-slate-500'}`} />
                  <span className="text-[11px] font-bold text-slate-200 uppercase">{activeTemplate.replace('-', ' ')}</span>
                  <ChevronDown className="w-3 h-3 text-slate-500" />
                </button>
                {showTemplates && (
                  <div className="absolute bottom-full mb-2 left-0 min-w-[160px] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden p-1 z-50">
                    {templates.map(t => (
                      <button key={t.id} onClick={() => { setActiveTemplate(t.id as any); setShowTemplates(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-800 rounded-lg transition-colors text-left">
                        <div className={`w-2 h-2 rounded-full ${t.color}`} />
                        <span className="text-[11px] text-slate-300 font-medium">{t.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* BLOCK: Manage blocks */}
          {activeTool === 'block' && (
            <div className="relative">
              <button
                onClick={() => setShowBlocks(!showBlocks)}
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg hover:border-slate-500 transition-colors"
              >
                <LayoutGrid className="w-3 h-3 text-cad-blue" />
                <span className="text-[11px] font-bold text-slate-200 uppercase">Manage Blocks ({blocks.length})</span>
                <ChevronDown className="w-3 h-3 text-slate-500" />
              </button>
              {showBlocks && (
                <div className="absolute bottom-full mb-2 left-0 min-w-[240px] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden p-1 z-50">
                  {blocks.length === 0 ? (
                    <div className="px-3 py-4 text-[10px] text-slate-500 text-center italic">Use 'Region Select' to define blocks first.</div>
                  ) : (
                    blocks.map(b => (
                      <div key={b.id} className="flex items-center justify-between p-2 hover:bg-slate-800 rounded-lg group">
                        <div className="flex flex-col">
                          <span className="text-[11px] text-slate-200 font-bold">{b.name}</span>
                          <span className="text-[9px] text-slate-500 font-mono">{b.rackIds.length} Racks | {b.templateType}</span>
                        </div>
                        <button
                          onClick={() => { replicateBlock(b.id, [0, 0, 5]); setShowBlocks(false); }}
                          className="p-1.5 hover:bg-cad-blue/20 rounded text-cad-blue opacity-0 group-hover:opacity-100 transition-opacity" title="Replicate +5m"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* ZONE */}
          {activeTool === 'zone' && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-slate-500 italic">Drag to draw a logical zone.</span>
              {zones.map(z => (
                <div key={z.id} className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 px-2 py-1 rounded text-[10px] font-bold text-slate-300">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: z.color }} />
                  {z.name}
                  <button
                    onClick={() => { if (confirm(`Remove zone "${z.name}"?`)) removeZone(z.id); }}
                    className="ml-1 text-slate-500 hover:text-rose-400 transition-colors"
                  >×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Global Reset Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-700/50">
          <span className="text-[9px] text-slate-600 font-mono uppercase">Hyperscale Planning Palette</span>
          <div className="flex gap-2">
            <button className="p-1.5 text-slate-500 hover:text-white rounded hover:bg-slate-800 transition-colors" title="Export Topology">
              <Layers className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </FloatingPanel>
  );
};
