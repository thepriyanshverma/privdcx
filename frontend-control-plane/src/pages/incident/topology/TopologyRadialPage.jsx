import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { select } from 'd3-selection';
import { zoom as d3Zoom, zoomIdentity } from 'd3-zoom';
import {
  NODE_VISUAL,
  buildHierarchyEdges,
  normalizeRuntimeStatus,
} from './topologyModel';
import { TopologyNodeShape } from './TopologySvgShapes';

const INFRA_TYPES = new Set(['network', 'power', 'cooling']);
const RING_RADIUS = {
  facility: 0,
  hall: 180,
  rack: 340,
  infra: 500,
  device: 640,
};

function sortById(a, b) {
  return String(a).localeCompare(String(b));
}

function computeRadialLayout(model) {
  const positions = new Map();
  if (!model || model.nodes.length === 0) return positions;

  const facilities = model.nodes.filter((node) => node.type === 'facility').map((node) => node.id).sort(sortById);
  const fallbackFacility = facilities[0] || null;

  if (fallbackFacility) {
    positions.set(fallbackFacility, { x: 0, y: 0, angle: 0 });
  }

  const halls = model.nodes.filter((node) => node.type === 'hall').map((node) => node.id).sort(sortById);
  const primaryHalls = fallbackFacility
    ? (model.hallsByFacility.get(fallbackFacility) || []).slice().sort(sortById)
    : halls;
  const fallbackHalls = halls.filter((hallId) => !primaryHalls.includes(hallId));
  const allHalls = [...primaryHalls, ...fallbackHalls];

  const hallAngleMap = new Map();
  const hallStep = (Math.PI * 2) / Math.max(allHalls.length, 1);
  allHalls.forEach((hallId, index) => {
    const angle = index * hallStep;
    hallAngleMap.set(hallId, angle);
    positions.set(hallId, {
      x: Math.cos(angle) * RING_RADIUS.hall,
      y: Math.sin(angle) * RING_RADIUS.hall,
      angle,
    });
  });

  const racks = model.nodes.filter((node) => node.type === 'rack').map((node) => node.id).sort(sortById);
  const racksByHall = new Map();
  allHalls.forEach((hallId) => racksByHall.set(hallId, []));
  racks.forEach((rackId) => {
    const hallId = model.rackToHall.get(rackId) || allHalls[0] || '__unassigned_hall__';
    if (!racksByHall.has(hallId)) racksByHall.set(hallId, []);
    racksByHall.get(hallId).push(rackId);
  });
  if (!hallAngleMap.has('__unassigned_hall__')) hallAngleMap.set('__unassigned_hall__', 0);

  const rackAngleMap = new Map();
  const hallSector = (Math.PI * 2) / Math.max(allHalls.length || 1, 1);

  racksByHall.forEach((rackIds, hallId) => {
    const hallAngle = hallAngleMap.get(hallId) || 0;
    const sortedRacks = rackIds.slice().sort(sortById);
    const spread = hallSector * 0.65;

    sortedRacks.forEach((rackId, index) => {
      const t = sortedRacks.length <= 1 ? 0 : (index / (sortedRacks.length - 1)) - 0.5;
      const angle = hallAngle + (t * spread);
      rackAngleMap.set(rackId, angle);
      positions.set(rackId, {
        x: Math.cos(angle) * RING_RADIUS.rack,
        y: Math.sin(angle) * RING_RADIUS.rack,
        angle,
      });
    });
  });

  model.infraToRack.forEach((rackId, infraId) => {
    if (!positions.has(rackId)) return;
    const rackAngle = rackAngleMap.get(rackId) || 0;
    const infraNode = model.nodeById.get(infraId);
    const offset = infraNode?.type === 'network' ? -0.08 : infraNode?.type === 'power' ? 0.06 : 0.14;
    const angle = rackAngle + offset;
    positions.set(infraId, {
      x: Math.cos(angle) * RING_RADIUS.infra,
      y: Math.sin(angle) * RING_RADIUS.infra,
      angle,
    });
  });

  model.deviceToRack.forEach((rackId, deviceId) => {
    const rackAngle = rackAngleMap.get(rackId);
    if (rackAngle === undefined) return;
    const deviceList = model.devicesByRack.get(rackId) || [];
    const index = Math.max(0, deviceList.indexOf(deviceId));
    const span = Math.max(0.03, Math.min(0.12, deviceList.length > 0 ? 0.2 / deviceList.length : 0.08));
    const angle = rackAngle + (index - (deviceList.length - 1) / 2) * span;
    positions.set(deviceId, {
      x: Math.cos(angle) * RING_RADIUS.device,
      y: Math.sin(angle) * RING_RADIUS.device,
      angle,
    });
  });

  const unresolved = model.nodes.filter((node) => !positions.has(node.id)).sort((a, b) => a.id.localeCompare(b.id));
  unresolved.forEach((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(unresolved.length, 1);
    const radius = RING_RADIUS.device + 120;
    positions.set(node.id, {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      angle,
    });
  });

  return positions;
}

