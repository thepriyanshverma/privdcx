import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { select } from 'd3-selection';
import { zoom as d3Zoom, zoomIdentity } from 'd3-zoom';
import { drag as d3Drag } from 'd3-drag';
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
} from 'd3-force';
import {
  NODE_VISUAL,
  normalizeRuntimeStatus,
} from './topologyModel';
import { TopologyNodeShape } from './TopologySvgShapes';

const INFRA_TYPES = new Set(['network', 'power', 'cooling']);
const SUPPORTED_TYPES = new Set(['facility', 'hall', 'rack', 'device', 'network', 'power', 'cooling']);

const EDGE_STYLES = {
  network: { stroke: '#4da3ff', opacity: 0.6, dash: '' },
  power: { stroke: '#ffd13d', opacity: 0.6, dash: '6 4' },
  cooling: { stroke: '#25d6c0', opacity: 0.6, dash: '2 5' },
  structural: { stroke: '#6d8096', opacity: 0.6, dash: '' },
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function resolveNodeId(value) {
  if (value && typeof value === 'object' && value.id) return String(value.id);
  return String(value || '');
}

function edgeSignature(sourceId, targetId, type) {
  const a = sourceId <= targetId ? sourceId : targetId;
  const b = sourceId <= targetId ? targetId : sourceId;
  return `${a}|${b}|${type}`;
}

function levelColor(level, isRoot = false) {
  if (isRoot || level <= 0) return '#ff5c5c';
  return '#ffd13d';
}

function edgeKey(edge) {
  return `${resolveNodeId(edge.source)}->${resolveNodeId(edge.target)}`;
}

function nodeStatusClass(status) {
  const normalized = normalizeRuntimeStatus(status);
  return `state-${normalized.toLowerCase()}`;
}

function alertLevelFromList(alertList) {
  if (!Array.isArray(alertList) || alertList.length === 0) return '';
  const critical = alertList.some((alert) => String(alert?.severity || '').toUpperCase().includes('CRITICAL'));
  if (critical) return 'critical';
  return 'warning';
}

function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

function metricIntensity(node, entityLiveMap) {
  const live = entityLiveMap?.[node.id] || {};
  const t = Number(live.temperature ?? node.metrics?.temperature ?? node.attributes?.temp_c ?? node.attributes?.temperature);
  const p = Number(live.power ?? node.metrics?.power ?? node.attributes?.power_kw ?? node.attributes?.powerKw);
  const n = Number(live.networkUsage ?? node.metrics?.network ?? node.attributes?.network_usage ?? node.attributes?.latency_ms);

  const tempNormalized = clamp01((t - 25) / 35);
  const powerNormalized = clamp01(p / 25);
  const networkNormalized = clamp01(n / 100);
  return {
    temperature: tempNormalized,
    power: powerNormalized,
    network: networkNormalized,
    combined: clamp01((tempNormalized + powerNormalized + networkNormalized) / 3),
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

function shouldShowLabel({ node, zoomLevel, selectedEntityId, performanceMode }) {
  if (!node) return false;
  if (node.id === selectedEntityId) return true;
  if (performanceMode) return zoomLevel >= 2.6;
  return zoomLevel >= 1.3;
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
    return liveStatus === 'DEGRADED' || liveStatus === 'AT_RISK' || nodeStatus.includes('WARNING') || nodeStatus.includes('DEGRADED') || nodeStatus.includes('RISK');
  }
  return true;
}

function inferEdgeDependencyType(sourceNode, targetNode) {
  if (!sourceNode || !targetNode) return '';

  if (sourceNode.type === 'device' && targetNode.type === 'rack') return 'structural';
  if (sourceNode.type === 'rack' && targetNode.type === 'device') return 'structural';

  if (sourceNode.type === 'rack' && INFRA_TYPES.has(targetNode.type)) return targetNode.type;
  if (INFRA_TYPES.has(sourceNode.type) && targetNode.type === 'rack') return sourceNode.type;

  if (sourceNode.type === 'facility' && targetNode.type === 'hall') return 'structural';
  if (sourceNode.type === 'hall' && targetNode.type === 'facility') return 'structural';
  if (sourceNode.type === 'hall' && targetNode.type === 'rack') return 'structural';
  if (sourceNode.type === 'rack' && targetNode.type === 'hall') return 'structural';

  return '';
}

function buildDependencyGraph(model) {
  if (!model) {
    return {
      nodes: [],
      links: [],
      nodeById: new Map(),
    };
  }

  const nodeMap = new Map();
  asArray(model.nodes)
    .filter((node) => SUPPORTED_TYPES.has(node?.type))
    .forEach((node) => {
      nodeMap.set(node.id, {
        ...node,
        parentRackId: asText(node.parentRackId),
      });
    });

  const hallToFacility = new Map(model.hallToFacility || []);
  const rackToHall = new Map(model.rackToHall || []);
  const rackToFacility = new Map(model.rackToFacility || []);
  const deviceToRack = new Map(model.deviceToRack || []);
  const infraToRack = new Map(model.infraToRack || []);

  asArray(model.nodes).forEach((node) => {
    if (!nodeMap.has(node.id)) return;
    const facilityId = asText(node.attributes?.facility_id || node.attributes?.facilityId || node.facilityId);
    const hallId = asText(node.attributes?.hall_id || node.attributes?.hallId || node.attributes?.row_id || node.attributes?.rowId);
    const rackId = asText(node.attributes?.rack_id || node.attributes?.rackId);

    if (node.type === 'hall' && facilityId && nodeMap.has(facilityId)) hallToFacility.set(node.id, facilityId);
    if (node.type === 'rack' && hallId && nodeMap.has(hallId)) {
      rackToHall.set(node.id, hallId);
    }
    if (node.type === 'rack' && facilityId && nodeMap.has(facilityId)) {
      rackToFacility.set(node.id, facilityId);
    }
    if (node.type === 'device' && rackId && nodeMap.has(rackId)) deviceToRack.set(node.id, rackId);
    if (INFRA_TYPES.has(node.type) && rackId && nodeMap.has(rackId)) infraToRack.set(node.id, rackId);
  });

  asArray(model.edges).forEach((edge) => {
    const sourceId = resolveNodeId(edge?.source);
    const targetId = resolveNodeId(edge?.target);
    const sourceNode = nodeMap.get(sourceId);
    const targetNode = nodeMap.get(targetId);
    if (!sourceNode || !targetNode) return;

    if (sourceNode.type === 'facility' && targetNode.type === 'hall') hallToFacility.set(targetId, sourceId);
    if (sourceNode.type === 'hall' && targetNode.type === 'facility') hallToFacility.set(sourceId, targetId);
    if (sourceNode.type === 'hall' && targetNode.type === 'rack') rackToHall.set(targetId, sourceId);
    if (sourceNode.type === 'rack' && targetNode.type === 'hall') rackToHall.set(sourceId, targetId);
    if (sourceNode.type === 'facility' && targetNode.type === 'rack') rackToFacility.set(targetId, sourceId);
    if (sourceNode.type === 'rack' && targetNode.type === 'facility') rackToFacility.set(sourceId, targetId);
    if (sourceNode.type === 'rack' && targetNode.type === 'device') deviceToRack.set(targetId, sourceId);
    if (sourceNode.type === 'device' && targetNode.type === 'rack') deviceToRack.set(sourceId, targetId);
    if (sourceNode.type === 'rack' && INFRA_TYPES.has(targetNode.type)) infraToRack.set(targetId, sourceId);
    if (INFRA_TYPES.has(sourceNode.type) && targetNode.type === 'rack') infraToRack.set(sourceId, targetId);
  });

  if ([...nodeMap.values()].every((node) => node.type !== 'facility') && nodeMap.size > 0) {
    const syntheticFacilityId = 'FACILITY::AUTO';
    nodeMap.set(syntheticFacilityId, {
      id: syntheticFacilityId,
      type: 'facility',
      rawType: 'facility',
      displayName: 'FACILITY AUTO',
      attributes: { synthetic: true },
      facilityId: syntheticFacilityId,
      parentRackId: '',
    });
  }

  let facilities = [...nodeMap.values()]
    .filter((node) => node.type === 'facility')
    .map((node) => node.id)
    .sort((a, b) => a.localeCompare(b));
  let halls = [...nodeMap.values()]
    .filter((node) => node.type === 'hall')
    .map((node) => node.id)
    .sort((a, b) => a.localeCompare(b));
  let rackIds = [...nodeMap.values()]
    .filter((node) => node.type === 'rack')
    .map((node) => node.id)
    .sort((a, b) => a.localeCompare(b));
  let deviceIds = [...nodeMap.values()]
    .filter((node) => node.type === 'device')
    .map((node) => node.id)
    .sort((a, b) => a.localeCompare(b));
  let infraIds = [...nodeMap.values()]
    .filter((node) => INFRA_TYPES.has(node.type))
    .map((node) => node.id)
    .sort((a, b) => a.localeCompare(b));

  const validFacility = (candidate) => candidate && nodeMap.has(candidate) && nodeMap.get(candidate)?.type === 'facility';
  const validHall = (candidate) => candidate && nodeMap.has(candidate) && nodeMap.get(candidate)?.type === 'hall';
  const validRack = (candidate) => candidate && nodeMap.has(candidate) && nodeMap.get(candidate)?.type === 'rack';

  const fallbackFacility = facilities[0] || '';
  if (halls.length === 0 && rackIds.length > 0) {
    const targetFacilities = facilities.length > 0 ? facilities : [fallbackFacility].filter(Boolean);
    targetFacilities.forEach((facilityId, index) => {
      const syntheticHallId = `HALL::${facilityId || 'AUTO'}::AUTO::${index + 1}`;
      if (nodeMap.has(syntheticHallId)) return;
      nodeMap.set(syntheticHallId, {
        id: syntheticHallId,
        type: 'hall',
        rawType: 'hall',
        displayName: `HALL AUTO ${index + 1}`,
        attributes: { synthetic: true, facility_id: facilityId || fallbackFacility },
        facilityId: facilityId || fallbackFacility,
        parentRackId: '',
      });
      halls.push(syntheticHallId);
      if (facilityId || fallbackFacility) {
        hallToFacility.set(syntheticHallId, facilityId || fallbackFacility);
      }
    });
    halls = halls.slice().sort((a, b) => a.localeCompare(b));
  }
  halls.forEach((hallId, index) => {
    const hallNode = nodeMap.get(hallId);
    const byMap = hallToFacility.get(hallId);
    const byAttr = asText(hallNode?.attributes?.facility_id || hallNode?.attributes?.facilityId || hallNode?.facilityId);
    let facilityId = '';
    if (validFacility(byMap)) facilityId = byMap;
    else if (validFacility(byAttr)) facilityId = byAttr;
    else if (fallbackFacility) facilityId = facilities[index % facilities.length] || fallbackFacility;
    if (facilityId) {
      hallToFacility.set(hallId, facilityId);
      hallNode.facilityId = facilityId;
    }
  });

  const hallsByFacility = new Map();
  hallToFacility.forEach((facilityId, hallId) => {
    if (!validFacility(facilityId) || !validHall(hallId)) return;
    if (!hallsByFacility.has(facilityId)) hallsByFacility.set(facilityId, []);
    hallsByFacility.get(facilityId).push(hallId);
  });
  hallsByFacility.forEach((hallList) => hallList.sort((a, b) => a.localeCompare(b)));

  rackIds.forEach((rackId, index) => {
    const rackNode = nodeMap.get(rackId);
    const byMap = rackToHall.get(rackId);
    const byAttr = asText(rackNode?.attributes?.hall_id || rackNode?.attributes?.hallId || rackNode?.attributes?.row_id || rackNode?.attributes?.rowId);
    let hallId = '';
    if (validHall(byMap)) hallId = byMap;
    else if (validHall(byAttr)) hallId = byAttr;

    let facilityId = '';
    const byFacilityMap = rackToFacility.get(rackId);
    const byFacilityAttr = asText(rackNode?.attributes?.facility_id || rackNode?.attributes?.facilityId || rackNode?.facilityId);
    if (validFacility(byFacilityMap)) facilityId = byFacilityMap;
    else if (validFacility(byFacilityAttr)) facilityId = byFacilityAttr;
    else if (hallId && validFacility(hallToFacility.get(hallId))) facilityId = hallToFacility.get(hallId);
    else if (fallbackFacility) facilityId = fallbackFacility;

    if (!hallId) {
      const scopedHalls = hallsByFacility.get(facilityId) || [];
      if (scopedHalls.length > 0) {
        hallId = scopedHalls[index % scopedHalls.length];
      } else if (halls.length > 0) {
        hallId = halls[index % halls.length];
      }
    }

    if (hallId) {
      rackToHall.set(rackId, hallId);
      if (!facilityId && validFacility(hallToFacility.get(hallId))) {
        facilityId = hallToFacility.get(hallId);
      }
    }

    if (facilityId) {
      rackToFacility.set(rackId, facilityId);
      rackNode.facilityId = facilityId;
    }
  });

  const racksByFacility = new Map();
  rackIds.forEach((rackId) => {
    const rackNode = nodeMap.get(rackId);
    const facilityId = rackToFacility.get(rackId) || rackNode?.facilityId || fallbackFacility;
    if (!validFacility(facilityId)) return;
    if (!racksByFacility.has(facilityId)) racksByFacility.set(facilityId, []);
    racksByFacility.get(facilityId).push(rackId);
  });
  racksByFacility.forEach((list) => list.sort((a, b) => a.localeCompare(b)));

  const deterministicIndex = (nodeId, length) => {
    if (length <= 1) return 0;
    let hash = 0;
    for (let i = 0; i < nodeId.length; i += 1) {
      hash = ((hash * 31) + nodeId.charCodeAt(i)) >>> 0;
    }
    return hash % length;
  };

  const fallbackRackForNode = (node) => {
    if (!node || rackIds.length === 0) return '';
    const facilityId = asText(node.facilityId || node.attributes?.facility_id || node.attributes?.facilityId);
    const scoped = racksByFacility.get(facilityId) || [];
    const pool = scoped.length > 0 ? scoped : rackIds;
    return pool[deterministicIndex(String(node.id), pool.length)] || '';
  };

  deviceIds.forEach((deviceId) => {
    const node = nodeMap.get(deviceId);
    const byMap = deviceToRack.get(deviceId);
    const byAttr = asText(node?.attributes?.rack_id || node?.attributes?.rackId || node?.parentRackId);
    const rackId = validRack(byMap) ? byMap : validRack(byAttr) ? byAttr : fallbackRackForNode(node);
    if (!rackId) return;
    deviceToRack.set(deviceId, rackId);
    node.parentRackId = rackId;
  });

  infraIds.forEach((infraId) => {
    const node = nodeMap.get(infraId);
    const byMap = infraToRack.get(infraId);
    const byAttr = asText(node?.attributes?.rack_id || node?.attributes?.rackId || node?.parentRackId);
    const rackId = validRack(byMap) ? byMap : validRack(byAttr) ? byAttr : fallbackRackForNode(node);
    if (!rackId) return;
    infraToRack.set(infraId, rackId);
    node.parentRackId = rackId;
  });

  const edgeSeen = new Set();
  const links = [];

  const addLink = (sourceId, targetId, type) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    if (!nodeMap.has(sourceId) || !nodeMap.has(targetId)) return;
    const key = edgeSignature(sourceId, targetId, type);
    if (edgeSeen.has(key)) return;
    edgeSeen.add(key);
    links.push({
      id: key,
      source: sourceId,
      target: targetId,
      type,
    });
  };

  hallToFacility.forEach((facilityId, hallId) => addLink(facilityId, hallId, 'structural'));
  rackToHall.forEach((hallId, rackId) => addLink(hallId, rackId, 'structural'));
  deviceToRack.forEach((rackId, deviceId) => {
    if (nodeMap.has(deviceId)) {
      nodeMap.get(deviceId).parentRackId = rackId;
      addLink(rackId, deviceId, 'structural');
    }
  });

  infraToRack.forEach((rackId, infraId) => {
    if (!nodeMap.has(infraId)) return;
    const infraNode = nodeMap.get(infraId);
    infraNode.parentRackId = rackId;
    addLink(rackId, infraId, INFRA_TYPES.has(infraNode.type) ? infraNode.type : 'structural');
  });

  // Guarantee at least one network/power/cooling dependency per rack.
  const racks = [...nodeMap.values()].filter((node) => node.type === 'rack');
  racks.forEach((rackNode) => {
    const byType = {
      network: null,
      power: null,
      cooling: null,
    };

    infraToRack.forEach((mappedRackId, infraId) => {
      if (mappedRackId !== rackNode.id) return;
      const infraNode = nodeMap.get(infraId);
      if (!infraNode || !INFRA_TYPES.has(infraNode.type)) return;
      if (!byType[infraNode.type]) byType[infraNode.type] = infraNode.id;
    });

    ['network', 'power', 'cooling'].forEach((infraType) => {
      let infraId = byType[infraType];
      if (!infraId) {
        infraId = `${infraType.toUpperCase()}::${rackNode.id}::AUTO`;
        if (!nodeMap.has(infraId)) {
          const facilityId = rackToFacility.get(rackNode.id) || rackNode.facilityId || '';
          nodeMap.set(infraId, {
            id: infraId,
            type: infraType,
            rawType: infraType,
            displayName: `${infraType.toUpperCase()} AUTO`,
            attributes: {
              synthetic: true,
              rack_id: rackNode.id,
            },
            facilityId,
            parentRackId: rackNode.id,
          });
        }
      }
      const linkedNode = nodeMap.get(infraId);
      if (linkedNode) linkedNode.parentRackId = rackNode.id;
      addLink(rackNode.id, infraId, infraType);
    });
  });

  // Preserve any valid dependency edges already in raw graph.
  asArray(model.edges).forEach((edge) => {
    const sourceId = resolveNodeId(edge?.source);
    const targetId = resolveNodeId(edge?.target);
    if (!sourceId || !targetId) return;
    const sourceNode = nodeMap.get(sourceId);
    const targetNode = nodeMap.get(targetId);
    const type = inferEdgeDependencyType(sourceNode, targetNode);
    if (!type) return;
    addLink(sourceId, targetId, type);
  });

  const degree = new Map();
  links.forEach((link) => {
    const sourceId = resolveNodeId(link.source);
    const targetId = resolveNodeId(link.target);
    degree.set(sourceId, Number(degree.get(sourceId) || 0) + 1);
    degree.set(targetId, Number(degree.get(targetId) || 0) + 1);
  });

  const nodes = [...nodeMap.values()].filter((node) => Number(degree.get(node.id) || 0) > 0);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const normalizedLinks = links.filter((link) => nodeById.has(resolveNodeId(link.source)) && nodeById.has(resolveNodeId(link.target)));

  return {
    nodes,
    links: normalizedLinks,
    nodeById,
  };
}

function curvedPath(source, target) {
  const sx = Number(source?.x || 0);
  const sy = Number(source?.y || 0);
  const tx = Number(target?.x || 0);
  const ty = Number(target?.y || 0);
  const dx = tx - sx;
  const dy = ty - sy;
  const drBase = Math.sqrt(dx * dx + dy * dy);
  const dr = Math.max(16, drBase);
  return `M ${sx} ${sy} A ${dr} ${dr} 0 0,1 ${tx} ${ty}`;
}

export default function TopologyGraphPage({
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
  const svgRef = useRef(null);
  const viewportRef = useRef(null);
  const simulationRef = useRef(null);
  const linkForceRef = useRef(null);
  const zoomBehaviorRef = useRef(null);
  const nodeStoreRef = useRef(new Map());
  const linkStoreRef = useRef([]);
  const frameRef = useRef(0);
  const onTransformChangeRef = useRef(onTransformChange);
  const autoFitPendingRef = useRef(false);
  const clickDelayRef = useRef(0);

  const [tick, setTick] = useState(0);
  const [transform, setTransform] = useState(() => {
    const initial = initialTransform || { x: 0, y: 0, k: 1 };
    return zoomIdentity
      .translate(Number(initial.x || 0), Number(initial.y || 0))
      .scale(Number(initial.k || 1));
  });
  const [zoomLevel, setZoomLevel] = useState(Number(initialTransform?.k || 1));
  const [expandedClusterId, setExpandedClusterId] = useState('');
  const [expandedClusterType, setExpandedClusterType] = useState('');

  const queueRender = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = 0;
      setTick((value) => value + 1);
    });
  }, []);

  const zoomToFit = useCallback(() => {
    const svgNode = svgRef.current;
    const zoomBehavior = zoomBehaviorRef.current;
    if (!svgNode || !zoomBehavior) return;

    const nodes = [...nodeStoreRef.current.values()].filter(
      (node) => Number.isFinite(node?.x) && Number.isFinite(node?.y)
    );
    if (nodes.length === 0) return;

    const width = Number(svgNode.clientWidth || 1600);
    const height = Number(svgNode.clientHeight || 900);
    const xs = nodes.map((node) => Number(node.x));
    const ys = nodes.map((node) => Number(node.y));
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const graphWidth = Math.max(120, maxX - minX);
    const graphHeight = Math.max(120, maxY - minY);
    const padding = 120;

    const scaleX = (width - padding) / graphWidth;
    const scaleY = (height - padding) / graphHeight;
    const scale = Math.max(0.15, Math.min(2.6, Math.min(scaleX, scaleY)));

    const tx = width / 2 - ((minX + maxX) / 2) * scale;
    const ty = height / 2 - ((minY + maxY) / 2) * scale;
    const next = zoomIdentity.translate(tx, ty).scale(scale);

    setTransform(next);
    select(svgNode).call(zoomBehavior.transform, next);
  }, []);

  const getNeighborNodes = useCallback((node) => {
    const nodeId = resolveNodeId(node?.id || node);
    if (!nodeId) return [];

    const neighbors = [];
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
      neighbors.push(otherNode);
    });

    return neighbors;
  }, []);

  useEffect(() => {
    onTransformChangeRef.current = onTransformChange;
  }, [onTransformChange]);

  useEffect(() => () => {
    if (frameRef.current) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    }
    if (clickDelayRef.current) {
      window.clearTimeout(clickDelayRef.current);
      clickDelayRef.current = 0;
    }
  }, []);

  const dependencyGraph = useMemo(() => buildDependencyGraph(model), [model]);

  useEffect(() => {
    const viewportNode = viewportRef.current;
    if (!viewportNode) return;

    if (!Number.isFinite(transform.x) || !Number.isFinite(transform.y) || !Number.isFinite(transform.k)) {
      console.warn('Invalid transform detected, resetting safely');
      setTransform(zoomIdentity);
      return;
    }

    select(viewportNode).attr('transform', transform.toString());
    setZoomLevel(Number(transform.k || 1));
  }, [transform]);

  useEffect(() => {
    const svgNode = svgRef.current;
    if (!svgNode) return undefined;

    const svgSelection = select(svgNode);
    const initial = transform;

    const zoomBehavior = d3Zoom()
      .scaleExtent([0.15, 8])
      .on('zoom', (event) => {
        const current = event.transform;
        if (!Number.isFinite(current.x) || !Number.isFinite(current.y) || !Number.isFinite(current.k)) {
          console.warn('Invalid transform detected, resetting safely');
          const safe = zoomIdentity;
          setTransform(safe);
          svgSelection.call(zoomBehavior.transform, safe);
          return;
        }
        setTransform(current);
      })
      .on('end', (event) => {
        if (!onTransformChangeRef.current) return;
        onTransformChangeRef.current({
          x: Number(event.transform.x || 0),
          y: Number(event.transform.y || 0),
          k: Number(event.transform.k || 1),
        });
      });

    zoomBehaviorRef.current = zoomBehavior;
    svgSelection.call(zoomBehavior).on('dblclick.zoom', null);
    svgSelection.call(zoomBehavior.transform, initial);

    return () => {
      zoomBehaviorRef.current = null;
      svgSelection.on('.zoom', null);
    };
  }, []);

  useEffect(() => {
    const svgNode = svgRef.current;
    const width = Number(svgNode?.clientWidth || 1600);
    const height = Number(svgNode?.clientHeight || 900);

    const clusterForce = (alpha) => {
      nodeStoreRef.current.forEach((node) => {
        if (!node?.parentRackId) return;
        const parentRack = nodeStoreRef.current.get(node.parentRackId);
        if (!parentRack || parentRack.id === node.id) return;
        node.vx = Number(node.vx || 0) + (Number(parentRack.x || 0) - Number(node.x || 0)) * 0.05 * alpha;
        node.vy = Number(node.vy || 0) + (Number(parentRack.y || 0) - Number(node.y || 0)) * 0.05 * alpha;
      });
    };

    const simulation = forceSimulation([])
      .force('link', forceLink([]).id((node) => node.id).distance(40).strength(0.6))
      .force('charge', forceManyBody().strength(-120))
      .force('collision', forceCollide().radius(20))
      .force('center', forceCenter(width / 2, height / 2))
      .force('cluster', clusterForce)
      .alphaDecay(0.06)
      .velocityDecay(0.32);

    simulation.on('tick', queueRender);
    simulation.on('end', () => {
      simulation.stop();
      if (autoFitPendingRef.current) {
        autoFitPendingRef.current = false;
        zoomToFit();
      }
      queueRender();
    });

    simulationRef.current = simulation;
    linkForceRef.current = simulation.force('link');

    return () => {
      simulation.stop();
      simulationRef.current = null;
      linkForceRef.current = null;
    };
  }, [queueRender, zoomToFit]);

  useEffect(() => {
    const simulation = simulationRef.current;
    if (!simulation) return;

    const previousMap = nodeStoreRef.current;
    const nextMap = new Map();
    const width = Number(svgRef.current?.clientWidth || 1600);
    const height = Number(svgRef.current?.clientHeight || 900);

    dependencyGraph.nodes.forEach((node) => {
      const existing = previousMap.get(node.id);
      if (existing) {
        existing.type = node.type;
        existing.rawType = node.rawType;
        existing.displayName = node.displayName;
        existing.attributes = node.attributes;
        existing.facilityId = node.facilityId;
        existing.parentRackId = node.parentRackId || '';
        nextMap.set(node.id, existing);
        return;
      }

      let x = width / 2 + (Math.random() - 0.5) * 160;
      let y = height / 2 + (Math.random() - 0.5) * 160;
      const parentRack = node.parentRackId ? previousMap.get(node.parentRackId) : null;
      if (parentRack && Number.isFinite(parentRack.x) && Number.isFinite(parentRack.y)) {
        x = Number(parentRack.x) + (Math.random() - 0.5) * 80;
        y = Number(parentRack.y) + (Math.random() - 0.5) * 80;
      }

      nextMap.set(node.id, {
        ...node,
        x,
        y,
      });
    });

    nextMap.forEach((node) => {
      node.parentRack = node.parentRackId ? nextMap.get(node.parentRackId) || null : null;
    });

    const nextLinks = dependencyGraph.links.map((link) => ({
      ...link,
      source: nextMap.get(resolveNodeId(link.source)) || link.source,
      target: nextMap.get(resolveNodeId(link.target)) || link.target,
    }));

    nodeStoreRef.current = nextMap;
    linkStoreRef.current = nextLinks;

    simulation.nodes([...nextMap.values()]);
    if (linkForceRef.current) linkForceRef.current.links(nextLinks);

    autoFitPendingRef.current = true;
    simulation.alpha(0.9).restart();
    queueRender();
  }, [dependencyGraph, queueRender]);

  useEffect(() => {
    const simulation = simulationRef.current;
    const svgNode = svgRef.current;
    if (!simulation || !svgNode) return undefined;

    const dragBehavior = d3Drag()
      .on('start', (event, node) => {
        if (!node) return;
        node.fx = Number.isFinite(node.x) ? node.x : event.x;
        node.fy = Number.isFinite(node.y) ? node.y : event.y;
        if (!event.active) simulation.alphaTarget(0.08).restart();
      })
      .on('drag', (event, node) => {
        if (!node) return;
        const dx = Number(event.dx || 0);
        const dy = Number(event.dy || 0);

        node.fx = event.x;
        node.fy = event.y;

        const neighbors = getNeighborNodes(node);
        neighbors.forEach((neighbor) => {
          neighbor.fx = Number(neighbor.x || 0) + dx * 0.5;
          neighbor.fy = Number(neighbor.y || 0) + dy * 0.5;
        });

        if (node.type === 'rack') {
          [...nodeStoreRef.current.values()]
            .filter((candidate) => candidate.parentRackId === node.id)
            .forEach((deviceNode) => {
              deviceNode.fx = Number(deviceNode.x || 0) + dx;
              deviceNode.fy = Number(deviceNode.y || 0) + dy;
            });
        }

        queueRender();
      })
      .on('end', (event, node) => {
        if (!node) return;
        node.fx = null;
        node.fy = null;

        getNeighborNodes(node).forEach((neighbor) => {
          neighbor.fx = null;
          neighbor.fy = null;
        });

        if (node.type === 'rack') {
          [...nodeStoreRef.current.values()]
            .filter((candidate) => candidate.parentRackId === node.id)
            .forEach((deviceNode) => {
              deviceNode.fx = null;
              deviceNode.fy = null;
            });
        }

        if (!event.active) simulation.alphaTarget(0);
        queueRender();
      });

    const nodeSelection = select(svgNode).selectAll('g.topology-force-node');
    nodeSelection.each(function bindDatum() {
      const nodeId = this.getAttribute('data-node-id') || '';
      const datum = nodeStoreRef.current.get(nodeId);
      if (datum) this.__data__ = datum;
    });
    nodeSelection.call(dragBehavior);

    return () => {
      nodeSelection.on('.drag', null);
    };
  }, [tick, getNeighborNodes, queueRender]);

  const allNodes = useMemo(() => [...nodeStoreRef.current.values()], [tick]);
  const allEdges = useMemo(() => [...linkStoreRef.current], [tick]);
  const clusterMode = useMemo(() => {
    if (allNodes.length < 3000) return 'none';
    if (zoomLevel < 0.48) return 'hall';
    if (zoomLevel < 0.78) return 'rack';
    return 'none';
  }, [allNodes.length, zoomLevel]);

  const rackToHallMap = useMemo(() => {
    const map = new Map();
    allEdges.forEach((edge) => {
      const sourceId = resolveNodeId(edge.source);
      const targetId = resolveNodeId(edge.target);
      const sourceNode = nodeStoreRef.current.get(sourceId);
      const targetNode = nodeStoreRef.current.get(targetId);
      if (!sourceNode || !targetNode) return;
      if (sourceNode.type === 'hall' && targetNode.type === 'rack') map.set(targetId, sourceId);
      if (sourceNode.type === 'rack' && targetNode.type === 'hall') map.set(sourceId, targetId);
    });
    return map;
  }, [allEdges]);

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

  useEffect(() => {
    if (clusterMode !== 'none') return;
    setExpandedClusterId('');
    setExpandedClusterType('');
  }, [clusterMode]);

  const visibleNodeIdSet = useMemo(() => {
    let includeSet = new Set(allNodes.map((node) => node.id));

    const normalizedFacility = String(facilityFilter || '').trim();
    if (normalizedFacility) {
      includeSet = new Set(
        allNodes
          .filter((node) => node.id === normalizedFacility || node.facilityId === normalizedFacility)
          .map((node) => node.id)
      );
    }

    const normalizedSeverity = String(severityFilter || '').toUpperCase().trim();
    if (normalizedSeverity && normalizedSeverity !== 'ALL') {
      const severitySet = new Set(
        allNodes
          .filter((node) => severityMatches(node, normalizedSeverity, entityLiveMap))
          .map((node) => node.id)
      );
      if (severitySet.size > 0) {
        includeSet = new Set([...includeSet].filter((id) => severitySet.has(id)));
      }
    }

    if (clusterMode === 'rack') {
      includeSet = new Set([...includeSet].filter((id) => {
        const node = nodeStoreRef.current.get(id);
        if (!node) return false;
        const keepAlways = id === selectedEntityId
          || id === rootCauseEntityId
          || pathNodeMembership.has(id);
        if (keepAlways) return true;
        if (node.type === 'facility' || node.type === 'hall' || node.type === 'rack') return true;
        if ((node.type === 'device' || INFRA_TYPES.has(node.type)) && expandedClusterType === 'rack' && node.parentRackId === expandedClusterId) {
          return true;
        }
        return false;
      }));
    } else if (clusterMode === 'hall') {
      includeSet = new Set([...includeSet].filter((id) => {
        const node = nodeStoreRef.current.get(id);
        if (!node) return false;
        const keepAlways = id === selectedEntityId
          || id === rootCauseEntityId
          || pathNodeMembership.has(id);
        if (keepAlways) return true;
        if (node.type === 'facility' || node.type === 'hall') return true;
        if (expandedClusterType === 'hall' && expandedClusterId) {
          if (node.type === 'rack' && rackToHallMap.get(node.id) === expandedClusterId) return true;
          if ((node.type === 'device' || INFRA_TYPES.has(node.type)) && node.parentRackId) {
            return rackToHallMap.get(node.parentRackId) === expandedClusterId;
          }
        }
        return false;
      }));
    }

    if (includeSet.size === 0) {
      return new Set(allNodes.map((node) => node.id));
    }

    return includeSet;
  }, [
    allNodes,
    facilityFilter,
    severityFilter,
    entityLiveMap,
    clusterMode,
    expandedClusterId,
    expandedClusterType,
    selectedEntityId,
    rootCauseEntityId,
    pathNodeMembership,
    rackToHallMap,
  ]);

  const nodes = useMemo(
    () => allNodes
      .filter((node) => visibleNodeIdSet.has(node.id))
      .map((node) => ({
        ...node,
        status: normalizeRuntimeStatus(entityLiveMap?.[node.id]?.status || node?.attributes?.status || 'ACTIVE'),
        alertLevel: alertLevelFromList(alertsByEntity?.[node.id] || node?.alerts || []),
        alertCount: Number((alertsByEntity?.[node.id] || node?.alerts || []).length),
      })),
    [allNodes, visibleNodeIdSet, entityLiveMap, alertsByEntity]
  );

  const visibleEdges = useMemo(
    () => allEdges.filter((edge) => {
      const sourceId = resolveNodeId(edge.source);
      const targetId = resolveNodeId(edge.target);
      const layerType = EDGE_STYLES[edge.type] ? edge.type : 'structural';
      if (!layerToggles[layerType]) return false;
      return visibleNodeIdSet.has(sourceId) && visibleNodeIdSet.has(targetId);
    }),
    [allEdges, visibleNodeIdSet, layerToggles]
  );

  const allLayersDisabled = !layerToggles.structural && !layerToggles.network && !layerToggles.power && !layerToggles.cooling;

  const neighbors = useMemo(() => {
    const set = new Set();
    if (!selectedEntityId) return set;
    visibleEdges.forEach((edge) => {
      const sourceId = resolveNodeId(edge.source);
      const targetId = resolveNodeId(edge.target);
      if (sourceId === selectedEntityId) set.add(targetId);
      if (targetId === selectedEntityId) set.add(sourceId);
    });
    return set;
  }, [visibleEdges, selectedEntityId]);

  const highlightedPathEdges = useMemo(() => {
    return new Set();
  }, []);

  const isNodeInFocus = useCallback((nodeId) => {
    if (hasPath) return pathNodeMembership.has(nodeId);
    if (!selectedEntityId) return true;
    if (focusMode) {
      if (dependencyChainSet && dependencyChainSet.size > 0) return dependencyChainSet.has(nodeId);
      return nodeId === selectedEntityId || neighbors.has(nodeId);
    }
    return nodeId === selectedEntityId || neighbors.has(nodeId);
  }, [hasPath, pathNodeMembership, selectedEntityId, focusMode, dependencyChainSet, neighbors]);

  const isEdgeInFocus = useCallback((edge) => {
    const sourceId = resolveNodeId(edge.source);
    const targetId = resolveNodeId(edge.target);
    if (hasPath) {
      const key = `${sourceId}->${targetId}`;
      return pathEdgeMembership.has(key);
    }
    if (!selectedEntityId) return true;

    if (focusMode) {
      if (dependencyChainSet && dependencyChainSet.size > 0) {
        return dependencyChainSet.has(sourceId) && dependencyChainSet.has(targetId);
      }
      return sourceId === selectedEntityId || targetId === selectedEntityId || neighbors.has(sourceId) || neighbors.has(targetId);
    }

    return sourceId === selectedEntityId || targetId === selectedEntityId;
  }, [hasPath, pathEdgeMembership, selectedEntityId, focusMode, dependencyChainSet, neighbors]);

  const handleNodeSingleClick = useCallback((nodeId) => {
    if (!nodeId) return;
    if (clickDelayRef.current) {
      window.clearTimeout(clickDelayRef.current);
      clickDelayRef.current = 0;
    }
    clickDelayRef.current = window.setTimeout(() => {
      clickDelayRef.current = 0;
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
    }, 200);
  }, [onEntitySelect, clusterMode]);

  const handleNodeDoubleClick = useCallback((nodeId) => {
    if (!nodeId) return;
    if (clickDelayRef.current) {
      window.clearTimeout(clickDelayRef.current);
      clickDelayRef.current = 0;
    }
    if (onEntityInspect) onEntityInspect(nodeId);
  }, [onEntityInspect]);

  return (
    <div className="topology-view-body">
      <svg
        ref={svgRef}
        className="topology-svg"
        viewBox="0 0 1600 900"
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          onBackgroundSelect();
        }}
        role="img"
        aria-label="Force directed dependency topology graph"
      >
        <g ref={viewportRef}>
          <g>
            {visibleEdges.map((edge) => {
              const sourceId = resolveNodeId(edge.source);
              const targetId = resolveNodeId(edge.target);
              const source = nodeStoreRef.current.get(sourceId);
              const target = nodeStoreRef.current.get(targetId);
              if (!source || !target) return null;

              const style = EDGE_STYLES[edge.type] || EDGE_STYLES.structural;
              const inFocus = isEdgeInFocus(edge);

              let stroke = style.stroke;
              let opacity = style.opacity;
              let width = 1.5;
              let dash = style.dash;
              let animatedPulse = false;

              if (performanceMode && !selectedEntityId) {
                opacity *= 0.55;
              }

              if (selectedEntityId) {
                opacity = inFocus ? 1 : 0.1;
                width = inFocus ? 2 : 1.2;
              }

              if (hasPath) {
                if (inFocus) {
                  stroke = '#8cd3ff';
                  opacity = 1;
                  width = 2.6;
                  dash = '';
                  animatedPulse = propagationMode;
                } else {
                  opacity = 0.08;
                }
              }

              if (blastMode && blastData) {
                const sourceLevel = blastData.levels.get(sourceId);
                const targetLevel = blastData.levels.get(targetId);
                const affected = sourceLevel !== undefined || targetLevel !== undefined;
                if (!affected) {
                  opacity = 0.1;
                } else {
                  const level = Math.max(Number(sourceLevel || 0), Number(targetLevel || 0));
                  stroke = levelColor(level, sourceId === selectedEntityId || targetId === selectedEntityId);
                  opacity = 1;
                  width = 2.1;
                  animatedPulse = propagationMode;
                  dash = dash || '8 5';
                }
                if (highlightedPathEdges.has(edgeKey(edge))) {
                  stroke = '#ffffff';
                  width = 2.6;
                  opacity = 1;
                }
              }

              return (
                <path
                  key={edge.id}
                  className={`topology-edge-path${animatedPulse ? ' pulse' : ''}${performanceMode ? ' no-anim' : ''}`}
                  d={curvedPath(source, target)}
                  fill="none"
                  stroke={stroke}
                  strokeDasharray={dash}
                  strokeWidth={width}
                  strokeOpacity={opacity}
                  strokeLinecap="round"
                />
              );
            })}
          </g>

          <g>
            {nodes.map((node) => {
              const visual = NODE_VISUAL[node.type] || NODE_VISUAL.unknown;
              const isSelected = selectedEntityId === node.id;
              const isRootCause = rootCauseEntityId && node.id === rootCauseEntityId;
              const isNeighbor = neighbors.has(node.id);
              const inFocus = isNodeInFocus(node.id);
              const blastLevel = blastData?.levels?.get(node.id);
              const blastAffected = blastMode && blastData ? blastData.impactedSet.has(node.id) : false;
              const alertLevel = node.alertLevel || '';
              const hasAlerts = node.alertCount > 0;
              const metrics = metricIntensity(node, entityLiveMap);

              let opacity = selectedEntityId
                ? (inFocus ? 1 : 0.1)
                : (node.type === 'device' && performanceMode ? 0.68 : 0.98);

              if (selectedEntityId && !focusMode) {
                opacity = isSelected || isNeighbor ? 1 : 0.1;
              }

              if (blastMode && blastData) {
                opacity = blastAffected ? 1 : 0.1;
              }

              const size = visual.size * (isSelected ? 1.3 : 1);
              let fill = visual.color;
              let stroke = isSelected ? '#ffffff' : '#0f141a';
              let metricRingColor = '#6c7f95';
              let metricRingWidth = 0.8 + metrics.power * 1.8;
              let metricNetworkOpacity = 0.25 + metrics.network * 0.65;

              if (heatmapMode) {
                const density = clamp01((node.alertCount / 6) + metrics.combined * 0.6);
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

              if (metrics.temperature > 0.72) metricRingColor = '#ff6a5f';
              else if (metrics.temperature > 0.52) metricRingColor = '#ffb020';
              else metricRingColor = '#46d2a8';

              const shapeClass = `topology-node-shape ${nodeStatusClass(node.status)}${isSelected ? ' selected' : ''}${isRootCause ? ' root-cause' : ''}${hasAlerts ? ` has-alert alert-${alertLevel}` : ''}${performanceMode ? ' no-anim' : ''}`;

              return (
                <g
                  key={node.id}
                  data-node-id={node.id}
                  className="topology-node-group topology-force-node"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleNodeSingleClick(node.id);
                  }}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    handleNodeDoubleClick(node.id);
                  }}
                >
                  <circle
                    className={`topology-metric-ring${performanceMode ? ' no-anim' : ''}`}
                    cx={Number(node.x || 0)}
                    cy={Number(node.y || 0)}
                    r={Math.max(size + 3.8, 6)}
                    fill="none"
                    stroke={metricRingColor}
                    strokeWidth={metricRingWidth}
                    strokeOpacity={Math.max(0.18, metrics.temperature)}
                  />
                  <circle
                    className={`topology-network-ring${performanceMode ? ' no-anim' : ''}`}
                    cx={Number(node.x || 0)}
                    cy={Number(node.y || 0)}
                    r={Math.max(size + 7.2, 8)}
                    fill="none"
                    stroke="#6fd4ff"
                    strokeWidth={1}
                    strokeOpacity={metricNetworkOpacity}
                    strokeDasharray="3 5"
                  />
                  <TopologyNodeShape
                    className={shapeClass}
                    type={node.type}
                    x={Number(node.x || 0)}
                    y={Number(node.y || 0)}
                    size={size}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={isSelected ? 2 : 1.2}
                    opacity={opacity}
                  />

                  {shouldShowLabel({
                    node,
                    zoomLevel,
                    selectedEntityId,
                    performanceMode,
                  }) && (
                    <text
                      x={Number(node.x || 0) + size + 6}
                      y={Number(node.y || 0) + 3}
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
      {(nodes.length === 0 || allLayersDisabled) && (
        <div className="topology-empty-overlay">
          {allLayersDisabled
            ? 'All layers are disabled. Enable at least one layer in Filters.'
            : 'No visible nodes with current filters. Clear filters or reload.'}
        </div>
      )}
    </div>
  );
}
