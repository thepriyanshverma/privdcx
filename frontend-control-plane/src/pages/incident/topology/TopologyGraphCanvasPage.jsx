import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
} from 'd3-force';
import { NODE_VISUAL, normalizeRuntimeStatus } from './topologyModel';

const INFRA_TYPES = new Set(['network', 'power', 'cooling']);
const SUPPORTED_TYPES = new Set(['facility', 'hall', 'rack', 'device', 'network', 'power', 'cooling']);
const EDGE_STYLES = {
  structural: { stroke: '#6d8096', opacity: 0.55, dash: [] },
  network: { stroke: '#4da3ff', opacity: 0.65, dash: [] },
  power: { stroke: '#ffd13d', opacity: 0.65, dash: [6, 4] },
  cooling: { stroke: '#25d6c0', opacity: 0.65, dash: [2, 5] },
};

const LARGE_NODE_THRESHOLD = 1800;
const LARGE_EDGE_THRESHOLD = 3000;
const MIN_ZOOM = 0.12;
const MAX_ZOOM = 8;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function resolveNodeId(value) {
  if (value && typeof value === 'object' && value.id) return String(value.id);
  return String(value || '');
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function clamp01(value) {
  return clamp(Number(value), 0, 1);
}

function hashString(value) {
  const text = String(value || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function severityMatches(node, severity, entityLiveMap) {
  if (!severity || severity === 'ALL') return true;
  const normalized = String(severity).toUpperCase();
  const liveStatus = normalizeRuntimeStatus(entityLiveMap?.[node.id]?.status || '');
  const nodeStatus = String(node?.attributes?.status || node?.attributes?.state || '').toUpperCase();
  if (normalized === 'CRITICAL') {
    return liveStatus === 'FAILED' || nodeStatus.includes('CRITICAL') || nodeStatus.includes('FAILED');
  }
  if (normalized === 'WARNING') {
    return liveStatus === 'DEGRADED' || liveStatus === 'AT_RISK' || nodeStatus.includes('WARNING') || nodeStatus.includes('RISK');
  }
  return true;
}

function edgeTypeFromNodes(source, target) {
  if (!source || !target) return 'structural';
  if (source.type === 'rack' && INFRA_TYPES.has(target.type)) return target.type;
  if (target.type === 'rack' && INFRA_TYPES.has(source.type)) return source.type;
  return 'structural';
}

function worldBounds(transform, width, height, padding = 0) {
  const k = Math.max(MIN_ZOOM, Number(transform.k || 1));
  return {
    left: ((0 - Number(transform.x || 0)) / k) - padding,
    right: ((width - Number(transform.x || 0)) / k) + padding,
    top: ((0 - Number(transform.y || 0)) / k) - padding,
    bottom: ((height - Number(transform.y || 0)) / k) + padding,
  };
}

function inBounds(node, bounds, padding = 0) {
  const x = Number(node?.x);
  const y = Number(node?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return x >= bounds.left - padding
    && x <= bounds.right + padding
    && y >= bounds.top - padding
    && y <= bounds.bottom + padding;
}

function resolveClusterMode(totalNodes, zoomLevel) {
  if (totalNodes < LARGE_NODE_THRESHOLD) return 'none';
  if (zoomLevel < 0.3) return 'hall';
  if (zoomLevel < 1) return 'rack';
  return 'none';
}

function buildGraph(model) {
  if (!model) {
    return {
      nodes: [],
      links: [],
      nodeById: new Map(),
      rackToHall: new Map(),
      rackToFacility: new Map(),
    };
  }

  const nodeById = new Map();
  asArray(model.nodes)
    .filter((node) => SUPPORTED_TYPES.has(node?.type))
    .forEach((node) => {
      nodeById.set(node.id, {
        ...node,
        parentRackId: String(node.parentRackId || ''),
      });
    });

  const rackToHall = new Map(model.rackToHall || []);
  const hallToFacility = new Map(model.hallToFacility || []);
  const rackToFacility = new Map(model.rackToFacility || []);
  const deviceToRack = new Map(model.deviceToRack || []);
  const infraToRack = new Map(model.infraToRack || []);

  const links = [];
  const seen = new Set();

  const addLink = (source, target, type = 'structural') => {
    const sourceId = resolveNodeId(source);
    const targetId = resolveNodeId(target);
    if (!sourceId || !targetId || sourceId === targetId) return;
    if (!nodeById.has(sourceId) || !nodeById.has(targetId)) return;
    const a = sourceId <= targetId ? sourceId : targetId;
    const b = sourceId <= targetId ? targetId : sourceId;
    const signature = `${a}|${b}|${type}`;
    if (seen.has(signature)) return;
    seen.add(signature);
    links.push({
      id: signature,
      source: sourceId,
      target: targetId,
      type,
    });
  };

  hallToFacility.forEach((facilityId, hallId) => addLink(facilityId, hallId, 'structural'));
  rackToHall.forEach((hallId, rackId) => addLink(hallId, rackId, 'structural'));

  deviceToRack.forEach((rackId, deviceId) => {
    const node = nodeById.get(deviceId);
    if (node) node.parentRackId = rackId;
    addLink(rackId, deviceId, 'structural');
  });

  infraToRack.forEach((rackId, infraId) => {
    const node = nodeById.get(infraId);
    if (node) node.parentRackId = rackId;
    const type = INFRA_TYPES.has(node?.type) ? node.type : 'structural';
    addLink(rackId, infraId, type);
  });

  asArray(model.edges).forEach((edge) => {
    const sourceId = resolveNodeId(edge.source);
    const targetId = resolveNodeId(edge.target);
    const sourceNode = nodeById.get(sourceId);
    const targetNode = nodeById.get(targetId);
    if (!sourceNode || !targetNode) return;
    const type = edgeTypeFromNodes(sourceNode, targetNode);
    addLink(sourceId, targetId, type);
  });

  const degree = new Map();
  links.forEach((edge) => {
    const sourceId = resolveNodeId(edge.source);
    const targetId = resolveNodeId(edge.target);
    degree.set(sourceId, Number(degree.get(sourceId) || 0) + 1);
    degree.set(targetId, Number(degree.get(targetId) || 0) + 1);
  });

  const nodes = [...nodeById.values()].filter((node) => Number(degree.get(node.id) || 0) > 0);
  const filteredNodeById = new Map(nodes.map((node) => [node.id, node]));
  const filteredLinks = links.filter((edge) => filteredNodeById.has(resolveNodeId(edge.source)) && filteredNodeById.has(resolveNodeId(edge.target)));

  return {
    nodes,
    links: filteredLinks,
    nodeById: filteredNodeById,
    rackToHall,
    rackToFacility,
  };
}

function drawCanvasShape(ctx, type, x, y, size) {
  const visual = NODE_VISUAL[type] || NODE_VISUAL.unknown;
  const shape = visual.shape || 'circle';

  if (shape === 'square') {
    ctx.beginPath();
    ctx.rect(x - size, y - size, size * 2, size * 2);
    return;
  }

  if (shape === 'roundedRect') {
    const width = size * 3;
    const height = size * 1.6;
    const rx = Math.max(4, size * 0.45);
    ctx.beginPath();
    ctx.moveTo(x - width / 2 + rx, y - height / 2);
    ctx.lineTo(x + width / 2 - rx, y - height / 2);
    ctx.quadraticCurveTo(x + width / 2, y - height / 2, x + width / 2, y - height / 2 + rx);
    ctx.lineTo(x + width / 2, y + height / 2 - rx);
    ctx.quadraticCurveTo(x + width / 2, y + height / 2, x + width / 2 - rx, y + height / 2);
    ctx.lineTo(x - width / 2 + rx, y + height / 2);
    ctx.quadraticCurveTo(x - width / 2, y + height / 2, x - width / 2, y + height / 2 - rx);
    ctx.lineTo(x - width / 2, y - height / 2 + rx);
    ctx.quadraticCurveTo(x - width / 2, y - height / 2, x - width / 2 + rx, y - height / 2);
    ctx.closePath();
    return;
  }

  if (shape === 'rackRect') {
    ctx.beginPath();
    ctx.rect(x - size * 1.7, y - size * 0.55, size * 3.4, size * 1.1);
    return;
  }

  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
}

function layoutStaticHierarchy(nodeMap, graph, width, height) {
  const nodes = [...nodeMap.values()];
  if (nodes.length === 0) return;

  const halls = nodes.filter((node) => node.type === 'hall').map((node) => node.id).sort((a, b) => a.localeCompare(b));
  const racks = nodes.filter((node) => node.type === 'rack').map((node) => node.id).sort((a, b) => a.localeCompare(b));

  const hallCols = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, halls.length))));
  const hallCenters = new Map();
  halls.forEach((hallId, index) => {
    const row = Math.floor(index / hallCols);
    const col = index % hallCols;
    hallCenters.set(hallId, {
      x: (col - (hallCols - 1) / 2) * 560,
      y: (row - Math.floor((halls.length - 1) / hallCols) / 2) * 420,
    });
  });

  const racksByHall = new Map();
  racks.forEach((rackId) => {
    const hallId = graph.rackToHall.get(rackId) || halls[0] || '';
    if (!racksByHall.has(hallId)) racksByHall.set(hallId, []);
    racksByHall.get(hallId).push(rackId);
  });

  racksByHall.forEach((rackIds, hallId) => {
    const center = hallCenters.get(hallId) || { x: 0, y: 0 };
    const cols = Math.max(2, Math.ceil(Math.sqrt(Math.max(1, rackIds.length))));
    rackIds.sort((a, b) => a.localeCompare(b)).forEach((rackId, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      const rack = nodeMap.get(rackId);
      if (!rack) return;
      rack.x = center.x + (col - (cols - 1) / 2) * 145;
      rack.y = center.y + 30 + row * 115;
      rack.vx = 0;
      rack.vy = 0;
    });
  });

  halls.forEach((hallId) => {
    const hall = nodeMap.get(hallId);
    const center = hallCenters.get(hallId);
    if (!hall || !center) return;
    hall.x = center.x;
    hall.y = center.y - 125;
    hall.vx = 0;
    hall.vy = 0;
  });

  const facilities = nodes.filter((node) => node.type === 'facility').map((node) => node.id).sort((a, b) => a.localeCompare(b));
  facilities.forEach((facilityId, index) => {
    const facility = nodeMap.get(facilityId);
    if (!facility) return;
    facility.x = (index - (facilities.length - 1) / 2) * 240;
    facility.y = -230;
    facility.vx = 0;
    facility.vy = 0;
  });

  const childrenByRack = new Map();
  nodes.forEach((node) => {
    if (!node.parentRackId) return;
    if (!childrenByRack.has(node.parentRackId)) childrenByRack.set(node.parentRackId, []);
    childrenByRack.get(node.parentRackId).push(node.id);
  });

  childrenByRack.forEach((childIds, rackId) => {
    const rack = nodeMap.get(rackId);
    if (!rack) return;
    childIds.sort((a, b) => a.localeCompare(b));
    childIds.forEach((nodeId, index) => {
      const node = nodeMap.get(nodeId);
      if (!node) return;
      const ring = Math.floor(index / 14);
      const slot = index % 14;
      const count = Math.min(14, Math.max(1, childIds.length - ring * 14));
      const angle = ((Math.PI * 2) * slot) / count + ((hashString(rackId) % 360) * Math.PI / 180);
      const radius = (node.type === 'device' ? 34 : 62) + ring * 16;
      node.x = Number(rack.x || 0) + Math.cos(angle) * radius;
      node.y = Number(rack.y || 0) + Math.sin(angle) * radius;
      node.vx = 0;
      node.vy = 0;
    });
  });

  const unresolved = nodes.filter((node) => !Number.isFinite(node.x) || !Number.isFinite(node.y));
  unresolved.forEach((node, index) => {
    node.x = (index % 10) * 80;
    node.y = Math.floor(index / 10) * 80;
    node.vx = 0;
    node.vy = 0;
  });

  nodes.forEach((node) => {
    node.x = Number(node.x || 0) + width / 2;
    node.y = Number(node.y || 0) + height / 2;
  });
}