function computeViewBox(points) {
  if (points.length === 0) return '-500 -400 1000 800';

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padding = 120;
  return `${minX - padding} ${minY - padding} ${Math.max(860, maxX - minX + padding * 2)} ${Math.max(660, maxY - minY + padding * 2)}`;
}

function shouldShowLabel({ node, zoomLevel, hoveredNodeId, selectedEntityId }) {
  if (node.id === hoveredNodeId) return true;
  if (node.id === selectedEntityId) return true;
  return zoomLevel >= 1.95;
}

function levelColor(level, isRoot = false) {
  if (isRoot || level <= 0) return '#ff5c5c';
  return '#ffd13d';
}

function nodeStatusClass(status) {
  const normalized = normalizeRuntimeStatus(status);
  return `state-${normalized.toLowerCase()}`;
}

function alertLevelFromList(alertList) {
  if (!Array.isArray(alertList) || alertList.length === 0) return '';
  const critical = alertList.some((alert) => String(alert?.severity || '').toUpperCase().includes('CRITICAL'));
  return critical ? 'critical' : 'warning';
}

function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

function metricIntensity(node, entityMetricsMap) {
  const live = entityMetricsMap?.[node.id] || {};
  const t = Number(live.temperature ?? node.metrics?.temperature ?? node.attributes?.temp_c ?? node.attributes?.temperature);
  const p = Number(live.power ?? node.metrics?.power ?? node.attributes?.power_kw ?? node.attributes?.powerKw);
  const n = Number(live.networkUsage ?? node.metrics?.network ?? node.attributes?.network_usage ?? node.attributes?.latency_ms);
  return {
    temperature: clamp01((t - 25) / 35),
    power: clamp01(p / 25),
    network: clamp01(n / 100),
  };
}

function heatmapColor(intensity) {
  const value = clamp01(intensity);
  if (value >= 0.85) return '#ff4f4f';
  if (value >= 0.65) return '#ff7a3c';
  if (value >= 0.45) return '#ffb020';
  if (value >= 0.25) return '#ffe082';
  return '#4d6379';
}

