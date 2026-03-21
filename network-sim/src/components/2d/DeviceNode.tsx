import type { Device } from '../../types/network';
import { useNetworkStore } from '../../store/useNetworkStore';
import { Server, ArrowLeftRight as Switch, Router, Monitor, Shield, Cloud } from 'lucide-react';
import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

const ICONS = {
  router: Router,
  switch: Switch,
  server: Server,
  pc: Monitor,
  firewall: Shield,
  cloud: Cloud,
};

const COLORS = {
  router: 'text-[var(--color-cad-blue)]',
  switch: 'text-[var(--color-cad-green)]',
  server: 'text-[var(--color-cad-orange)]',
  pc: 'text-gray-300',
  firewall: 'text-[var(--color-cad-red)]',
  cloud: 'text-[var(--color-cad-blue)]',
};

export const DeviceNode = ({ device }: { device: Device }) => {
  const { 
    updateDevicePosition, 
    connectionMode, 
    selectedSourcePort, 
    setSelectedSourcePort,
    addLink,
    selectedItem,
    setSelectedItem
  } = useNetworkStore();
  
  const [isDragging, setIsDragging] = useState(false);
  const Icon = ICONS[device.type];
  const colorClass = COLORS[device.type];
  const isSelected = selectedItem?.type === 'device' && selectedItem.id === device.id;

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (connectionMode) return; // Don't drag in connect mode

    setSelectedItem({ type: 'device', id: device.id });
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    
    // Quick hack for movement relative to parent scale. 
    // Ideally requires exact matrix inverse, but keeping simple for MVP.
    const container = document.getElementById('network-canvas')?.firstElementChild as HTMLDivElement;
    if (!container) return;
    
    const transform = container.style.transform;
    const scaleMatch = transform.match(/scale\(([^)]+)\)/);
    const scale = scaleMatch ? parseFloat(scaleMatch[1]) : 1;

    updateDevicePosition(
      device.id,
      device.position.x + e.movementX / scale,
      device.position.y + e.movementY / scale
    );
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handlePortClick = (e: React.MouseEvent, portId: string) => {
    e.stopPropagation();
    if (!connectionMode) return;

    if (!selectedSourcePort) {
      // Start connection
      setSelectedSourcePort({ deviceId: device.id, portId });
    } else {
      // Finish connection if not same device
      if (selectedSourcePort.deviceId !== device.id) {
        addLink({
          id: uuidv4(),
          sourceDevice: selectedSourcePort.deviceId,
          sourcePort: selectedSourcePort.portId,
          targetDevice: device.id,
          targetPort: portId,
          type: 'ethernet',
          latency: 5,
          bandwidth: 1000,
          status: 'up'
        });
      }
      // Reset
      setSelectedSourcePort(null);
    }
  };

  return (
    <div
      className={`absolute w-16 h-16 -ml-8 -mt-8 rounded-xl flex items-center justify-center cursor-${connectionMode ? 'crosshair' : isDragging ? 'grabbing' : 'grab'} transition-shadow ${
        isSelected ? 'shadow-[0_0_20px_rgba(255,255,255,0.2)] bg-gray-800' : 'bg-[#1A1A24] hover:bg-gray-800'
      } border ${isSelected ? 'border-white/50' : 'border-white/10'}`}
      style={{
        left: device.position.x,
        top: device.position.y,
        zIndex: isSelected ? 20 : 10
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={(e) => {
        e.stopPropagation();
        if (!connectionMode) {
          setSelectedItem({ type: 'device', id: device.id });
        }
      }}
    >
      <Icon className={`w-8 h-8 ${colorClass} ${device.config.status === 'down' ? 'opacity-30 grayscale' : ''}`} />
      <span className="absolute -bottom-6 text-[10px] text-gray-400 font-mono text-nowrap select-none">{device.type}-{device.id.slice(0, 4)}</span>

      {/* Render Ports */}
      {device.ports.map((port, idx) => {
        const isSelectedPort = selectedSourcePort?.deviceId === device.id && selectedSourcePort?.portId === port.id;
        const isConnected = !!port.connectedTo;
        
        // Distribute ports around the node evenly
        const angle = (idx / device.ports.length) * Math.PI * 2;
        const radius = 38;
        const px = Math.cos(angle) * radius;
        const py = Math.sin(angle) * radius;

        return (
          <div
            key={port.id}
            id={`port-${device.id}-${port.id}`}
            onClick={(e) => handlePortClick(e, port.id)}
            className={`absolute w-3 h-3 rounded-full border-2 transition-all group ${
              connectionMode ? 'opacity-100 cursor-crosshair hover:scale-150' : 'opacity-0 pointer-events-none'
            } ${
              isSelectedPort 
                ? 'bg-[var(--color-cad-blue)] border-[var(--color-cad-blue)] shadow-[0_0_10px_var(--color-cad-blue)]' 
                : isConnected 
                  ? 'bg-gray-500 border-gray-400' 
                  : 'bg-[#1A1A24] border-gray-400'
            }`}
            style={{
              left: '50%',
              top: '50%',
              transform: `translate(calc(-50% + ${px}px), calc(-50% + ${py}px))`
            }}
          >
            {/* Tooltip for port name */}
            <div className="absolute opacity-0 group-hover:opacity-100 -top-6 left-1/2 -translate-x-1/2 bg-black text-white text-[9px] px-1 rounded pointer-events-none whitespace-nowrap z-50">
              {port.id}
            </div>
          </div>
        );
      })}
    </div>
  );
};
