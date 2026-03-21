import { useNetworkStore } from '../../store/useNetworkStore';
import { DeviceNode } from './DeviceNode';
import { Connection } from './Connection';
import { useState, useRef, useEffect } from 'react';

export const NetworkCanvas = () => {
  const { devices, links, setSelectedItem } = useNetworkStore();
  
  // Pan & Zoom state
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  
  const isDraggingCanvas = useRef(false);
  const startDragOffset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvasEl = document.getElementById('network-canvas');
    if (!canvasEl) return;
    
    const wheelListener = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const zoomFactor = -e.deltaY * 0.002;
        setScale(s => Math.min(Math.max(0.2, s + zoomFactor), 4));
      } else {
        setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
      }
    };

    canvasEl.addEventListener('wheel', wheelListener, { passive: false });
    return () => canvasEl.removeEventListener('wheel', wheelListener);
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    // Only pan on middle click or background left click
    if (e.button === 1 || (e.button === 0 && e.target === e.currentTarget)) {
      isDraggingCanvas.current = true;
      startDragOffset.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      document.body.style.cursor = 'grabbing';
      setSelectedItem(null); // deselect on background click
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDraggingCanvas.current) {
      setPan({
        x: e.clientX - startDragOffset.current.x,
        y: e.clientY - startDragOffset.current.y
      });
    }
  };

  const handlePointerUp = () => {
    isDraggingCanvas.current = false;
    document.body.style.cursor = 'default';
  };

  return (
    <div 
      id="network-canvas"
      className="absolute inset-0 bg-[#0B0C10] overflow-hidden"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      style={{
        backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)',
        backgroundSize: `${40 * scale}px ${40 * scale}px`,
        backgroundPosition: `${pan.x}px ${pan.y}px`,
      }}
    >
      <div 
        className="absolute origin-top-left w-full h-full pointer-events-none"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
        }}
      >
        {/* SVG layer for Links */}
        <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-auto">
          {Object.values(links).map(link => (
            <Connection key={link.id} link={link} />
          ))}
        </svg>

        {/* HTML layer for Nodes */}
        <div className="absolute inset-0 w-full h-full pointer-events-auto">
          {Object.values(devices).map(dev => (
            <DeviceNode key={dev.id} device={dev} />
          ))}
        </div>
      </div>
    </div>
  );
};