export default function TopologyRadialPage({
  model,
  selectedEntityId,
  onEntitySelect,
  onEntityInspect,
  onBackgroundSelect,
  entityLiveMap,
  alertsByEntity,
  blastMode,
  blastData,
  rootCauseEntityId = '',
  focusMode,
  dependencyChainSet,
  pathMode = false,
  pathNodeSet = new Set(),
  pathEdgeSet = new Set(),
  layerToggles = { structural: true, network: true, power: true, cooling: true },
  heatmapMode = false,
  entityMetricsMap = {},
  initialTransform,
  onTransformChange,
  performanceMode,
}) {
  const svgRef = useRef(null);
  const viewportRef = useRef(null);
  const transformRef = useRef(initialTransform || { x: 0, y: 0, k: 1 });
  const clickDelayRef = useRef(0);

  const baseLayout = useMemo(() => computeRadialLayout(model), [model]);
  const hierarchyEdges = useMemo(() => buildHierarchyEdges(model), [model]);
  const neighbors = useMemo(() => {
    const set = new Set();
    if (!selectedEntityId) return set;
    hierarchyEdges.forEach((edge) => {
      if (edge.source === selectedEntityId) set.add(edge.target);
      if (edge.target === selectedEntityId) set.add(edge.source);
    });
    return set;
  }, [hierarchyEdges, selectedEntityId]);
  const [hoveredNodeId, setHoveredNodeId] = useState('');
  const [zoomLevel, setZoomLevel] = useState(Number(initialTransform?.k || 1));

  const handleNodeSingleClick = useCallback((nodeId) => {
    if (!nodeId) return;
    if (clickDelayRef.current) {
      window.clearTimeout(clickDelayRef.current);
      clickDelayRef.current = 0;
    }
    clickDelayRef.current = window.setTimeout(() => {
      clickDelayRef.current = 0;
      onEntitySelect(nodeId);
    }, 200);
  }, [onEntitySelect]);

  const handleNodeDoubleClick = useCallback((nodeId) => {
    if (!nodeId) return;
    if (clickDelayRef.current) {
      window.clearTimeout(clickDelayRef.current);
      clickDelayRef.current = 0;
    }
    if (onEntityInspect) onEntityInspect(nodeId);
  }, [onEntityInspect]);

  useEffect(() => {
    const svgNode = svgRef.current;
    const viewportNode = viewportRef.current;
    if (!svgNode || !viewportNode) return undefined;

    const svgSelection = select(svgNode);
    const viewportSelection = select(viewportNode);

    const zoomBehavior = d3Zoom()
      .scaleExtent([0.2, 6])
      .on('zoom', (event) => {
        transformRef.current = { x: event.transform.x, y: event.transform.y, k: event.transform.k };
        viewportSelection.attr('transform', event.transform.toString());
      })
      .on('end', () => {
        const current = transformRef.current;
        setZoomLevel(Number(current.k || 1));
        if (onTransformChange) onTransformChange(current);
      });

    svgSelection.call(zoomBehavior).on('dblclick.zoom', null);

    const initial = initialTransform || { x: 0, y: 0, k: 1 };
    const transform = zoomIdentity.translate(initial.x || 0, initial.y || 0).scale(initial.k || 1);
    svgSelection.call(zoomBehavior.transform, transform);

    return () => {
      svgSelection.on('.zoom', null);
      if (clickDelayRef.current) {
        window.clearTimeout(clickDelayRef.current);
        clickDelayRef.current = 0;
      }
    };
  }, [initialTransform, onTransformChange]);

  const nodes = useMemo(
    () => (model?.nodes || []).map((node) => ({
      ...node,
      x: baseLayout.get(node.id)?.x ?? 0,
      y: baseLayout.get(node.id)?.y ?? 0,
      status: normalizeRuntimeStatus(entityLiveMap?.[node.id]?.status || node?.attributes?.status || 'ACTIVE'),
      alertLevel: alertLevelFromList(alertsByEntity?.[node.id] || node?.alerts || []),
      alertCount: Number((alertsByEntity?.[node.id] || node?.alerts || []).length),
    })),
    [model, baseLayout, entityLiveMap, alertsByEntity]
  );

  const maxBlastLevel = useMemo(() => {
    if (!blastMode || !blastData) return 0;
    return Math.max(0, ...[...blastData.levels.values()].map((level) => Number(level || 0)));
  }, [blastMode, blastData]);

  const hasPath = pathMode && pathNodeSet && pathNodeSet.size > 0;
  const pathNodeMembership = useMemo(() => {
    const set = new Set();
    if (!hasPath) return set;
    pathNodeSet.forEach((id) => set.add(String(id)));
    return set;
  }, [hasPath, pathNodeSet]);
  const pathEdgeMembership = useMemo(() => {
    const set = new Set();
    if (!hasPath) return set;
    pathEdgeSet.forEach((id) => set.add(String(id)));
    return set;
  }, [hasPath, pathEdgeSet]);

  const highlightedPathEdges = useMemo(() => {
    return new Set();
  }, []);

  const viewBox = useMemo(
    () => computeViewBox(nodes),
    [nodes]
  );

  return (
    <div className="topology-view-body">
      <svg
        ref={svgRef}
        className="topology-svg"
        viewBox={viewBox}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          onBackgroundSelect();
        }}
        role="img"
        aria-label="Radial topology view"
      >
        <g ref={viewportRef}>
          <g>
            {hierarchyEdges.map((edge) => {
              const source = baseLayout.get(edge.source);
              const target = baseLayout.get(edge.target);
              if (!source || !target) return null;

              const sourceType = model.nodeById.get(edge.source)?.type;
              const targetType = model.nodeById.get(edge.target)?.type;
              const touchesInfra = INFRA_TYPES.has(sourceType) || INFRA_TYPES.has(targetType);
              const layerType = sourceType === 'network' || targetType === 'network'
                ? 'network'
                : sourceType === 'power' || targetType === 'power'
                  ? 'power'
                  : sourceType === 'cooling' || targetType === 'cooling'
                    ? 'cooling'
                    : 'structural';
              if (!layerToggles[layerType]) return null;

              if (
                touchesInfra
                && !blastMode
                && !selectedEntityId
                && hoveredNodeId !== edge.source
                && hoveredNodeId !== edge.target
              ) {
                return null;
              }

              const inFocus = selectedEntityId
                ? (focusMode
                  ? dependencyChainSet.has(edge.source) && dependencyChainSet.has(edge.target)
                  : edge.source === selectedEntityId || edge.target === selectedEntityId)
                : true;

              let stroke = '#5a6e86';
              let opacity = inFocus ? 0.2 : 0.05;
              let width = inFocus ? 1.05 : 0.8;

              if (blastMode && blastData) {
                const sourceLevel = blastData.levels.get(edge.source);
                const targetLevel = blastData.levels.get(edge.target);
                const affected = sourceLevel !== undefined || targetLevel !== undefined;
                if (!affected) {
                  opacity = 0.1;
                } else {
                  const level = Math.max(Number(sourceLevel || 0), Number(targetLevel || 0));
                  stroke = levelColor(level, edge.source === selectedEntityId || edge.target === selectedEntityId);
                  opacity = 0.82;
                  width = 1.45;
                }
                if (highlightedPathEdges.has(`${edge.source}->${edge.target}`)) {
                  stroke = '#ffffff';
                  width = 2;
                  opacity = 0.95;
                }
              }

              if (hasPath) {
                const isPathEdge = pathEdgeMembership.has(`${edge.source}->${edge.target}`) || pathEdgeMembership.has(`${edge.target}->${edge.source}`);
                if (isPathEdge) {
                  stroke = '#8cd3ff';
                  opacity = 1;
                  width = 2.2;
                } else {
                  opacity = 0.08;
                }
              }

              return (
                <line
                  key={edge.id}
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke={stroke}
                  strokeOpacity={opacity}
                  strokeWidth={width}
                />
              );
            })}
          </g>

          {blastMode && blastData && selectedEntityId && maxBlastLevel > 0 && (() => {
            const center = baseLayout.get(selectedEntityId);
            if (!center) return null;
            return (
              <g className="blast-ring-layer">
                {Array.from({ length: Math.min(3, maxBlastLevel + 1) }).map((_, index) => {
                  const level = index;
                  const radius = 120 * (level + 1);
                  return (
                    <circle
                      key={`blast-ring-${level}`}
                      cx={center.x}
                      cy={center.y}
                      r={radius}
                      fill="none"
                      stroke={levelColor(level)}
                      strokeWidth={1}
                      strokeOpacity={0.22}
                      className={`blast-ring${performanceMode ? ' no-anim' : ''}`}
                    />
                  );
                })}
              </g>
            );
          })()}

          <g>
            {nodes.map((node) => {
              const visual = NODE_VISUAL[node.type] || NODE_VISUAL.unknown;
              const isSelected = selectedEntityId && node.id === selectedEntityId;
              const isRootCause = rootCauseEntityId && node.id === rootCauseEntityId;
              const isNeighbor = neighbors.has(node.id);
              const isFocusChain = focusMode && dependencyChainSet.has(node.id);
              const blastLevel = blastData?.levels?.get(node.id);
              const blastAffected = blastMode && blastData ? blastData.impactedSet.has(node.id) : false;
              const alertLevel = node.alertLevel || '';
              const hasAlerts = node.alertCount > 0;
              const metrics = metricIntensity(node, entityMetricsMap);

              let opacity = selectedEntityId
                ? (focusMode
                  ? (isFocusChain ? 0.95 : 0.1)
                  : (isSelected ? 1 : isNeighbor ? 0.95 : 0.1))
                : (node.type === 'device' ? 0.28 : 1);

              if (hasPath) {
                opacity = pathNodeMembership.has(node.id) ? 1 : 0.08;
              }

              if (blastMode && blastData) {
                opacity = blastAffected ? 0.98 : 0.1;
              }

              const size = visual.size * (isSelected ? 1.35 : 1);
              let fill = visual.color;
              let stroke = isSelected ? '#ffffff' : '#0f141a';
              if (heatmapMode) {
                const density = clamp01((node.alertCount / 6) + ((metrics.temperature + metrics.power + metrics.network) / 3) * 0.6);
                fill = heatmapColor(density);
                stroke = density > 0.6 ? '#ffd2d2' : '#d6e4f3';
              }
              if (blastMode && blastData) {
                if (isSelected) {
                  fill = '#ff5c5c';
                  stroke = '#ffffff';
                } else if (blastAffected) {
                  fill = '#ffd13d';
                  stroke = '#182536';
                }
                if (blastLevel !== undefined) {
                  stroke = levelColor(blastLevel, isSelected);
                }
              } else if (hasAlerts) {
                fill = alertLevel === 'critical' ? '#ff5c5c' : '#ffb020';
                stroke = alertLevel === 'critical' ? '#ffd2d2' : '#ffe7a7';
              }

              if (isRootCause) {
                fill = '#ff4f4f';
                stroke = '#ffffff';
              }

              const shapeClass = `topology-node-shape ${nodeStatusClass(node.status)}${isSelected ? ' selected' : ''}${isRootCause ? ' root-cause' : ''}${hasAlerts ? ` has-alert alert-${alertLevel}` : ''}${performanceMode ? ' no-anim' : ''}`;

              return (
                <g
                  key={node.id}
                  data-node-id={node.id}
                  className="topology-node-group"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleNodeSingleClick(node.id);
                  }}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    handleNodeDoubleClick(node.id);
                  }}
                  onMouseEnter={() => {
                    if (!performanceMode) setHoveredNodeId(node.id);
                  }}
                  onMouseLeave={() => {
                    if (!performanceMode) setHoveredNodeId('');
                  }}
                >
                  <circle
                    className={`topology-metric-ring${performanceMode ? ' no-anim' : ''}`}
                    cx={node.x}
                    cy={node.y}
                    r={Math.max(size + 3.6, 6)}
                    fill="none"
                    stroke={metrics.temperature > 0.72 ? '#ff6a5f' : metrics.temperature > 0.52 ? '#ffb020' : '#46d2a8'}
                    strokeWidth={0.8 + metrics.power * 1.7}
                    strokeOpacity={Math.max(0.16, metrics.temperature)}
                  />
                  <TopologyNodeShape
                    className={shapeClass}
                    type={node.type}
                    x={node.x}
                    y={node.y}
                    size={size}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={isSelected ? 1.9 : blastAffected ? 1.4 : 1}
                    opacity={opacity}
                  />

                  {shouldShowLabel({
                    node,
                    zoomLevel,
                    hoveredNodeId,
                    selectedEntityId,
                  }) && (
                    <text
                      x={node.x + size + 6}
                      y={node.y + 3}
                      className="topology-node-label"
                      opacity={opacity}
                    >
                      {node.displayName}
                      {isRootCause ? ' [ROOT]' : ''}
                      {hasAlerts ? ` !${node.alertCount}` : ''}
                    </text>
                  )}

                  <title>{`${node.displayName} (${node.type}) | ${node.status}`}</title>
                </g>
              );
            })}
          </g>
        </g>
      </svg>
    </div>
  );
}
