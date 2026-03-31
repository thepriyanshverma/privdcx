import { NODE_VISUAL } from './topologyModel';
import { TopologyNodeShape } from './TopologySvgShapes';

const NODE_ORDER = ['facility', 'hall', 'rack', 'device', 'network', 'power', 'cooling'];

export default function TopologyLegend({ className = '' }) {
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
            <span>{type.toUpperCase()}</span>
          </div>
        ))}
      </div>
      <div className="topology-legend-title topology-legend-title-sub">Edges</div>
      <div className="topology-legend-grid">
        <div className="topology-legend-row">
          <svg width="30" height="14" aria-hidden="true"><line x1="2" y1="7" x2="28" y2="7" stroke="#4da3ff" strokeWidth="2" opacity="0.7" /></svg>
          <span>NETWORK</span>
        </div>
        <div className="topology-legend-row">
          <svg width="30" height="14" aria-hidden="true"><line x1="2" y1="7" x2="28" y2="7" stroke="#ffd13d" strokeWidth="2" strokeDasharray="6 4" opacity="0.7" /></svg>
          <span>POWER</span>
        </div>
        <div className="topology-legend-row">
          <svg width="30" height="14" aria-hidden="true"><line x1="2" y1="7" x2="28" y2="7" stroke="#23d5be" strokeWidth="2" strokeDasharray="2 3" opacity="0.7" /></svg>
          <span>COOLING</span>
        </div>
      </div>
    </div>
  );
}

