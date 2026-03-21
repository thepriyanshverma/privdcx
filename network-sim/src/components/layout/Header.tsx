import { useProjectStore } from '../../store/useProjectStore';
import { useNetworkStore } from '../../store/useNetworkStore';
import { useSimulationStore } from '../../store/useSimulationStore';
import { useAuthStore } from '../../store/useAuthStore';
import { Activity, Play, Square, Settings2, Box, Network, LogOut, ChevronDown, Layout, RefreshCw, Terminal } from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLayoutStore } from '../../store/useLayoutStore';

export const Header = () => {
  const { projectName, viewMode, setViewMode } = useProjectStore();
  const { connectionMode, setConnectionMode } = useNetworkStore();
  const { isRunning, toggleSimulation } = useSimulationStore();
  
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);
  const setWorkspace = useAuthStore(s => s.setWorkspace);
  const currentWorkspaceId = useAuthStore(s => s.currentWorkspaceId);
  const resetLayout = useLayoutStore(s => s.resetLayout);

  const [isProfileOpen, setIsProfileOpen] = useState(false);

  return (
    <header className="h-14 border-b border-[var(--color-panel-border)] bg-[var(--color-dark-bg)] flex items-center justify-between px-6 select-none z-50 relative">
      <div className="flex items-center gap-4">
        <Activity className="w-6 h-6 text-[var(--color-cad-blue)]" />
        <div className="flex flex-col">
          <h1 className="font-semibold text-sm tracking-wide leading-tight">{projectName}</h1>
          <span className="text-[10px] text-blue-400 font-mono">WORKSPACE: {currentWorkspaceId?.toString().slice(0, 8) || 'NONE'}...</span>
        </div>
      </div>

      <div className="flex items-center gap-2 bg-black/40 p-1 rounded-lg border border-white/5">
        <button 
          onClick={() => setViewMode('2d')}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-md transition-all ${
            viewMode === '2d' 
            ? 'bg-[var(--color-cad-blue)]/20 text-[var(--color-cad-blue)] shadow-[0_0_15px_rgba(0,243,255,0.3)]' 
            : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Network className="w-4 h-4" />
          <span className="text-xs font-medium uppercase tracking-wider">Topology</span>
        </button>
        <button 
          onClick={() => setViewMode('3d')}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-md transition-all ${
            viewMode === '3d' 
            ? 'bg-[var(--color-cad-orange)]/20 text-[var(--color-cad-orange)] shadow-[0_0_15px_rgba(176,38,255,0.3)]' 
            : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Box className="w-4 h-4" />
          <span className="text-xs font-medium uppercase tracking-wider">3D Twin</span>
        </button>
        <button 
          onClick={() => setViewMode('control')}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-md transition-all ${
            viewMode === 'control' 
            ? 'bg-blue-500/20 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.3)]' 
            : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Terminal className="w-4 h-4" />
          <span className="text-xs font-medium uppercase tracking-wider">Control Plane</span>
        </button>
      </div>

      <div className="flex items-center gap-4">
        {viewMode === '2d' && (
          <button
            onClick={() => setConnectionMode(!connectionMode)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md border transition-all ${
              connectionMode 
              ? 'bg-[var(--color-cad-green)]/20 border-[var(--color-cad-green)] text-[var(--color-cad-green)]' 
              : 'border-[var(--color-panel-border)] text-gray-300 hover:border-gray-400'
            }`}
          >
            <Settings2 className="w-4 h-4" />
            <span className="text-xs">Connect Mode</span>
          </button>
        )}

        <button
          onClick={toggleSimulation}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-md border font-medium transition-all ${
            isRunning 
            ? 'bg-[var(--color-cad-red)]/10 border-[var(--color-cad-red)] text-[var(--color-cad-red)] hover:bg-[var(--color-cad-red)]/20' 
            : 'bg-[var(--color-cad-green)]/10 border-[var(--color-cad-green)] text-[var(--color-cad-green)] hover:bg-[var(--color-cad-green)]/20'
          }`}
        >
          {isRunning ? (
            <Square className="w-3.5 h-3.5 fill-current" />
          ) : (
            <Play className="w-3.5 h-3.5 fill-current" />
          )}
          <span className="text-xs uppercase tracking-widest">{isRunning ? 'Stop' : 'Start'}</span>
        </button>

        <div className="h-6 w-px bg-white/10 mx-2" />

        <div className="relative">
          <button 
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-full bg-[#151921] border border-[#2D343F] hover:border-[#4A5568] transition-colors"
          >
            <div className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center text-[10px] font-bold">
              {user?.full_name?.slice(0, 2).toUpperCase() || '??'}
            </div>
            <ChevronDown className="w-4 h-4 text-[#4A5568]" />
          </button>

          <AnimatePresence>
            {isProfileOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute right-0 mt-3 w-56 bg-[#1A1F29] border border-[#2D343F] rounded-xl shadow-2xl p-2 z-50"
              >
                <div className="px-3 py-3 border-b border-[#2D343F] mb-2">
                  <p className="text-sm font-semibold text-white">{user?.full_name}</p>
                  <p className="text-[10px] text-[#8E95A2] truncate">{user?.email}</p>
                </div>
                
                <button 
                  onClick={() => {
                    setWorkspace(null);
                    setIsProfileOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-xs text-[#8E95A2] hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                >
                  <Layout className="w-4 h-4" />
                  Switch Workspace
                </button>

                <button 
                  onClick={() => {
                    resetLayout();
                    setIsProfileOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-xs text-[#8E95A2] hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Reset UI Layout
                </button>

                <button 
                  onClick={() => logout()}
                  className="w-full flex items-center gap-3 px-3 py-2 text-xs text-red-400 hover:bg-red-400/10 rounded-lg transition-colors mt-1"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
};
