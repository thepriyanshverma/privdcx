import { NODE_VISUAL } from './topologyModel';
import { TopologyNodeShape } from './TopologySvgShapes';

const NODE_ORDER = ['facility', 'hall', 'rack', 'device', 'network', 'power', 'cooling'];
const NODE_LABELS = {
  facility: 'FACILITY',
  hall: 'HALL',
  rack: 'RACK',
  device: 'DEVICE',
  network: 'NETWORK',
  power: 'POWER',
  cooling: 'COOLING',
};

const EDGE_ITEMS = [
  { id: 'structural', label: 'STRUCTURAL', stroke: '#6d8096', dash: '' },
  { id: 'network', label: 'NETWORK', stroke: '#4da3ff', dash: '' },
  { id: 'power', label: 'POWER', stroke: '#ffd13d', dash: '6 4' },
  { id: 'cooling', label: 'COOLING', stroke: '#23d5be', dash: '2 3' },
];

export default function TopologyLegend({ className = '', stats, performanceMode = false }) {
  const nodeCount = Number(stats?.nodes || 0);
  const edgeCount = Number(stats?.edges || 0);
  const rackCount = Number(stats?.racks || 0);
  const deviceCount = Number(stats?.devices || 0);

  return (
    <div className={`topology-legend-panel ${className}`.trim()}>
      <div className="topology-legend-title">Legend</div>
      <div className="topology-legend-grid">
        {NODE_ORDER.map((type) => (
          <div key={type} className="topology-legend-row">
            <svg width="30" height="20" viewBox="0 0 30 20" aria-hidden="true">
              <TopologyNodeShape
                type={type}
                x={15}
                y={10}
                size={Math.min(7, NODE_VISUAL[type]?.size || 7)}
                stroke="#0f141a"
                strokeWidth={1}
              />
            </svg>
            <span>{NODE_LABELS[type] || type.toUpperCase()}</span>
          </div>
        ))}
      </div>
      <div className="topology-legend-title topology-legend-title-sub">Edges</div>
      <div className="topology-legend-grid">
        {EDGE_ITEMS.map((edge) => (
          <div key={edge.id} className="topology-legend-row">
            <svg width="30" height="14" aria-hidden="true">
              <line
                x1="2"
                y1="7"
                x2="28"
                y2="7"
                stroke={edge.stroke}
                strokeWidth="2"
                strokeDasharray={edge.dash}
                opacity="0.7"
              />
            </svg>
            <span>{edge.label}</span>
          </div>
        ))}
      </div>
      <div className="topology-legend-title topology-legend-title-sub">Details</div>
      <div className="topology-legend-details">
        <div className="topology-legend-detail-row">
          <span>Load</span>
          <strong>{nodeCount > 0 ? `${nodeCount}N / ${edgeCount}E` : '--'}</strong>
        </div>
        <div className="topology-legend-detail-row">
          <span>Inventory</span>
          <strong>{rackCount > 0 || deviceCount > 0 ? `${rackCount}R / ${deviceCount}D` : '--'}</strong>
        </div>
        <div className="topology-legend-detail-row">
          <span>Drag</span>
          <strong>Node + neighbors</strong>
        </div>
        <div className="topology-legend-detail-row">
          <span>Labels</span>
          <strong>{performanceMode ? 'Zoom-driven' : 'Detailed'}</strong>
        </div>
        <div className="topology-legend-note">Inner ring: temp/power, outer ring: network</div>
      </div>
    </div>
  );
}
