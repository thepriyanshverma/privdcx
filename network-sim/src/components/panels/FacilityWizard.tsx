import { useState } from 'react';
import { useDataCenterStore } from '../../store/useDataCenterStore';
import { useLayoutStore } from '../../store/useLayoutStore';
import { Settings, Maximize, Zap, Shield, Wand2 } from 'lucide-react';
import { FloatingPanel } from '../ui/FloatingPanel';

export const FacilityWizard = () => {
  const { facility, setFacilityConfig, generateLayout } = useDataCenterStore();
  const toggleCollapse = useLayoutStore(s => s.toggleCollapse);

  const [width, setWidth] = useState(facility.width);
  const [length, setLength] = useState(facility.length);
  const [power, setPower] = useState(facility.powerCapacityMW);
  const [cooling, setCooling] = useState(facility.coolingType);
  const [tier, setTier] = useState(facility.redundancyTier);

  const handleGenerate = () => {
    setFacilityConfig({ width, length, powerCapacityMW: power, coolingType: cooling, redundancyTier: tier });
    generateLayout();
    toggleCollapse('facility-config');
  };

  return (
    <FloatingPanel 
      id="facility-config" 
      title="Facility Configuration" 
      icon={<Settings className="w-4 h-4" />} 
      defaultX={420} 
      defaultY={80} 
      width={320}
    >
      <div className="flex flex-col gap-4 text-sm text-gray-300">
        
        {/* Dimensions */}
        <div className="flex flex-col gap-2">
          <label className="text-xs uppercase tracking-wider text-gray-500 flex items-center gap-2">
            <Maximize className="w-3 h-3" /> Area Dimensions (Meters)
          </label>
          <div className="flex gap-2">
            <div className="bg-black/30 border border-white/10 rounded flex-1 flex items-center px-2 py-1">
              <span className="text-gray-600 text-xs w-4">W</span>
              <input 
                type="number" 
                value={width} 
                onChange={(e) => setWidth(Number(e.target.value))}
                className="bg-transparent w-full text-white font-mono outline-none text-right" 
              />
            </div>
            <div className="bg-black/30 border border-white/10 rounded flex-1 flex items-center px-2 py-1">
              <span className="text-gray-600 text-xs w-4">L</span>
              <input 
                type="number" 
                value={length} 
                onChange={(e) => setLength(Number(e.target.value))}
                className="bg-transparent w-full text-white font-mono outline-none text-right" 
              />
            </div>
          </div>
          <div className="text-[10px] text-gray-500 text-right mt-1">
            Total Area: {(width * length).toLocaleString()} m²
          </div>
        </div>

        {/* Power */}
        <div className="flex flex-col gap-2">
          <label className="text-xs uppercase tracking-wider text-gray-500 flex items-center gap-2">
            <Zap className="w-3 h-3" /> Power Target
          </label>
          <div className="bg-black/30 border border-white/10 rounded flex items-center px-2 py-1">
             <input 
                type="number" 
                step="0.5"
                value={power} 
                onChange={(e) => setPower(Number(e.target.value))}
                className="bg-transparent w-full text-white font-mono outline-none" 
              />
              <span className="text-gray-500 text-xs font-mono ml-2">MW</span>
          </div>
        </div>

        {/* Tier */}
        <div className="flex flex-col gap-2">
          <label className="text-xs uppercase tracking-wider text-gray-500 flex items-center gap-2">
            <Shield className="w-3 h-3" /> Redundancy Tier
          </label>
          <select 
            value={tier}
            onChange={(e) => setTier(Number(e.target.value) as any)}
            className="w-full bg-black/30 border border-white/10 rounded px-2 py-1.5 text-white font-mono outline-none appearance-none"
          >
            <option value={1}>Tier I (Basic Capacity)</option>
            <option value={2}>Tier II (Redundant Components)</option>
            <option value={3}>Tier III (Concurrently Maintainable)</option>
            <option value={4}>Tier IV (Fault Tolerant)</option>
          </select>
        </div>

        {/* Cooling */}
        <div className="flex flex-col gap-2">
          <label className="text-xs uppercase tracking-wider text-gray-500 flex items-center gap-2">
            <Zap className="w-3 h-3" /> Cooling Type
          </label>
          <select 
            value={cooling}
            onChange={(e) => setCooling(e.target.value as any)}
            className="w-full bg-black/30 border border-white/10 rounded px-2 py-1.5 text-white font-mono outline-none appearance-none"
          >
            <option value="air">Air Cooled (CRAC)</option>
            <option value="liquid">Direct Liquid Cooling</option>
            <option value="hybrid">Air + Immersion Hybrid</option>
          </select>
        </div>

      </div>

      <div className="mt-4 pt-4 border-t border-slate-700/50">
        <button 
          onClick={handleGenerate}
          className="w-full flex items-center justify-center gap-2 bg-[var(--color-neon-blue)]/10 text-[var(--color-neon-blue)] border border-[var(--color-neon-blue)]/30 hover:bg-[var(--color-neon-blue)]/20 px-4 py-2 rounded transition font-medium tracking-wide text-sm shadow-[0_0_15px_rgba(0,243,255,0.1)] hover:shadow-[0_0_20px_rgba(0,243,255,0.2)]"
        >
          <Wand2 className="w-4 h-4" />
          Generate Auto Layout
        </button>
      </div>
    </FloatingPanel>
  );
};
