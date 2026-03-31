import { NODE_VISUAL } from './topologyModel';

function pointsToString(points) {
  return points.map(([x, y]) => `${x},${y}`).join(' ');
}

export function TopologyNodeShape({
  type,
  x,
  y,
  size,
  fill,
  stroke = '#0f141a',
  strokeWidth = 1.2,
  opacity = 1,
  className = '',
}) {
  const visual = NODE_VISUAL[type] || NODE_VISUAL.unknown;
  const resolvedSize = Number(size || visual.size || 7);
  const resolvedFill = fill || visual.color;

  if (visual.shape === 'square') {
    return (
      <rect
        className={className}
        x={x - resolvedSize}
        y={y - resolvedSize}
        width={resolvedSize * 2}
        height={resolvedSize * 2}
        fill={resolvedFill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        opacity={opacity}
        rx={2}
      />
    );
  }

  if (visual.shape === 'roundedRect') {
    return (
      <rect
        className={className}
        x={x - resolvedSize * 1.5}
        y={y - resolvedSize * 0.8}
        width={resolvedSize * 3}
        height={resolvedSize * 1.6}
        fill={resolvedFill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        opacity={opacity}
        rx={Math.max(4, resolvedSize * 0.45)}
      />
    );
  }

  if (visual.shape === 'rackRect') {
    return (
      <rect
        className={className}
        x={x - resolvedSize * 1.7}
        y={y - resolvedSize * 0.55}
        width={resolvedSize * 3.4}
        height={resolvedSize * 1.1}
        fill={resolvedFill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        opacity={opacity}
        rx={2}
      />
    );
  }

  if (visual.shape === 'diamond') {
    const points = pointsToString([
      [x, y - resolvedSize * 1.2],
      [x + resolvedSize * 1.05, y],
      [x, y + resolvedSize * 1.2],
      [x - resolvedSize * 1.05, y],
    ]);
    return (
      <polygon
        className={className}
        points={points}
        fill={resolvedFill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        opacity={opacity}
      />
    );
  }

  if (visual.shape === 'hexagon') {
    const points = pointsToString(
      Array.from({ length: 6 }, (_, index) => {
        const angle = (Math.PI / 3) * index;
        return [x + Math.cos(angle) * resolvedSize * 1.15, y + Math.sin(angle) * resolvedSize * 1.15];
      })
    );
    return (
      <polygon
        className={className}
        points={points}
        fill={resolvedFill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        opacity={opacity}
      />
    );
  }

  if (visual.shape === 'triangle') {
    const points = pointsToString([
      [x, y - resolvedSize * 1.3],
      [x + resolvedSize * 1.12, y + resolvedSize],
      [x - resolvedSize * 1.12, y + resolvedSize],
    ]);
    return (
      <polygon
        className={className}
        points={points}
        fill={resolvedFill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        opacity={opacity}
      />
    );
  }

  return (
    <circle
      className={className}
      cx={x}
      cy={y}
      r={resolvedSize}
      fill={resolvedFill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      opacity={opacity}
    />
  );
}

