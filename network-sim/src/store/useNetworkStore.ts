import { create } from 'zustand';
import type { Device, Link, NetworkGraph } from '../types/network';

interface NetworkState {
  devices: Record<string, Device>;
  links: Record<string, Link>;
  graph: NetworkGraph; // O(1) adjacency map

  // Connection UX
  connectionMode: boolean;
  selectedSourcePort: { deviceId: string; portId: string } | null;
  
  // Selection
  selectedItem: { type: 'device' | 'link'; id: string } | null;

  // Actions
  addDevice: (device: Device) => void;
  updateDevicePosition: (id: string, x: number, y: number) => void;
  addLink: (link: Link) => void;
  removeDevice: (id: string) => void;
  removeLink: (id: string) => void;
  
  setConnectionMode: (enabled: boolean) => void;
  setSelectedSourcePort: (selection: { deviceId: string; portId: string } | null) => void;
  setSelectedItem: (item: { type: 'device' | 'link'; id: string } | null) => void;
}

const updateGraphOnAddLink = (graph: NetworkGraph, link: Link) => {
  const newGraph = { ...graph };
  if (!newGraph[link.sourceDevice]) newGraph[link.sourceDevice] = [];
  if (!newGraph[link.targetDevice]) newGraph[link.targetDevice] = [];
  
  if (!newGraph[link.sourceDevice].includes(link.targetDevice)) {
    newGraph[link.sourceDevice].push(link.targetDevice);
  }
  if (!newGraph[link.targetDevice].includes(link.sourceDevice)) {
    newGraph[link.targetDevice].push(link.sourceDevice);
  }
  return newGraph;
};

// ... add removeGraph logic later for full safety, omitted for MVP simplicity where a deleted node will just handle its own cleanup

export const useNetworkStore = create<NetworkState>((set) => ({
  devices: {},
  links: {},
  graph: {},
  
  connectionMode: false,
  selectedSourcePort: null,
  selectedItem: null,

  addDevice: (device) => set((state) => ({ 
    devices: { ...state.devices, [device.id]: device },
    graph: { ...state.graph, [device.id]: state.graph[device.id] || [] }
  })),

  updateDevicePosition: (id, x, y) => set((state) => {
    const device = state.devices[id];
    if (!device) return state;
    return {
      devices: {
        ...state.devices,
        [id]: { ...device, position: { x, y } }
      }
    };
  }),

  addLink: (link) => set((state) => {
    // Also update port `connectedTo`
    const srcDevice = state.devices[link.sourceDevice];
    const tgtDevice = state.devices[link.targetDevice];
    
    if (!srcDevice || !tgtDevice) return state;

    return {
      links: { ...state.links, [link.id]: link },
      graph: updateGraphOnAddLink(state.graph, link),
      devices: {
        ...state.devices,
        [link.sourceDevice]: {
          ...srcDevice,
          ports: srcDevice.ports.map(p => p.id === link.sourcePort ? { ...p, connectedTo: link.id } : p)
        },
        [link.targetDevice]: {
          ...tgtDevice,
          ports: tgtDevice.ports.map(p => p.id === link.targetPort ? { ...p, connectedTo: link.id } : p)
        }
      }
    };
  }),

  removeDevice: (id) => set((state) => {
    const newDevices = { ...state.devices };
    delete newDevices[id];
    
    // Cleanup links attached to this device
    const newLinks = { ...state.links };
    const newGraph = { ...state.graph };
    delete newGraph[id];

    Object.values(newLinks).forEach(link => {
      if (link.sourceDevice === id || link.targetDevice === id) {
        delete newLinks[link.id];
        // Omit removing from other side's graph for simplicity in this demo snippet
      }
    });

    return { devices: newDevices, links: newLinks, graph: newGraph, selectedItem: state.selectedItem?.id === id ? null : state.selectedItem };
  }),

  removeLink: (id) => set((state) => {
    const newLinks = { ...state.links };
    const link = newLinks[id];
    if (!link) return state;
    delete newLinks[id];

    // Note: Graph cleanup logic goes here
    return { links: newLinks };
  }),

  setConnectionMode: (enabled) => set({ connectionMode: enabled, selectedSourcePort: null }),
  setSelectedSourcePort: (selection) => set({ selectedSourcePort: selection }),
  setSelectedItem: (item) => set({ selectedItem: item }),
}));
