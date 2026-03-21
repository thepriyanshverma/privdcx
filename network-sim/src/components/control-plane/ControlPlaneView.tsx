import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, PlusCircle, Terminal, Users } from 'lucide-react';
import { DashboardView } from './DashboardView';
import { OrchestrationView } from './OrchestrationView';
import { TeamView } from './TeamView';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'orchestration', label: 'Orchestration', icon: PlusCircle },
  { id: 'team', label: 'Team', icon: Users },
];

export const ControlPlaneView: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="flex h-full w-full bg-[#0B0F14] overflow-hidden">
      <aside className="w-64 border-r border-[#2D343F] bg-[#151921] flex flex-col p-4">
        <div className="flex items-center gap-3 px-2 mb-8 mt-2">
          <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
            <Terminal className="w-5 h-5 text-blue-400" />
          </div>
          <span className="font-bold text-white tracking-tight">Admin Terminal</span>
        </div>

        <nav className="flex-1 space-y-1">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                activeTab === tab.id
                  ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20 shadow-[0_0_20px_rgba(59,130,246,0.1)]'
                  : 'text-[#8E95A2] hover:text-white hover:bg-white/5'
              }`}>
              <tab.icon className="w-4 h-4" />
              <span className="text-sm font-medium">{tab.label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-auto pt-6 border-t border-[#2D343F] px-2">
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <span className="text-[10px] text-[#4A5568] uppercase font-bold tracking-widest">Platform Status</span>
              <div className="flex items-center gap-2 mt-1">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-xs text-white font-medium">CONNECTED</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto relative p-8">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div key="dashboard" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="h-full">
              <DashboardView />
            </motion.div>
          )}
          {activeTab === 'orchestration' && (
            <motion.div key="orchestration" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="h-full">
              <OrchestrationView />
            </motion.div>
          )}
          {activeTab === 'team' && (
            <motion.div key="team" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="h-full">
              <TeamView />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};
