import { createPortal } from 'react-dom';
import { motion, useDragControls } from 'framer-motion';
import { ChevronUp, ChevronDown, GripHorizontal } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { useLayoutStore } from '../../store/useLayoutStore';

interface FloatingPanelProps {
  id: string;
  title: string;
  icon?: ReactNode;
  headerRight?: ReactNode;
  onClose?: () => void;
  children: ReactNode;
  defaultX?: number;
  defaultY?: number;
  width?: number;
}

export const FloatingPanel = ({ 
  id, 
  title, 
  icon, 
  headerRight,
  onClose,
  children, 
  defaultX = 20, 
  defaultY = 70,   // default below nav (nav ~56px)
  width = 380
}: FloatingPanelProps) => {
  const { panels, registerPanel, updatePanelPosition, toggleCollapse, bringToFront } = useLayoutStore();
  const dragControls = useDragControls();

  // Register on mount with persisted or default position
  useEffect(() => {
    registerPanel(id, defaultX, defaultY);
  }, [id, defaultX, defaultY, registerPanel]);

  const panelState = panels[id];
  if (!panelState) return null;

  const panel = (
    <motion.div
      // Render at the stored position via framer-motion transforms
      // LIVE CLAMPING: Ensures panel is always reachable even if store has bad data
      initial={{ 
        x: Math.max(0, Math.min(panelState.x, window.innerWidth - width)), 
        y: Math.max(60, Math.min(panelState.y, window.innerHeight - 40)) 
      }}
      animate={{ 
        x: Math.max(0, Math.min(panelState.x, window.innerWidth - width)), 
        y: Math.max(60, Math.min(panelState.y, window.innerHeight - 40)) 
      }}
      drag
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      onDragEnd={(_, info) => {
        const nextX = panelState.x + info.offset.x;
        const nextY = panelState.y + info.offset.y;
        
        // Safety Clamping: Ensure header is reachable
        // Min Y = 60 (below top nav), Min X = 0
        const clampedX = Math.max(0, Math.min(nextX, window.innerWidth - width));
        const clampedY = Math.max(60, Math.min(nextY, window.innerHeight - 40));
        
        updatePanelPosition(id, clampedX, clampedY);
      }}
      onMouseDown={() => bringToFront(id)}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: panelState.zIndex,
        width,
      }}
      className="bg-slate-900/95 border border-slate-700/80 rounded-xl backdrop-blur-md shadow-2xl pointer-events-auto flex flex-col overflow-hidden"
    >
      {/* Draggable Header */}
      <div 
        onPointerDown={(e) => dragControls.start(e)}
        className="flex items-center gap-2 p-3 border-b border-slate-700/80 cursor-grab active:cursor-grabbing bg-slate-800/50 hover:bg-slate-800/80 transition-colors select-none"
      >
        <GripHorizontal className="w-4 h-4 text-slate-500 mr-1" />
        {icon && <div className="text-cad-blue">{icon}</div>}
        <h2 className="text-[11px] uppercase font-bold text-slate-200 tracking-wider flex-1">
          {title}
        </h2>
        
        {headerRight && (
           <div className="flex items-center gap-2 mr-2 pointer-events-auto" onPointerDown={e => e.stopPropagation()}>
             {headerRight}
           </div>
        )}

        <button 
          onClick={(e) => { e.stopPropagation(); toggleCollapse(id); }}
          className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"
        >
          {panelState.isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>

        {onClose && (
          <button 
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="p-1 hover:bg-red-500/20 rounded text-slate-400 hover:text-red-400 transition-colors ml-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
            </svg>
          </button>
        )}
      </div>

      {/* Collapsible Content */}
      <motion.div 
        initial={false}
        animate={{ height: panelState.isCollapsed ? 0 : 'auto', opacity: panelState.isCollapsed ? 0 : 1 }}
        transition={{ duration: 0.2 }}
        className="overflow-hidden"
      >
        <div className="p-4">
          {children}
        </div>
      </motion.div>
    </motion.div>
  );

  // Portal to document.body — bypasses ALL parent stacking contexts
  return createPortal(panel, document.body);
};
