import { useSimulationStore } from '../../store/useSimulationStore';
import { useNetworkStore } from '../../store/useNetworkStore';
import { motion } from 'framer-motion';

export const PacketAnimationOverlay = () => {
  const { packets } = useSimulationStore();
  const { devices, links } = useNetworkStore();

  return (
    <div className="absolute inset-0 pointer-events-none z-30">
      {Object.values(packets).map(packet => {
        let x = 0;
        let y = 0;

        if (devices[packet.currentHop]) {
          // Packet is at a device
          const device = devices[packet.currentHop];
          x = device.position.x;
          y = device.position.y;
        } else if (links[packet.currentHop]) {
          // Packet is along a link
          const link = links[packet.currentHop];
          const src = devices[link.sourceDevice];
          const tgt = devices[link.targetDevice];
          if (!src || !tgt) return null;

          // Simple linear interpolation
          x = src.position.x + (tgt.position.x - src.position.x) * packet.progress;
          y = src.position.y + (tgt.position.y - src.position.y) * packet.progress;
        } else {
          return null; // Orphaned packet
        }

        return (
          <motion.div
            key={packet.id}
            initial={false}
            animate={{ left: x, top: y }}
            transition={{ duration: 0.1, ease: 'linear' }} // smooth out engine ticks
            className="absolute w-4 h-4 rounded-full -ml-2 -mt-2 shadow-[0_0_15px_currentColor]"
            style={{
              backgroundColor: packet.color,
              color: packet.color
            }}
          />
        );
      })}
    </div>
  );
};
