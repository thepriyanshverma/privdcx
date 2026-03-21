import { useNetworkStore } from '../../store/useNetworkStore';
import { useDataCenterStore } from '../../store/useDataCenterStore';
import { useProjectStore } from '../../store/useProjectStore';
import { DollarSign, Zap, Server, Package } from 'lucide-react';
import { FloatingPanel } from '../ui/FloatingPanel';

export const CostPanel = () => {
  const { devices } = useNetworkStore();
  const { racks, facility } = useDataCenterStore();
  const { pricing } = useProjectStore();

  let routerCount = 0;
  let switchCount = 0;
  let serverCount = 0;
  let totalPowerWatts = 0;

  Object.values(devices).forEach(dev => {
    if (dev.type === 'router') routerCount++;
    if (dev.type === 'switch') switchCount++;
    if (dev.type === 'server') serverCount++;
    totalPowerWatts += dev.powerWatts;
  });

  const rackCount = Object.keys(racks).length;
  const areaSqMeters = facility.width * facility.length;
  const realEstateCost = areaSqMeters * 10000;

  const hardCapex = (routerCount * pricing.routerCost)
    + (switchCount * pricing.switchCost)
    + (serverCount * pricing.serverCost)
    + (rackCount * pricing.rackCost);
  const totalCapex = hardCapex + realEstateCost;

  const itPowerKw = totalPowerWatts / 1000;
  const pue = facility.coolingType === 'liquid' ? 1.2 : 1.5;
  const totalFacilityKw = itPowerKw * pue;
  const monthlyPowerCost = totalFacilityKw * 730 * pricing.powerCostPerKwH;

  return (
    <FloatingPanel
      id="cost-panel"
      title="Financial Overview"
      icon={<DollarSign className="w-4 h-4" />}
      defaultX={20}
      defaultY={window.innerHeight - 320}
      width={340}
    >
      <div className="space-y-4">
        {/* CapEx */}
        <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/50">
          <div className="text-[10px] font-bold uppercase text-slate-500 mb-1 flex items-center gap-1.5">
            <DollarSign className="w-3 h-3" /> Capital Expenditure
          </div>
          <div className="text-2xl font-mono text-white font-light">
            ${totalCapex.toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-1 space-y-0.5">
            <div>Hardware: ${hardCapex.toLocaleString()}</div>
            <div>Real Estate: ${realEstateCost.toLocaleString()}</div>
          </div>
        </div>

        {/* OpEx */}
        <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/50">
          <div className="text-[10px] font-bold uppercase text-slate-500 mb-1 flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-amber-400" /> Monthly OPEX
          </div>
          <div className="text-2xl font-mono text-amber-400 font-light">
            ${Math.round(monthlyPowerCost).toLocaleString()}
            <span className="text-sm text-slate-400">/mo</span>
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-1">
            {totalFacilityKw.toFixed(1)} kW total (PUE {pue})
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-slate-800/40 rounded-lg p-2 text-center border border-slate-700/30">
            <span className="text-[9px] text-slate-500 uppercase block">Nodes</span>
            <span className="font-mono text-slate-200 text-sm">{Object.keys(devices).length}</span>
          </div>
          <div className="bg-slate-800/40 rounded-lg p-2 text-center border border-slate-700/30">
            <span className="text-[9px] text-slate-500 uppercase block">
              <Package className="w-3 h-3 mx-auto mb-0.5" />
              Racks
            </span>
            <span className="font-mono text-slate-200 text-sm">{rackCount}</span>
          </div>
          <div className="bg-slate-800/40 rounded-lg p-2 text-center border border-slate-700/30">
            <span className="text-[9px] text-slate-500 uppercase block">
              <Server className="w-3 h-3 mx-auto mb-0.5" />
              IT Load
            </span>
            <span className="font-mono text-cad-blue text-sm">{itPowerKw.toFixed(1)}kW</span>
          </div>
        </div>
      </div>
    </FloatingPanel>
  );
};
