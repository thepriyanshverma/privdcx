import { useState } from 'react';
import { useClusterStore, type ClusterType, type WorkloadProfile } from '../../store/useClusterStore';
import { useDataCenterStore } from '../../store/useDataCenterStore';
import { Server, Activity, LayoutGrid, Plus, Trash2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { FloatingPanel } from '../ui/FloatingPanel';

export const ClusterPlannerPanel = () => {
  const { clusters, addCluster, removeCluster } = useClusterStore();
  const { racks } = useDataCenterStore();
  const [isFormOpen, setIsFormOpen] = useState(false);

  // New Cluster Form State
  const [name, setName] = useState('AI Training Cluster A');
  const [type, setType] = useState<ClusterType>('ai');
  const [nodes, setNodes] = useState(64);
  const [powerPerNode, setPowerPerNode] = useState(10500); // 10.5kW DGX
  const [profile, setProfile] = useState<WorkloadProfile>('steady');

  const handleCreate = () => {
    // Generate placement (Auto Spread across empty slots)
    // Simplified placement: find racks that have capacity
    // We'll just distribute nodes evenly into available custom racks for now
    const assigned: { rackId: string, nodeCount: number }[] = [];
    let nodesLeft = nodes;
    
    // Sort racks by max power desc
    const availableRacks = Object.values(racks).filter(r => r.templateType === 'custom' || r.templateType === 'ai-cluster');
    
    // Very simple dense packing: Put as many nodes as possible into a rack until it hits 90% power
    for (const rack of availableRacks) {
      if (nodesLeft <= 0) break;
      const nodesThisRack = Math.min(nodesLeft, Math.floor((rack.maxPowerW * 0.9) / powerPerNode));
      if (nodesThisRack > 0) {
        assigned.push({ rackId: rack.id, nodeCount: nodesThisRack });
        nodesLeft -= nodesThisRack;
      }
    }

    addCluster({
      id: uuidv4(),
      name,
      type,
      nodeCount: nodes,
      powerPerNodeW: powerPerNode,
      workloadProfile: profile,
      color: type === 'ai' ? '#10b981' : type === 'storage' ? '#3b82f6' : '#f59e0b',
      assignedRacks: assigned,
      currentLoadMultiplier: 0.1
    });

    setIsFormOpen(false);
  };

  const totalClusters = Object.keys(clusters).length;

  return (
    <FloatingPanel 
      id="cluster-planner" 
      title="Workload Clusters" 
      icon={<Server className="w-4 h-4" />}
      defaultX={16} 
      defaultY={500}
      headerRight={
        <button 
          onClick={() => setIsFormOpen(!isFormOpen)}
          className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 px-2 py-0.5 rounded text-[9px] font-bold uppercase transition flex items-center gap-1"
        >
          <Plus className="w-3 h-3" /> New
        </button>
      }
    >
      {isFormOpen && (
        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 mb-4 space-y-3">
          <div>
            <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">Cluster Name</label>
            <input 
              value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">Type</label>
              <select value={type} onChange={e => setType(e.target.value as any)} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200">
                <option value="ai">AI Training</option>
                <option value="compute">General Compute</option>
                <option value="storage">Distributed Storage</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">Profile</label>
              <select value={profile} onChange={e => setProfile(e.target.value as any)} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200">
                <option value="steady">Steady State</option>
                <option value="bursty">Bursty / Spiky</option>
                <option value="periodic">Periodic (Sine)</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">Total Nodes</label>
              <input type="number" value={nodes} onChange={e => setNodes(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200" />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">Power/Node (W)</label>
              <input type="number" value={powerPerNode} onChange={e => setPowerPerNode(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200" />
            </div>
          </div>
          <button onClick={handleCreate} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] uppercase py-2 rounded transition mt-2">
            Generate Placement
          </button>
        </div>
      )}

      {totalClusters === 0 && !isFormOpen && (
        <div className="text-center py-4 bg-slate-800/30 rounded border border-slate-800 border-dashed">
          <p className="text-xs text-slate-500">No logical workload clusters defined.</p>
        </div>
      )}

      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
        {Object.values(clusters).map(c => (
          <div key={c.id} className="bg-slate-800/60 p-2.5 rounded border border-slate-700 border-l-2" style={{ borderLeftColor: c.color }}>
            <div className="flex justify-between items-start mb-1">
              <span className="text-[11px] font-bold text-slate-200">{c.name}</span>
              <button onClick={() => removeCluster(c.id)} className="text-slate-500 hover:text-red-400 transition"><Trash2 className="w-3 h-3" /></button>
            </div>
            <div className="flex gap-3 text-[9px] text-slate-400 font-mono">
              <span className="flex items-center gap-1"><LayoutGrid className="w-2.5 h-2.5" /> {c.assignedRacks.length} Racks</span>
              <span className="flex items-center gap-1"><Activity className="w-2.5 h-2.5" /> Load: {(c.currentLoadMultiplier * 100).toFixed(0)}%</span>
            </div>
          </div>
        ))}
      </div>
    </FloatingPanel>
  );
};
