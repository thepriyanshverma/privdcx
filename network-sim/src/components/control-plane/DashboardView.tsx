import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTelemetryStore } from '../../store/useTelemetryStore';
import { Zap, Thermometer, ShieldAlert, Database, Box, Server, Activity, AlertCircle } from 'lucide-react';

export const DashboardView: React.FC = () => {
  const { overview, error, startPolling } = useTelemetryStore();

  useEffect(() => {
    const stopPolling = startPolling(3000);
    return () => stopPolling();
  }, []);

  const stats = [
    { label: 'Facilities', value: overview?.facilities?.length || 0, icon: Database, color: 'text-blue-400' },
    { label: 'Total Racks', value: overview?.racks?.length || 0, icon: Box, color: 'text-purple-400' },
    { label: 'Rule Engine', value: overview?.alert_status?.rule_count || 0, icon: Activity, color: 'text-green-400' },
    { label: 'Simulation', value: overview?.alert_status?.running ? 'Active' : 'Paused', icon: Server, color: 'text-orange-400' },
  ];

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <header>
        <h2 className="text-3xl font-bold text-white mb-2">Unified Dashboard</h2>
        <p className="text-[#8E95A2]">Real-time telemetry and infrastructure health overview</p>
      </header>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-sm">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="p-6 bg-[#151921] border border-[#2D343F] rounded-2xl shadow-xl flex items-start justify-between"
          >
            <div>
              <p className="text-[#8E95A2] text-sm font-medium mb-1">{stat.label}</p>
              <h3 className="text-2xl font-bold text-white">{stat.value}</h3>
            </div>
            <div className={`p-3 bg-white/5 rounded-xl ${stat.color}`}>
              <stat.icon className="w-6 h-6" />
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Telemetry Gauges */}
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-6">
          <GaugeCard 
            label="Grid Load" 
            value={overview?.metrics?.grid_load_mw || 0} 
            max={50} 
            unit="MW" 
            icon={Zap} 
            color="rgb(59, 130, 246)" 
          />
          <GaugeCard 
            label="Inlet Temp" 
            value={overview?.metrics?.avg_inlet_temp_c || 0} 
            max={40} 
            unit="°C" 
            icon={Thermometer} 
            color="rgb(52, 211, 153)" 
          />
          <GaugeCard 
            label="Risk Factor" 
            value={overview?.metrics?.avg_risk_index || 0} 
            max={1} 
            unit="IDX" 
            icon={ShieldAlert} 
            color="rgb(239, 68, 68)" 
          />
        </div>

        {/* System Snapshot */}
        <div className="p-6 bg-[#151921] border border-[#2D343F] rounded-2xl shadow-xl">
          <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-400" />
            Runtime Snapshot
          </h3>
          <div className="space-y-4">
            <div className="p-4 bg-[#0B0F14] rounded-xl border border-[#2D343F]">
                <p className="text-[#8E95A2] text-xs uppercase font-bold tracking-widest mb-2">Message</p>
                <p className="text-white text-sm font-mono">{overview?.runtime_snapshot?.message || 'Ready'}</p>
            </div>
            <div className="p-4 bg-[#0B0F14] rounded-xl border border-[#2D343F]">
                <p className="text-[#8E95A2] text-xs uppercase font-bold tracking-widest mb-2">Rule Engine</p>
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                    <p className="text-white text-sm">3 Rules Operational</p>
                </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const GaugeCard: React.FC<{ label: string, value: number, max: number, unit: string, icon: any, color: string }> = ({ label, value, max, unit, icon: Icon, color }) => {
  const percentage = (value / max) * 100;
  
  return (
    <div className="p-6 bg-[#151921] border border-[#2D343F] rounded-2xl shadow-xl relative overflow-hidden group">
      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-white/5 rounded-lg group-hover:scale-110 transition-transform">
            <Icon className="w-5 h-5" style={{ color }} />
          </div>
          <p className="text-[#8E95A2] text-sm font-medium">{label}</p>
        </div>
        
        <div className="flex items-baseline gap-2 mb-4">
          <h3 className="text-4xl font-bold text-white">{value}</h3>
          <span className="text-[#4A5568] text-sm font-bold">{unit}</span>
        </div>

        {/* Progress Bar */}
        <div className="h-2 bg-[#0B0F14] rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            className="h-full rounded-full"
            style={{ backgroundColor: color }}
          />
        </div>
      </div>
      
      {/* Background Decor */}
      <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
        <Icon size={120} />
      </div>
    </div>
  );
};
