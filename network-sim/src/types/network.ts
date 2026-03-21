export interface Port {
  id: string; // e.g. "eth0"
  connectedTo: string | null; // Link ID
}

export type DeviceType = 'router' | 'switch' | 'server' | 'pc' | 'firewall' | 'cloud';

export interface Device {
  id: string;
  type: DeviceType;
  position: { x: number; y: number };
  ports: Port[];
  config: {
    ip?: string;
    mac?: string;
    routingTable?: any[];
    status: 'up' | 'down';
  };
  powerWatts: number; // Cost engine
  heatOutput: number; // Cost engine
}

export interface Link {
  id: string;
  sourceDevice: string;
  sourcePort: string;
  targetDevice: string;
  targetPort: string;
  type: 'ethernet' | 'fiber';
  latency: number;
  bandwidth: number;
  status: 'up' | 'down';
}

export interface Packet {
  id: string;
  source: string; // Device ID
  destination: string; // Device ID
  currentHop: string; // Device ID or Link ID
  nextHop: string | null; // Resolved based on interface/routing table dynamically
  status: 'success' | 'failure' | 'in-flight' | 'delayed';
  color: string;
  progress: number; // 0 to 1 along the current hop
}

export type NetworkGraph = Record<string, string[]>; // { deviceId: [ connectedDeviceIds ] }
