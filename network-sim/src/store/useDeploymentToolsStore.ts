import { create } from 'zustand';
import type { Rack } from './useDataCenterStore';

export type DeploymentWorkflow = 'layout' | 'deployment' | 'operations' | 'finance';
export type DeploymentTool = 'navigate' | 'select' | 'add-rack' | 'move' | 'clone' | 'paint' | 'zone' | 'block';

interface DeploymentToolsState {
  activeWorkflow: DeploymentWorkflow;
  activeTool: DeploymentTool;
  activeTemplate: Rack['templateType'];
  selectionSet: Set<string>;
  hoveredRackId: string | null;
  semanticFilter: { type: 'tenant' | 'cluster' | 'zone' | 'template' | null, id: string | null };

  // New CAD Drag State
  isDragging: boolean;
  dragType: 'move' | 'clone' | null;
  dragTargetId: string | null;
  dragStartIntersection: [number, number, number] | null;
  dragOriginalPositions: Record<string, [number, number, number]>;

  isPainting: boolean;
  brushRadius: number;
  isShiftPressed: boolean;
  isDrawing: boolean;
  
  setActiveWorkflow: (workflow: DeploymentWorkflow) => void;
  setActiveTool: (tool: DeploymentTool) => void;
  setActiveTemplate: (template: Rack['templateType']) => void;
  setHoveredRackId: (id: string | null) => void;
  setSemanticFilter: (type: 'tenant' | 'cluster' | 'zone' | 'template' | null, id: string | null) => void;
  
  startDrag: (
    type: 'move' | 'clone', 
    targetId: string, 
    startPoint: [number, number, number], 
    originals: Record<string, [number, number, number]>
  ) => void;
  stopDrag: () => void;
  
  toggleSelection: (id: string, multi?: boolean) => void;
  clearSelection: () => void;
  setSelection: (ids: string[]) => void;
  setIsPainting: (painting: boolean) => void;
  setBrushRadius: (radius: number) => void;
  setShiftPressed: (pressed: boolean) => void;
  setIsDrawing: (drawing: boolean) => void;
}

export const useDeploymentToolsStore = create<DeploymentToolsState>((set) => ({
  activeWorkflow: 'layout',
  activeTool: 'navigate',
  activeTemplate: 'custom',
  selectionSet: new Set(),
  hoveredRackId: null,
  semanticFilter: { type: null, id: null },
  
  isDragging: false,
  dragType: null,
  dragTargetId: null,
  dragStartIntersection: null,
  dragOriginalPositions: {},

  isPainting: false,
  brushRadius: 2.5,
  isShiftPressed: false,
  isDrawing: false,

  setActiveWorkflow: (workflow) => set({ activeWorkflow: workflow }),
  setActiveTool: (tool) => set({ activeTool: tool }),
  setActiveTemplate: (template) => set({ activeTemplate: template }),
  setHoveredRackId: (id) => set({ hoveredRackId: id }),
  setSemanticFilter: (type, id) => set({ semanticFilter: { type, id } }),
  
  startDrag: (type, targetId, startPoint, originals) => set({
    isDragging: true,
    dragType: type,
    dragTargetId: targetId,
    dragStartIntersection: startPoint,
    dragOriginalPositions: originals
  }),
  stopDrag: () => set({ 
    isDragging: false, 
    dragType: null, 
    dragTargetId: null, 
    dragStartIntersection: null, 
    dragOriginalPositions: {} 
  }),
  
  toggleSelection: (id, multi) => set((state) => {
    const nextSelection = multi ? new Set(state.selectionSet) : new Set<string>();
    
    // Toggle Logic: If it's already selected and we aren't using multi-select, 
    // it results in deselection if it was the only one.
    // If we ARE using multi-select, it toggles that specific ID.
    if (state.selectionSet.has(id)) {
      if (multi || state.selectionSet.size === 1) {
        nextSelection.delete(id);
      } else {
        // Just select this one if it was part of a larger selection but not anymore
        nextSelection.clear();
        nextSelection.add(id);
      }
    } else {
      nextSelection.add(id);
    }
    
    return { selectionSet: nextSelection };
  }),

  clearSelection: () => set({ selectionSet: new Set() }),
  
  setSelection: (ids) => set({ selectionSet: new Set(ids) }),

  setIsPainting: (painting) => set({ isPainting: painting }),
  setBrushRadius: (radius) => set({ brushRadius: radius }),
  setShiftPressed: (pressed) => set({ isShiftPressed: pressed }),
  setIsDrawing: (drawing: boolean) => set({ isDrawing: drawing })
}));
