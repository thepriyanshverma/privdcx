import { type Equipment } from '../store/useDataCenterStore';

export interface HardwareProfile {
  id: string;
  name: string;
  type: Equipment['type'];
  powerW: number;
  heatBTU: number;
  uSize: number;
  failureRate: number;
  description: string;
}

// Real-world approximate specs for hyperscale datacenters
export const HARDWARE_CATALOG: Record<string, HardwareProfile> = {
  'ai-node-dgx': {
    id: 'ai-node-dgx',
    name: 'NVIDIA DGX H100 Node',
    type: 'server',
    powerW: 10200, // 10.2 kW per 8U node
    heatBTU: 34800, // Massive heat block
    uSize: 8,
    failureRate: 0.05,
    description: 'High-density GPU compute node for distributed LLM training.'
  },
  'ai-node-a100': {
    id: 'ai-node-a100',
    name: 'NVIDIA DGX A100 Node',
    type: 'server',
    powerW: 6500,
    heatBTU: 22178,
    uSize: 6,
    failureRate: 0.04,
    description: 'Standard 6U GPU compute block.'
  },
  'storage-dense': {
    id: 'storage-dense',
    name: 'Petabyte NVMe Array',
    type: 'storage',
    powerW: 1200,
    heatBTU: 4094,
    uSize: 4,
    failureRate: 0.02,
    description: 'High IOPS solid state storage fabric block.'
  },
  'storage-hdd': {
    id: 'storage-hdd',
    name: 'Archival HDD Array',
    type: 'storage',
    powerW: 900,
    heatBTU: 3000,
    uSize: 4,
    failureRate: 0.06,
    description: 'Cold storage magnetic array.'
  },
  'compute-1u': {
    id: 'compute-1u',
    name: 'General Compute 1U',
    type: 'server',
    powerW: 550,
    heatBTU: 1876,
    uSize: 1,
    failureRate: 0.03,
    description: 'Standard dual-socket x86 server node.'
  },
  'compute-2u': {
    id: 'compute-2u',
    name: 'High-Mem Compute 2U',
    type: 'server',
    powerW: 850,
    heatBTU: 2900,
    uSize: 2,
    failureRate: 0.03,
    description: 'Database virtualization target node.'
  },
  'network-core': {
    id: 'network-core',
    name: 'Core Spine Switch 100G',
    type: 'switch',
    powerW: 600,
    heatBTU: 2047,
    uSize: 2,
    failureRate: 0.01,
    description: 'Backbone network routing layer.'
  },
  'network-tor': {
    id: 'network-tor',
    name: 'Top-of-Rack Switch 25G',
    type: 'switch',
    powerW: 300,
    heatBTU: 1024,
    uSize: 1,
    failureRate: 0.02,
    description: 'Last-mile L2 fabric connection.'
  }
};
