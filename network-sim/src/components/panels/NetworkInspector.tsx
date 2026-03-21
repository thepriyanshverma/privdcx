import { useNetworkStore } from '../../store/useNetworkStore';
import { useProjectStore } from '../../store/useProjectStore';
import { useSimulationStore } from '../../store/useSimulationStore';
import { Settings, Info, Zap, Activity, Network as NetworkIcon, Send } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

export const NetworkInspector = () => {
  const { viewMode, pricing } = useProjectStore();
  const { selectedItem, devices, links, graph } = useNetworkStore();
  const { isRunning, addPacket } = useSimulationStore();

  // If in 3D mode, do not show 2D inspector
  if (viewMode === '3d') return null;

  const handlePing = (srcId: string, destId: string) => {
    addPacket({
      id: uuidv4(),
      source: srcId,
      destination: destId,
      currentHop: srcId,
      nextHop: destId,
      status: 'in-flight',
      color: 'var(--color-cad-blue)',
      progress: 0
    });
  };

  const renderDeviceInspector = (id: string) => {
    const device = devices[id];
    if (!device) return null;
    
    // Calculate connections
    const connectedNodeIds = graph[device.id] || [];
    const connectedDevices = connectedNodeIds.map(nId => devices[nId]).filter(Boolean);

    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-3 flex items-center gap-2">
            <Info className="w-4 h-4" /> Identity
          </h3>
          <div className="grid grid-cols-2 gap-2 text-sm bg-black/20 p-3 rounded-lg border border-white/5">
            <span className="text-gray-500">ID</span>
            <span className="font-mono text-[var(--color-cad-blue)] truncate" title={device.id}>{device.id.split('-')[0]}</span>
            
            <span className="text-gray-500">Type</span>
            <span className="capitalize text-white">{device.type}</span>
            
            <span className="text-gray-500">Status</span>
            <span className={device.config.status === 'up' ? 'text-[var(--color-cad-green)]' : 'text-[var(--color-cad-red)]'}>
              {device.config.status.toUpperCase()}
            </span>
            
            {device.config.ip && (
              <>
                <span className="text-gray-500">IP</span>
                <span className="font-mono text-gray-300">{device.config.ip}</span>
              </>
            )}
          </div>
        </div>

        <div>
           <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4" /> Hardware & Cost
          </h3>
          <div className="grid grid-cols-2 gap-2 text-sm bg-black/20 p-3 rounded-lg border border-white/5">
             <span className="text-gray-500">Power</span>
             <span className="text-gray-300">{device.powerWatts} W</span>
             <span className="text-gray-500">Heat</span>
             <span className="text-gray-300">{device.heatOutput} BTU/h</span>
             <span className="text-gray-500">Est. Price</span>
             <span className="text-[var(--color-cad-orange)] font-mono">
               ${device.type === 'router' ? pricing.routerCost : device.type === 'switch' ? pricing.switchCost : device.type === 'server' ? pricing.serverCost : 1000}
             </span>
          </div>
        </div>

        <div>
          <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4" /> Connectivity
          </h3>
          <div className="text-sm bg-black/20 p-3 rounded-lg border border-white/5 space-y-3">
            <div className="flex justify-between items-center pb-2 border-b border-white/5">
              <span className="text-gray-500">Total Ports</span>
              <span className="font-mono text-gray-300">{device.ports.length}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Connected Nodes</span>
              <span className="font-mono text-gray-300">{connectedDevices.length}</span>
            </div>
            {/* List connected peers */}
            {connectedDevices.length > 0 && (
              <div className="pt-2 border-t border-white/5 flex flex-col gap-2">
                <span className="text-[10px] text-gray-500 uppercase tracking-wide">Direct Links</span>
                <div className="flex flex-wrap gap-1">
                  {connectedDevices.map(peer => (
                    <button 
                      key={peer.id} 
                      onClick={() => handlePing(device.id, peer.id)}
                      title="Send Ping Packet"
                      className="group flex items-center gap-1 text-[10px] bg-[var(--color-cad-blue)]/10 text-[var(--color-cad-blue)] px-2 py-1 rounded border border-[var(--color-cad-blue)]/20 hover:bg-[var(--color-cad-blue)]/30 hover:border-[var(--color-cad-blue)]/50 transition"
                    >
                      {peer.type}-{peer.id.substring(0,4)}
                      <Send className="w-3 h-3 opacity-0 group-hover:opacity-100 -ml-2 group-hover:ml-0 transition-all" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderLinkInspector = (id: string) => {
    const link = links[id];
    if (!link) return null;
    const src = devices[link.sourceDevice];
    const tgt = devices[link.targetDevice];
    
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-3 flex items-center gap-2">
            <Info className="w-4 h-4" /> Link Profile
          </h3>
          <div className="grid grid-cols-2 gap-2 text-sm bg-black/20 p-3 rounded-lg border border-white/5">
            <span className="text-gray-500">Type</span>
            <span className="capitalize text-[var(--color-cad-blue)]">{link.type}</span>
            
            <span className="text-gray-500">Status</span>
            <span className={link.status === 'up' ? 'text-[var(--color-cad-green)]' : 'text-[var(--color-cad-red)]'}>
              {link.status.toUpperCase()}
            </span>

            <span className="text-gray-500">Bandwidth</span>
            <span className="font-mono text-gray-300">{link.bandwidth} Mbps</span>

            <span className="text-gray-500">Latency</span>
            <span className="font-mono text-gray-300">{link.latency} ms</span>
          </div>
        </div>

        <div>
          <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-3 flex items-center gap-2">
            <NetworkIcon className="w-4 h-4" /> Path
          </h3>
          <div className="flex flex-col gap-2 bg-black/20 p-3 rounded-lg border border-white/5">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">From</span>
              <span className="font-mono text-gray-300">{src?.type}-{src?.id.substring(0,4)} ({link.sourcePort})</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">To</span>
              <span className="font-mono text-gray-300">{tgt?.type}-{tgt?.id.substring(0,4)} ({link.targetPort})</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-80 border-l border-[var(--color-panel-border)] bg-[var(--color-dark-bg)] h-full flex flex-col shadow-[-4px_0_24px_rgba(0,0,0,0.5)] z-40 relative">
      <div className="px-5 py-4 border-b border-[var(--color-panel-border)] flex items-center gap-2">
        <Settings className="w-5 h-5 text-gray-400" />
        <h2 className="font-medium text-gray-200">Inspector</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {!selectedItem ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-500 text-sm italic opacity-50">
            <p>Select a device or link</p>
            <p>to view properties</p>
          </div>
        ) : (
          selectedItem.type === 'device' 
            ? renderDeviceInspector(selectedItem.id) 
            : renderLinkInspector(selectedItem.id)
        )}
      </div>

      {isRunning && (
        <div className="p-4 border-t border-[var(--color-panel-border)] bg-[var(--color-cad-green)]/5">
          <div className="flex items-center gap-2 text-[var(--color-cad-green)] text-xs font-mono uppercase">
             <div className="w-2 h-2 rounded-full bg-[var(--color-cad-green)] animate-pulse" />
             Engine Running
          </div>
        </div>
      )}
    </div>
  );
};
