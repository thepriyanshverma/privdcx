import { useNetworkStore } from '../../store/useNetworkStore';
import type { DeviceType } from '../../types/network';
import { Server, ArrowLeftRight as Switch, Router, Monitor, Shield, Cloud } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

const TOOLS: { type: DeviceType; label: string; icon: any }[] = [
  { type: 'router', label: 'Router', icon: Router },
  { type: 'switch', label: 'Switch', icon: Switch },
  { type: 'server', label: 'Server', icon: Server },
  { type: 'pc', label: 'PC', icon: Monitor },
  { type: 'firewall', label: 'Firewall', icon: Shield },
  { type: 'cloud', label: 'Cloud', icon: Cloud },
];

export const ToolPalette = () => {
  const addDevice = useNetworkStore(state => state.addDevice);

  const handleAddDevice = (type: DeviceType) => {
    // For MVP, randomly scatter near center
    // In a real app we'd use drag & drop to exact coordinates
    const viewportCenterX = window.innerWidth / 2;
    const viewportCenterY = window.innerHeight / 2;
    
    addDevice({
      id: uuidv4(),
      type,
      position: { 
        x: viewportCenterX + (Math.random() - 0.5) * 200, 
        y: viewportCenterY + (Math.random() - 0.5) * 200 
      },
      ports: [
        { id: 'eth0', connectedTo: null },
        { id: 'eth1', connectedTo: null },
      ], // Simplified: Give every device 2 ports for demo
      config: {
        status: 'up',
        ip: type !== 'switch' ? `192.168.1.${Math.floor(Math.random() * 254) + 1}` : undefined,
      },
      powerWatts: type === 'server' ? 500 : type === 'router' ? 200 : 50,
      heatOutput: type === 'server' ? 300 : type === 'router' ? 100 : 25,
    });
  };

  return (
    <div className="w-64 border-r border-[var(--color-panel-border)] bg-[var(--color-dark-bg)] h-full flex flex-col p-4 shadow-[4px_0_24px_rgba(0,0,0,0.5)] z-40 relative">
      <h2 className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-4">Network Devices</h2>
      
      <div className="grid grid-cols-2 gap-3">
        {TOOLS.map((tool) => (
          <div 
            key={tool.type}
            onClick={() => handleAddDevice(tool.type)}
            className="flex flex-col items-center justify-center p-3 rounded-xl bg-gray-800/40 border border-gray-700/50 hover:bg-gray-700/60 hover:border-gray-500 cursor-pointer transition-all hover:scale-105 active:scale-95 group"
          >
            <tool.icon className="w-8 h-8 text-gray-400 group-hover:text-[var(--color-cad-blue)] transition-colors" />
            <span className="text-xs font-medium mt-2 text-gray-300 group-hover:text-white">{tool.label}</span>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <h2 className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-4">Information</h2>
        <div className="text-xs text-gray-500 space-y-2">
          <p>Click a device icon above to add it to the canvas.</p>
          <p>Toggle <span className="text-[var(--color-cad-green)] font-mono">Connect Mode</span> in the header, then click port circles to wire devices.</p>
        </div>
      </div>
    </div>
  );
};
