import type { Link } from '../../types/network';
import { useNetworkStore } from '../../store/useNetworkStore';

export const Connection = ({ link }: { link: Link }) => {
  const { devices, selectedItem, setSelectedItem } = useNetworkStore();
  const src = devices[link.sourceDevice];
  const tgt = devices[link.targetDevice];
  
  if (!src || !tgt) return null;

  const isSelected = selectedItem?.type === 'link' && selectedItem.id === link.id;

  // Render a curved SVG path between the two devices
  // Ideally, this should map exactly to the port coordinates.
  // We approximate by using the center of the device for the MVP connection lines,
  // or offset slightly based on port count.
  const dx = tgt.position.x - src.position.x;
  const dy = tgt.position.y - src.position.y;
  const cx = src.position.x + dx / 2;
  const cy = src.position.y + dy / 2;
  
  // Bezier curve to make the lines look pretty
  const pathData = `M ${src.position.x} ${src.position.y} Q ${cx} ${cy - 50} ${tgt.position.x} ${tgt.position.y}`;
  
  const strokeColor = link.type === 'fiber' ? 'var(--color-cad-orange)' : 'var(--color-cad-blue)';

  return (
    <g 
      className="cursor-pointer"
      onClick={(e) => {
        e.stopPropagation();
        setSelectedItem({ type: 'link', id: link.id });
      }}
    >
      {/* Invisible wider hit area for easier clicking */}
      <path 
        d={pathData} 
        stroke="transparent" 
        strokeWidth={20} 
        fill="none" 
      />
      
      {/* Actual line */}
      <path
        d={pathData}
        stroke={strokeColor}
        strokeWidth={isSelected ? 4 : 2}
        fill="none"
        strokeDasharray={link.status === 'down' ? '5,5' : 'none'}
        className={`transition-all duration-300 ${isSelected ? 'opacity-100' : 'opacity-60'} hover:opacity-100 drop-shadow-[0_0_8px_${strokeColor}]`}
      />

      {/* Speed label */}
      <text 
        x={cx} 
        y={cy - 25} 
        textAnchor="middle" 
        fill="#94a3b8" 
        fontSize="10" 
        fontFamily="monospace"
        className="select-none pointer-events-none"
      >
        {link.bandwidth} Mbps ({link.latency}ms)
      </text>
    </g>
  );
};
