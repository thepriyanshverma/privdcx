import { useEffect, useRef } from 'react';
import { useSimulationStore } from '../../store/useSimulationStore';
import { useNetworkStore } from '../../store/useNetworkStore';
// Type imports removed if unused

// Simple shortest path using BFS on our O(1) adjacency graph
const findNextHop = (
  graph: Record<string, string[]>, 
  currentDevice: string, 
  targetDevice: string
): string | null => {
  if (currentDevice === targetDevice) return currentDevice;

  const queue: string[] = [currentDevice];
  const visited = new Set<string>([currentDevice]);
  const parentMap = new Map<string, string>(); // node -> parent

  while (queue.length > 0) {
    const node = queue.shift()!;
    if (node === targetDevice) break;

    const neighbors = graph[node] || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        parentMap.set(neighbor, node);
        queue.push(neighbor);
      }
    }
  }

  // Backtrack to find the first hop from currentDevice
  let step = targetDevice;
  if (!parentMap.has(step)) return null; // No path found

  while (parentMap.get(step) !== currentDevice) {
    step = parentMap.get(step)!;
  }
  return step;
};

// Finds the link ID connecting two devices
const getConnectingLink = (
  links: Record<string, any>,
  deviceA: string,
  deviceB: string
): string | null => {
  for (const link of Object.values(links)) {
    if (
      (link.sourceDevice === deviceA && link.targetDevice === deviceB) ||
      (link.sourceDevice === deviceB && link.targetDevice === deviceA)
    ) {
      return link.id;
    }
  }
  return null;
};

export const useEngine = () => {
  const isRunning = useSimulationStore(s => s.isRunning);
  const tickRateMs = useSimulationStore(s => s.tickRateMs);
  
  // We cannot use the raw store destructured map because it creates a stale closure
  // in `requestAnimationFrame`. Instead, we get the state accessor.
  const store = useSimulationStore;
  const netStore = useNetworkStore;
  
  const lastTickRef = useRef<number>(0);
  const frameId = useRef<number | null>(null);

  useEffect(() => {
    if (!isRunning) {
      if (frameId.current) cancelAnimationFrame(frameId.current);
      return;
    }

    const tick = (timestamp: number) => {
      if (timestamp - lastTickRef.current >= tickRateMs) {
        lastTickRef.current = timestamp;

        const { packets, updatePacket, removePacket } = store.getState();
        const { graph, links, devices } = netStore.getState();

        // Process all running packets
        Object.values(packets).forEach(packet => {
          if (packet.status !== 'in-flight') return;

          if (devices[packet.currentHop]) {
            // It is currently at a device node, needs to decide next hop and move onto a link
            if (packet.currentHop === packet.destination) {
              updatePacket(packet.id, { status: 'success', color: 'var(--color-cad-green)' });
              
              // Remove successful packets after 2 seconds
              setTimeout(() => removePacket(packet.id), 2000);
              return;
            }

            // Route Calculation
            const nextNodeId = findNextHop(graph, packet.currentHop, packet.destination);
            if (!nextNodeId) {
              updatePacket(packet.id, { status: 'failure', color: 'var(--color-cad-red)' });
              setTimeout(() => removePacket(packet.id), 2000);
              return;
            }

            // Move packet onto the connecting link
            const linkId = getConnectingLink(links, packet.currentHop, nextNodeId);
            if (!linkId) {
              updatePacket(packet.id, { status: 'failure', color: 'var(--color-cad-red)' });
              setTimeout(() => removePacket(packet.id), 2000);
              return;
            }

            updatePacket(packet.id, { 
               currentHop: linkId, 
               nextHop: nextNodeId,
               progress: 0 
            });

          } else if (links[packet.currentHop]) {
            // It is currently traveling along a link
            const link = links[packet.currentHop];
            
            // Calculate speed based on bandwidth/latency (simplified for MVP animations)
            // latency: 10ms means full path takes 10 ticks approx
            const speed = Math.max(0.01, 1 / (link.latency));
            
            if (packet.progress + speed >= 1) {
              // Reached the end of the link, move onto the next device node
              // We reset progress and mark current hop as the destination device
              updatePacket(packet.id, {
                currentHop: packet.nextHop!,
                nextHop: null,
                progress: 0
              });
            } else {
              // Still animating along the link
              updatePacket(packet.id, { progress: packet.progress + speed });
            }
          }
        });
      }

      frameId.current = requestAnimationFrame(tick);
    };

    frameId.current = requestAnimationFrame(tick);
    return () => {
      if (frameId.current) cancelAnimationFrame(frameId.current);
    };
  }, [isRunning, tickRateMs]); // empty deps since we use state getters
};