export default function TopologyGraphCanvasPage({
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
  propagationMode = true,
  initialTransform,
  onTransformChange,
  performanceMode,
  facilityFilter = '',
  severityFilter = '',
}) {
  const graph = useMemo(() => buildGraph(model), [model]);

  const canvasRef = useRef(null);
  const simulationRef = useRef(null);
  const linkForceRef = useRef(null);
  const nodeStoreRef = useRef(new Map());
  const linkStoreRef = useRef([]);
  const childrenByRackRef = useRef(new Map());
  const frameRef = useRef(0);
  const drawRef = useRef(() => {});
  const renderMetaRef = useRef({ hitNodes: [] });
  const dragRef = useRef(null);
  const clickTimerRef = useRef(0);
  const lastClickRef = useRef({ nodeId: '', ts: 0 });
  const stopTimerRef = useRef(0);
  const transformCommitRef = useRef(0);
  const sizeRef = useRef({ width: 1600, height: 900, dpr: 1 });
  const transformRef = useRef({
    x: Number(initialTransform?.x || 0),
    y: Number(initialTransform?.y || 0),
    k: clamp(Number(initialTransform?.k || 1), MIN_ZOOM, MAX_ZOOM),
  });

  const [zoomLevel, setZoomLevel] = useState(Number(initialTransform?.k || 1));
  const [expandedClusterId, setExpandedClusterId] = useState('');
  const [expandedClusterType, setExpandedClusterType] = useState('');
  const [visibleCount, setVisibleCount] = useState(0);

  const pathNodeMembership = useMemo(() => {
    const set = new Set();
    if (!pathMode) return set;
    pathNodeSet.forEach((id) => set.add(String(id)));
    return set;
  }, [pathMode, pathNodeSet]);

  const pathEdgeMembership = useMemo(() => {
    const set = new Set();
    if (!pathMode) return set;
    pathEdgeSet.forEach((id) => set.add(String(id)));
    return set;
  }, [pathMode, pathEdgeSet]);

  const clusterMode = useMemo(() => resolveClusterMode(graph.nodes.length, zoomLevel), [graph.nodes.length, zoomLevel]);

  const rackChildrenMap = useMemo(() => {
    const map = new Map();
    graph.nodes.forEach((node) => {
      if (!node.parentRackId) return;
      if (!map.has(node.parentRackId)) map.set(node.parentRackId, { devices: [], infra: [] });
      if (node.type === 'device') map.get(node.parentRackId).devices.push(node.id);
      else if (INFRA_TYPES.has(node.type)) map.get(node.parentRackId).infra.push(node.id);
    });
    return map;
  }, [graph.nodes]);

  const visibleNodeIdSet = useMemo(() => {
    const include = new Set();
    const normalizedFacility = String(facilityFilter || '').trim();
    const normalizedSeverity = String(severityFilter || '').toUpperCase().trim();

    graph.nodes.forEach((node) => {
      if (normalizedFacility && node.id !== normalizedFacility && node.facilityId !== normalizedFacility) return;
      if (normalizedSeverity && normalizedSeverity !== 'ALL' && !severityMatches(node, normalizedSeverity, entityLiveMap)) return;

      const keepAlways = node.id === selectedEntityId || node.id === rootCauseEntityId || pathNodeMembership.has(node.id);
      if (keepAlways) {
        include.add(node.id);
        return;
      }

      if (clusterMode === 'none') {
        include.add(node.id);
        return;
      }

      if (clusterMode === 'hall') {
        if (node.type === 'facility' || node.type === 'hall' || node.type === 'rack') {
          include.add(node.id);
          return;
        }
        if (expandedClusterType === 'hall' && expandedClusterId && node.parentRackId) {
          const hallId = graph.rackToHall.get(node.parentRackId);
          if (hallId === expandedClusterId) include.add(node.id);
        }
        return;
      }

      if (node.type === 'facility' || node.type === 'hall' || node.type === 'rack') {
        include.add(node.id);
        return;
      }
      if (!node.parentRackId) return;
      if (expandedClusterType === 'rack' && expandedClusterId && node.parentRackId === expandedClusterId) {
        include.add(node.id);
        return;
      }
      if (INFRA_TYPES.has(node.type)) {
        include.add(node.id);
        return;
      }
      if (node.type === 'device') {
        const list = rackChildrenMap.get(node.parentRackId)?.devices || [];
        const target = zoomLevel < 0.55 ? 2 : zoomLevel < 0.72 ? 4 : 7;
        const step = Math.max(1, Math.ceil(list.length / target));
        if (hashString(node.id) % step === 0) include.add(node.id);
      }
    });

    return include;
  }, [
    clusterMode,
    entityLiveMap,
    expandedClusterId,
    expandedClusterType,
    facilityFilter,
    graph.nodes,
    graph.rackToHall,
    pathNodeMembership,
    rackChildrenMap,
    rootCauseEntityId,
    selectedEntityId,
    severityFilter,
    zoomLevel,
  ]);

  const neighbors = useMemo(() => {
    const set = new Set();
    if (!selectedEntityId) return set;
    graph.links.forEach((edge) => {
      const sourceId = resolveNodeId(edge.source);
      const targetId = resolveNodeId(edge.target);
      if (!visibleNodeIdSet.has(sourceId) || !visibleNodeIdSet.has(targetId)) return;
      if (sourceId === selectedEntityId) set.add(targetId);
      if (targetId === selectedEntityId) set.add(sourceId);
    });
    return set;
  }, [graph.links, selectedEntityId, visibleNodeIdSet]);

  const isNodeInFocus = useCallback((nodeId) => {
    if (pathMode && pathNodeMembership.size > 0) return pathNodeMembership.has(nodeId);
    if (!selectedEntityId) return true;
    if (focusMode && dependencyChainSet?.size > 0) return dependencyChainSet.has(nodeId);
    return nodeId === selectedEntityId || neighbors.has(nodeId);
  }, [dependencyChainSet, focusMode, neighbors, pathMode, pathNodeMembership, selectedEntityId]);

  const isEdgeInFocus = useCallback((edge) => {
    const sourceId = resolveNodeId(edge.source);
    const targetId = resolveNodeId(edge.target);
    if (pathMode && pathEdgeMembership.size > 0) {
      const direct = `${sourceId}->${targetId}`;
      const reverse = `${targetId}->${sourceId}`;
      return pathEdgeMembership.has(direct) || pathEdgeMembership.has(reverse);
    }
    if (!selectedEntityId) return true;
    if (focusMode && dependencyChainSet?.size > 0) {
      return dependencyChainSet.has(sourceId) && dependencyChainSet.has(targetId);
    }
    return sourceId === selectedEntityId || targetId === selectedEntityId || neighbors.has(sourceId) || neighbors.has(targetId);
  }, [dependencyChainSet, focusMode, neighbors, pathEdgeMembership, pathMode, selectedEntityId]);

  const renderEdgeIdSet = useMemo(() => {
    const candidates = [];
    graph.links.forEach((edge) => {
      const sourceId = resolveNodeId(edge.source);
      const targetId = resolveNodeId(edge.target);
      if (!visibleNodeIdSet.has(sourceId) || !visibleNodeIdSet.has(targetId)) return;
      const layerType = EDGE_STYLES[edge.type] ? edge.type : 'structural';
      if (!layerToggles[layerType]) return;
      if (zoomLevel < 0.24 && !selectedEntityId && !pathMode) return;
      if (zoomLevel < 0.36 && layerType !== 'structural' && !pathMode) return;
      candidates.push(edge);
    });

    let maxEdges = zoomLevel < 0.35 ? 900 : zoomLevel < 0.65 ? 1600 : zoomLevel < 1 ? 2500 : 5200;
    if (selectedEntityId || pathMode || blastMode) maxEdges = Math.max(maxEdges, 3200);

    if (candidates.length <= maxEdges) return new Set(candidates.map((edge) => edge.id));

    const focused = [];
    const sampled = [];
    candidates.forEach((edge) => {
      if (isEdgeInFocus(edge)) focused.push(edge);
      else sampled.push(edge);
    });

    const keep = new Set(focused.map((edge) => edge.id));
    const step = Math.max(1, Math.ceil(sampled.length / Math.max(100, maxEdges - focused.length)));
    for (let i = 0; i < sampled.length; i += step) keep.add(sampled[i].id);
    return keep;
  }, [blastMode, graph.links, isEdgeInFocus, layerToggles, pathMode, selectedEntityId, visibleNodeIdSet, zoomLevel]);

  const hiddenChildrenByRack = useMemo(() => {
    const map = new Map();
    graph.nodes.forEach((node) => {
      if ((node.type !== 'device' && !INFRA_TYPES.has(node.type)) || !node.parentRackId) return;
      if (visibleNodeIdSet.has(node.id)) return;
      map.set(node.parentRackId, Number(map.get(node.parentRackId) || 0) + 1);
    });
    return map;
  }, [graph.nodes, visibleNodeIdSet]);

  const queueRender = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = 0;
      drawRef.current();
    });
  }, []);

  const emitTransform = useCallback(() => {
    if (!onTransformChange) return;
    onTransformChange({ ...transformRef.current });
  }, [onTransformChange]);

  const applyTransform = useCallback((next, { emit = false, debounce = false } = {}) => {
    transformRef.current = {
      x: Number(next?.x || 0),
      y: Number(next?.y || 0),
      k: clamp(Number(next?.k || 1), MIN_ZOOM, MAX_ZOOM),
    };
    setZoomLevel(transformRef.current.k);
    queueRender();
    if (emit) emitTransform();
    if (debounce) {
      if (transformCommitRef.current) window.clearTimeout(transformCommitRef.current);
      transformCommitRef.current = window.setTimeout(() => {
        transformCommitRef.current = 0;
        emitTransform();
      }, 120);
    }
  }, [emitTransform, queueRender]);

  const zoomToFit = useCallback(() => {
    const nodes = [...nodeStoreRef.current.values()].filter((node) => Number.isFinite(node?.x) && Number.isFinite(node?.y));
    if (nodes.length === 0) return;
    const width = sizeRef.current.width;
    const height = sizeRef.current.height;

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    nodes.forEach((node) => {
      const x = Number(node.x || 0);
      const y = Number(node.y || 0);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    });

    const graphWidth = Math.max(120, maxX - minX);
    const graphHeight = Math.max(120, maxY - minY);
    const padding = 120;
    const scale = clamp(Math.min((width - padding) / graphWidth, (height - padding) / graphHeight), 0.15, 2.6);
    applyTransform({
      x: width / 2 - ((minX + maxX) / 2) * scale,
      y: height / 2 - ((minY + maxY) / 2) * scale,
      k: scale,
    }, { emit: true });
  }, [applyTransform]);

  const getNeighborsForDrag = useCallback((nodeId) => {
    const out = [];
    const seen = new Set();
    linkStoreRef.current.forEach((edge) => {
      const sourceId = resolveNodeId(edge.source);
      const targetId = resolveNodeId(edge.target);
      if (sourceId !== nodeId && targetId !== nodeId) return;
      const otherId = sourceId === nodeId ? targetId : sourceId;
      if (!otherId || seen.has(otherId)) return;
      const otherNode = nodeStoreRef.current.get(otherId);
      if (!otherNode) return;
      seen.add(otherId);
      out.push(otherNode);
    });
    return out;
  }, []);

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = sizeRef.current.width;
    const height = sizeRef.current.height;
    const dpr = sizeRef.current.dpr;
    const transform = transformRef.current;
    const zoom = Math.max(MIN_ZOOM, Number(transform.k || 1));
    const bounds = worldBounds(transform, width, height, 120 / zoom);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0f141a';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(Number(transform.x || 0), Number(transform.y || 0));
    ctx.scale(zoom, zoom);

    let visibleNodes = 0;
    const hitNodes = [];

    linkStoreRef.current.forEach((edge) => {
      if (!renderEdgeIdSet.has(edge.id)) return;
      const sourceId = resolveNodeId(edge.source);
      const targetId = resolveNodeId(edge.target);
      const source = nodeStoreRef.current.get(sourceId);
      const target = nodeStoreRef.current.get(targetId);
      if (!source || !target) return;
      if (!visibleNodeIdSet.has(sourceId) || !visibleNodeIdSet.has(targetId)) return;
      if (!inBounds(source, bounds, 40 / zoom) && !inBounds(target, bounds, 40 / zoom)) return;

      const style = EDGE_STYLES[edge.type] || EDGE_STYLES.structural;
      const inFocus = isEdgeInFocus(edge);
      let opacity = style.opacity;
      let widthWorld = 1.4 / zoom;
      if (selectedEntityId) {
        opacity = inFocus ? 1 : 0.08;
        widthWorld = (inFocus ? 2.1 : 1.1) / zoom;
      }
      if (pathMode && pathNodeMembership.size > 0 && !inFocus) opacity = 0.08;
      if (blastMode && blastData) {
        const sourceLevel = blastData.levels.get(sourceId);
        const targetLevel = blastData.levels.get(targetId);
        if (sourceLevel === undefined && targetLevel === undefined) opacity = 0.08;
      }

      ctx.beginPath();
      ctx.moveTo(Number(source.x || 0), Number(source.y || 0));
      ctx.lineTo(Number(target.x || 0), Number(target.y || 0));
      ctx.strokeStyle = style.stroke;
      ctx.globalAlpha = clamp(opacity, 0, 1);
      ctx.lineWidth = widthWorld;
      ctx.setLineDash(style.dash.map((value) => value / zoom));
      ctx.stroke();
    });

    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    const labelBudget = zoom > 1.5 ? 180 : 80;
    let labelsDrawn = 0;

    nodeStoreRef.current.forEach((node) => {
      if (!visibleNodeIdSet.has(node.id)) return;
      visibleNodes += 1;
      if (!inBounds(node, bounds, 26 / zoom)) return;

      const visual = NODE_VISUAL[node.type] || NODE_VISUAL.unknown;
      const isSelected = selectedEntityId === node.id;
      const isRoot = rootCauseEntityId && rootCauseEntityId === node.id;
      const inFocus = isNodeInFocus(node.id);
      const blastAffected = blastMode && blastData ? blastData.impactedSet.has(node.id) : false;

      let opacity = selectedEntityId ? (inFocus ? 1 : 0.1) : 0.96;
      if (blastMode && blastData) opacity = blastAffected ? 1 : 0.1;
      if (pathMode && pathNodeMembership.size > 0 && !pathNodeMembership.has(node.id)) opacity = 0.12;

      const size = Math.max(visual.size * (isSelected ? 1.25 : 1), (node.type === 'device' ? 3.5 : 6) / zoom);

      let fill = visual.color;
      let stroke = isSelected ? '#ffffff' : '#0f141a';

      const alerts = alertsByEntity?.[node.id] || node.alerts || [];
      const hasAlerts = Number(alerts.length) > 0;
      const alertLevel = hasAlerts && String(alerts[0]?.severity || '').toUpperCase().includes('CRITICAL') ? 'critical' : 'warning';

      if (heatmapMode) {
        const live = entityLiveMap?.[node.id] || {};
        const temp = Number(live.temperature ?? node.attributes?.temperature ?? node.attributes?.temp_c);
        const power = Number(live.power ?? node.attributes?.power_kw ?? node.attributes?.powerKw);
        const net = Number(live.networkUsage ?? node.attributes?.network_usage ?? node.attributes?.latency_ms);
        const tempNorm = clamp01((temp - 25) / 35);
        const powerNorm = clamp01(power / 25);
        const netNorm = clamp01(net / 100);
        const density = clamp01((tempNorm + powerNorm + netNorm) / 3 + (hasAlerts ? 0.3 : 0));
        fill = density > 0.82 ? '#ff4f4f' : density > 0.62 ? '#ff7a3c' : density > 0.45 ? '#ffb020' : '#6b8fb5';
      }

      if (hasAlerts) fill = alertLevel === 'critical' ? '#ff5c5c' : '#ffb020';
      if (isRoot) {
        fill = '#ff4f4f';
        stroke = '#ffffff';
      }

      drawCanvasShape(ctx, node.type, Number(node.x || 0), Number(node.y || 0), size);
      ctx.fillStyle = fill;
      ctx.globalAlpha = clamp(opacity, 0, 1);
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = (isSelected ? 2 : 1.2) / zoom;
      ctx.stroke();

      if ((clusterMode === 'rack' || clusterMode === 'hall') && node.type === 'rack') {
        const hidden = Number(hiddenChildrenByRack.get(node.id) || 0);
        if (hidden > 0) {
          const bx = Number(node.x || 0) + size + 7 / zoom;
          const by = Number(node.y || 0) - size - 5 / zoom;
          const br = 8 / zoom;
          ctx.beginPath();
          ctx.arc(bx, by, br, 0, Math.PI * 2);
          ctx.fillStyle = '#ffb020';
          ctx.globalAlpha = 1;
          ctx.fill();
          ctx.strokeStyle = '#15212d';
          ctx.lineWidth = 1 / zoom;
          ctx.stroke();
          ctx.fillStyle = '#0d1620';
          ctx.font = `${(10 / zoom).toFixed(2)}px "Segoe UI", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(hidden), bx, by + 0.4 / zoom);
        }
      }

      const showLabel = node.id === selectedEntityId || zoom > (performanceMode ? 2.6 : 1.3);
      if (showLabel && (isSelected || labelsDrawn < labelBudget)) {
        labelsDrawn += 1;
        ctx.fillStyle = '#d6e5f8';
        ctx.globalAlpha = clamp(opacity, 0.08, 1);
        ctx.font = `${(11 / zoom).toFixed(2)}px "Segoe UI", sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(node.displayName || node.id), Number(node.x || 0) + size + (6 / zoom), Number(node.y || 0));
      }

      hitNodes.push({
        id: node.id,
        x: Number(node.x || 0),
        y: Number(node.y || 0),
        radius: Math.max(size + 6 / zoom, 10 / zoom),
      });
    });

    ctx.restore();
    renderMetaRef.current.hitNodes = hitNodes;
    setVisibleCount(visibleNodes);
  }, [
    alertsByEntity,
    blastData,
    blastMode,
    clusterMode,
    entityLiveMap,
    heatmapMode,
    hiddenChildrenByRack,
    isEdgeInFocus,
    isNodeInFocus,
    pathMode,
    pathNodeMembership,
    performanceMode,
    renderEdgeIdSet,
    rootCauseEntityId,
    selectedEntityId,
    visibleNodeIdSet,
  ]);

  drawRef.current = drawCanvas;

  const findNodeAt = useCallback((worldX, worldY) => {
    const hitNodes = renderMetaRef.current.hitNodes || [];
    for (let i = hitNodes.length - 1; i >= 0; i -= 1) {
      const node = hitNodes[i];
      const dx = worldX - node.x;
      const dy = worldY - node.y;
      if ((dx * dx) + (dy * dy) <= node.radius * node.radius) return node;
    }
    return null;
  }, []);

  const screenToWorld = useCallback((event) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const sx = Number(event.clientX - (rect?.left || 0));
    const sy = Number(event.clientY - (rect?.top || 0));
    const transform = transformRef.current;
    return {
      sx,
      sy,
      wx: (sx - Number(transform.x || 0)) / Number(transform.k || 1),
      wy: (sy - Number(transform.y || 0)) / Number(transform.k || 1),
    };
  }, []);

  const handleNodeClick = useCallback((nodeId) => {
    const now = Date.now();
    const last = lastClickRef.current;

    if (last.nodeId === nodeId && (now - last.ts) < 260) {
      if (clickTimerRef.current) {
        window.clearTimeout(clickTimerRef.current);
        clickTimerRef.current = 0;
      }
      lastClickRef.current = { nodeId: '', ts: 0 };
      if (onEntityInspect) onEntityInspect(nodeId);
      return;
    }

    lastClickRef.current = { nodeId, ts: now };
    if (clickTimerRef.current) window.clearTimeout(clickTimerRef.current);
    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = 0;
      const node = nodeStoreRef.current.get(nodeId);
      if (node && clusterMode === 'rack' && node.type === 'rack') {
        setExpandedClusterId((prev) => {
          const next = prev === nodeId ? '' : nodeId;
          setExpandedClusterType(next ? 'rack' : '');
          return next;
        });
      } else if (node && clusterMode === 'hall' && node.type === 'hall') {
        setExpandedClusterId((prev) => {
          const next = prev === nodeId ? '' : nodeId;
          setExpandedClusterType(next ? 'hall' : '');
          return next;
        });
      }
      onEntitySelect(nodeId);
      queueRender();
    }, 190);
  }, [clusterMode, onEntityInspect, onEntitySelect, queueRender]);

  const handlePointerDown = useCallback((event) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const point = screenToWorld(event);
    const hit = findNodeAt(point.wx, point.wy);

    dragRef.current = {
      pointerId: event.pointerId,
      mode: hit ? 'node' : 'pan',
      nodeId: hit?.id || '',
      moved: false,
      lastSx: point.sx,
      lastSy: point.sy,
      lastWx: point.wx,
      lastWy: point.wy,
      touched: new Set(),
    };

    canvas.style.cursor = 'grabbing';
    canvas.setPointerCapture(event.pointerId);

    if (hit) {
      const simulation = simulationRef.current;
      if (simulation) simulation.stop();
    }
  }, [findNodeAt, screenToWorld]);

  const handlePointerMove = useCallback((event) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const state = dragRef.current;

    if (!state || state.pointerId !== event.pointerId) {
      const point = screenToWorld(event);
      const hit = findNodeAt(point.wx, point.wy);
      canvas.style.cursor = hit ? 'pointer' : 'grab';
      return;
    }

    const point = screenToWorld(event);
    const dsx = point.sx - state.lastSx;
    const dsy = point.sy - state.lastSy;
    const dwx = point.wx - state.lastWx;
    const dwy = point.wy - state.lastWy;

    if (Math.abs(dsx) > 1 || Math.abs(dsy) > 1) state.moved = true;

    if (state.mode === 'pan') {
      const current = transformRef.current;
      applyTransform({ x: Number(current.x || 0) + dsx, y: Number(current.y || 0) + dsy, k: Number(current.k || 1) }, { debounce: true });
    } else if (state.mode === 'node' && state.nodeId) {
      const node = nodeStoreRef.current.get(state.nodeId);
      if (node) {
        node.x = Number(node.x || 0) + dwx;
        node.y = Number(node.y || 0) + dwy;
        node.fx = node.x;
        node.fy = node.y;
        state.touched.add(node.id);

        getNeighborsForDrag(node.id).forEach((neighbor) => {
          neighbor.x = Number(neighbor.x || 0) + (dwx * 0.45);
          neighbor.y = Number(neighbor.y || 0) + (dwy * 0.45);
          neighbor.fx = neighbor.x;
          neighbor.fy = neighbor.y;
          state.touched.add(neighbor.id);
        });

        if (node.type === 'rack') {
          const children = childrenByRackRef.current.get(node.id);
          if (children) {
            [...children.devices, ...children.infra].forEach((childId) => {
              const child = nodeStoreRef.current.get(childId);
              if (!child) return;
              child.x = Number(child.x || 0) + dwx;
              child.y = Number(child.y || 0) + dwy;
              child.fx = child.x;
              child.fy = child.y;
              state.touched.add(child.id);
            });
          }
        }
      }
      queueRender();
    }

    state.lastSx = point.sx;
    state.lastSy = point.sy;
    state.lastWx = point.wx;
    state.lastWy = point.wy;
  }, [applyTransform, findNodeAt, getNeighborsForDrag, queueRender, screenToWorld]);

  const handlePointerUp = useCallback((event) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const state = dragRef.current;
    dragRef.current = null;

    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);

    if (!state || state.pointerId !== event.pointerId) {
      canvas.style.cursor = 'grab';
      return;
    }

    if (state.mode === 'node') {
      state.touched.forEach((nodeId) => {
        const node = nodeStoreRef.current.get(nodeId);
        if (!node) return;
        node.fx = null;
        node.fy = null;
      });
      if (!state.moved && state.nodeId) handleNodeClick(state.nodeId);
    } else {
      if (!state.moved) onBackgroundSelect();
      emitTransform();
    }

    canvas.style.cursor = 'grab';
    queueRender();
  }, [emitTransform, handleNodeClick, onBackgroundSelect, queueRender]);

  const handlePointerCancel = useCallback((event) => {
    const canvas = canvasRef.current;
    const state = dragRef.current;
    dragRef.current = null;
    if (!canvas || !state || state.pointerId !== event.pointerId) return;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    state.touched.forEach((nodeId) => {
      const node = nodeStoreRef.current.get(nodeId);
      if (!node) return;
      node.fx = null;
      node.fy = null;
    });
    canvas.style.cursor = 'grab';
    queueRender();
  }, [queueRender]);

  const handleWheel = useCallback((event) => {
    event.preventDefault();
    const point = screenToWorld(event);
    const current = transformRef.current;
    const scale = Math.exp((-Number(event.deltaY || 0)) * 0.0015);
    const nextK = clamp(Number(current.k || 1) * scale, MIN_ZOOM, MAX_ZOOM);
    applyTransform({
      k: nextK,
      x: point.sx - point.wx * nextK,
      y: point.sy - point.wy * nextK,
    }, { debounce: true });
  }, [applyTransform, screenToWorld]);

  useEffect(() => {
    childrenByRackRef.current = rackChildrenMap;
  }, [rackChildrenMap]);

  useEffect(() => {
    if (clusterMode !== 'none') return;
    setExpandedClusterId('');
    setExpandedClusterType('');
  }, [clusterMode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      const dpr = Math.min(2, Math.max(1, Number(window.devicePixelRatio || 1)));
      sizeRef.current = { width, height, dpr };
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      queueRender();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    return () => observer.disconnect();
  }, [queueRender]);

  useEffect(() => {
    const simulation = forceSimulation([])
      .force('link', forceLink([]).id((node) => node.id).distance(36).strength(0.55))
      .force('charge', forceManyBody().strength(-90))
      .force('collision', forceCollide().radius((node) => {
        const visual = NODE_VISUAL[node?.type] || NODE_VISUAL.unknown;
        return Number(visual.size || 7) + 8;
      }))
      .force('center', forceCenter(0, 0))
      .alphaDecay(0.06)
      .alphaMin(0.1)
      .velocityDecay(0.8);

    simulation.on('tick', queueRender);
    simulation.on('end', queueRender);
    simulation.stop();

    simulationRef.current = simulation;
    linkForceRef.current = simulation.force('link');

    return () => {
      if (stopTimerRef.current) {
        window.clearTimeout(stopTimerRef.current);
        stopTimerRef.current = 0;
      }
      simulation.stop();
      simulationRef.current = null;
      linkForceRef.current = null;
    };
  }, [queueRender]);

  useEffect(() => {
    const previous = nodeStoreRef.current;
    const next = new Map();
    const width = sizeRef.current.width;
    const height = sizeRef.current.height;

    graph.nodes.forEach((node) => {
      const existing = previous.get(node.id);
      if (existing) {
        existing.type = node.type;
        existing.displayName = node.displayName;
        existing.attributes = node.attributes;
        existing.facilityId = node.facilityId;
        existing.parentRackId = node.parentRackId || '';
        next.set(node.id, existing);
      } else {
        next.set(node.id, {
          ...node,
          x: width / 2 + (Math.random() - 0.5) * 140,
          y: height / 2 + (Math.random() - 0.5) * 140,
        });
      }
    });

    const links = graph.links.map((edge) => ({
      ...edge,
      source: next.get(resolveNodeId(edge.source)) || edge.source,
      target: next.get(resolveNodeId(edge.target)) || edge.target,
    }));

    nodeStoreRef.current = next;
    linkStoreRef.current = links;

    if (stopTimerRef.current) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = 0;
    }

    const simulation = simulationRef.current;
    const useStatic = graph.nodes.length >= LARGE_NODE_THRESHOLD || graph.links.length >= LARGE_EDGE_THRESHOLD;

    if (useStatic) {
      if (simulation) simulation.stop();
      layoutStaticHierarchy(next, graph, width, height);
      queueRender();
      zoomToFit();
      return;
    }

    if (simulation) {
      simulation.nodes([...next.values()]);
      if (linkForceRef.current) linkForceRef.current.links(links);
      simulation.alpha(1).restart();
      stopTimerRef.current = window.setTimeout(() => {
        stopTimerRef.current = 0;
        simulation.stop();
        queueRender();
        zoomToFit();
      }, 1800);
    }

    queueRender();
  }, [graph, queueRender, zoomToFit]);

  useEffect(() => {
    applyTransform({
      x: Number(initialTransform?.x || 0),
      y: Number(initialTransform?.y || 0),
      k: clamp(Number(initialTransform?.k || 1), MIN_ZOOM, MAX_ZOOM),
    });
  }, [applyTransform, initialTransform]);

  useEffect(() => {
    queueRender();
  }, [
    alertsByEntity,
    blastData,
    blastMode,
    dependencyChainSet,
    entityLiveMap,
    expandedClusterId,
    expandedClusterType,
    focusMode,
    heatmapMode,
    layerToggles,
    pathMode,
    pathNodeMembership,
    pathEdgeMembership,
    performanceMode,
    propagationMode,
    renderEdgeIdSet,
    rootCauseEntityId,
    selectedEntityId,
    visibleNodeIdSet,
    queueRender,
  ]);

  useEffect(() => () => {
    if (frameRef.current) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    }
    if (clickTimerRef.current) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = 0;
    }
    if (transformCommitRef.current) {
      window.clearTimeout(transformCommitRef.current);
      transformCommitRef.current = 0;
    }
  }, []);

  const allLayersDisabled = !layerToggles.structural && !layerToggles.network && !layerToggles.power && !layerToggles.cooling;

  return (
    <div className="topology-view-body">
      <canvas
        ref={canvasRef}
        className="topology-canvas"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        role="img"
        aria-label="Canvas dependency topology graph"
      />
      {(visibleCount === 0 || allLayersDisabled) && (
        <div className="topology-empty-overlay">
          {allLayersDisabled
            ? 'All layers are disabled. Enable at least one layer in Filters.'
            : 'No visible nodes with current filters. Clear filters or reload.'}
        </div>
      )}
    </div>
  );
}
