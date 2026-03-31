const TYPE_MAP = {
  facility: 'facility',
  hall: 'hall',
  row: 'hall',
  rack: 'rack',
  device: 'device',
  server: 'device',
  gpu: 'device',
  storage: 'device',
  network: 'network',
  switch: 'network',
  router: 'network',
  tor: 'network',
  spine: 'network',
  network_switch: 'network',
  power: 'power',
  pdu: 'power',
  power_unit: 'power',
  cooling: 'cooling',
  cooling_unit: 'cooling',
};

const PREFIX_MAP = {
  facility: 'FAC',
  hall: 'HALL',
  rack: 'RACK',
  device: 'DEV',
  network: 'NET',
  power: 'PWR',
  cooling: 'COOL',
  unknown: 'NODE',
};

export const NODE_VISUAL = {
  facility: { color: '#7a5cff', size: 18, shape: 'square' },
  hall: { color: '#6bb7ff', size: 14, shape: 'roundedRect' },
  rack: { color: '#35d8ff', size: 12, shape: 'rackRect' },
  device: { color: '#9ca8b6', size: 5, shape: 'circle' },
  network: { color: '#ff9f40', size: 8, shape: 'diamond' },
  power: { color: '#ffd13d', size: 8, shape: 'hexagon' },
  cooling: { color: '#23d5be', size: 8, shape: 'triangle' },
  unknown: { color: '#72839a', size: 7, shape: 'circle' },
};

function asText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function asNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function firstNumber(...values) {
  for (let i = 0; i < values.length; i += 1) {
    const numeric = asNumber(values[i]);
    if (numeric !== null) return numeric;
  }
  return null;
}

export function canonicalType(rawType) {
  const key = asText(rawType).toLowerCase();
  return TYPE_MAP[key] || 'unknown';
}

function normalizeNodeType(rawNode) {
  return (
    rawNode?.node_type
    || rawNode?.entity_type
    || rawNode?.entityType
    || rawNode?.type
    || rawNode?.kind
    || rawNode?.nodeType
    || rawNode?.attributes?.entity_type
    || rawNode?.attributes?.type
    || 'unknown'
  );
}

function normalizeNodeId(rawNode) {
  return (
    rawNode?.id
    || rawNode?.entity_id
    || rawNode?.node_id
    || rawNode?.entityId
    || rawNode?.nodeId
    || null
  );
}

function normalizeEdgeType(rawEdge) {
  const rawType = asText(
    rawEdge?.type
    || rawEdge?.edge_type
    || rawEdge?.relation_type
    || rawEdge?.relationship
    || 'structural'
  ).toLowerCase();
  if (rawType.includes('network')) return 'network';
  if (rawType.includes('power')) return 'power';
  if (rawType.includes('cool')) return 'cooling';
  if (rawType.includes('struct')) return 'structural';
  return rawType || 'structural';
}

function normalizeEdgeNodeId(rawEdge, key) {
  if (key === 'source') {
    return (
      rawEdge?.from_id
      || rawEdge?.source_id
      || rawEdge?.from
      || rawEdge?.source
      || null
    );
  }
  return (
    rawEdge?.to_id
    || rawEdge?.target_id
    || rawEdge?.to
    || rawEdge?.target
    || null
  );
}

function addToMapList(map, key, value) {
  if (!key || !value) return;
  if (!map.has(key)) map.set(key, []);
  const list = map.get(key);
  if (!list.includes(value)) list.push(value);
}

function sortById(a, b) {
  return String(a).localeCompare(String(b));
}

function severityMatches(node, severity) {
  if (!severity || severity === 'ALL') return true;
  const normalized = String(severity).toUpperCase();
  const level = String(
    node?.attributes?.severity
    || node?.attributes?.status
    || node?.attributes?.state
    || ''
  ).toUpperCase();
  if (normalized === 'CRITICAL') {
    return level.includes('CRITICAL') || level.includes('FAILED');
  }
  if (normalized === 'WARNING') {
    return level.includes('WARNING') || level.includes('DEGRADED') || level.includes('RISK');
  }
  return true;
}

function buildDisplayNames(nodes) {
  const groups = new Map();
  nodes.forEach((node) => {
    if (!groups.has(node.type)) groups.set(node.type, []);
    groups.get(node.type).push(node);
  });

  const map = new Map();
  groups.forEach((groupNodes, type) => {
    groupNodes
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .forEach((node, index) => {
        const attrName = asText(
          node.attributes?.name
          || node.attributes?.label
          || node.attributes?.display_name
          || node.attributes?.code
        );
        map.set(node.id, attrName || `${PREFIX_MAP[type] || PREFIX_MAP.unknown}-${index + 1}`);
      });
  });
  return map;
}

export function buildTopologyModel(rawGraph) {
  const rawNodes = toArray(rawGraph?.nodes);
  const rawEdges = toArray(rawGraph?.edges);

  const nodes = rawNodes
    .map((rawNode) => {
      const id = normalizeNodeId(rawNode);
      if (!id) return null;
      const rawType = normalizeNodeType(rawNode);
      const attributes = rawNode?.attributes || {};
      const state = normalizeRuntimeStatus(
        attributes?.status
        || attributes?.state
        || rawNode?.status
        || rawNode?.state
        || 'ACTIVE'
      );
      const alerts = toArray(rawNode?.alerts || attributes?.alerts)
        .slice(0, 20)
        .map((entry, index) => {
          if (entry && typeof entry === 'object') {
            return {
              id: String(entry.id || entry.alert_id || `${id}-alert-${index + 1}`),
              severity: String(entry.severity || entry.level || 'UNKNOWN').toUpperCase(),
              description: entry.description || entry.message || entry.detail || 'Alert',
              timestamp: entry.timestamp || null,
            };
          }
          return {
            id: `${id}-alert-${index + 1}`,
            severity: 'UNKNOWN',
            description: String(entry || 'Alert'),
            timestamp: null,
          };
        });
      return {
        id: String(id),
        rawType: String(rawType),
        type: canonicalType(rawType),
        attributes,
        state,
        metrics: {
          temperature: firstNumber(attributes?.temp_c, attributes?.temperature, attributes?.inlet_temp),
          power: firstNumber(attributes?.power_kw, attributes?.powerKw, attributes?.default_power_kw),
          network: firstNumber(attributes?.network_usage, attributes?.networkUsage, attributes?.latency_ms, attributes?.latency),
        },
        alerts,
        parentRackId: asText(attributes?.rack_id || attributes?.rackId),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.id.localeCompare(b.id));

  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  const edgeCounter = new Map();
  const edges = rawEdges
    .map((rawEdge) => {
      const source = normalizeEdgeNodeId(rawEdge, 'source');
      const target = normalizeEdgeNodeId(rawEdge, 'target');
      if (!source || !target) return null;
      const sourceId = String(source);
      const targetId = String(target);
      if (!nodeById.has(sourceId) || !nodeById.has(targetId)) return null;
      const type = normalizeEdgeType(rawEdge);
      const edgeKey = `${sourceId}->${targetId}:${type}`;
      const count = edgeCounter.get(edgeKey) || 0;
      edgeCounter.set(edgeKey, count + 1);
      return {
        id: count === 0 ? edgeKey : `${edgeKey}#${count}`,
        source: sourceId,
        target: targetId,
        type,
        latency: Number(rawEdge?.latency || 0),
        attributes: rawEdge?.attributes || {},
      };
    })
    .filter(Boolean);

  const adjacency = new Map();
  const addAdj = (from, to) => {
    if (!adjacency.has(from)) adjacency.set(from, new Set());
    adjacency.get(from).add(to);
  };
  edges.forEach((edge) => {
    addAdj(edge.source, edge.target);
    addAdj(edge.target, edge.source);
  });

  const hallToFacility = new Map();
  const rackToHall = new Map();
  const rackToFacility = new Map();
  const deviceToRack = new Map();
  const infraToRack = new Map();
  const isInfraType = (type) => type === 'network' || type === 'power' || type === 'cooling';

  nodes.forEach((node) => {
    const facilityId = asText(node.attributes?.facility_id || node.attributes?.facilityId);
    const hallId = asText(node.attributes?.hall_id || node.attributes?.hallId || node.attributes?.row_id || node.attributes?.rowId);
    const rackId = asText(node.attributes?.rack_id || node.attributes?.rackId);
    if (node.type === 'hall' && facilityId && nodeById.has(facilityId)) hallToFacility.set(node.id, facilityId);
    if (node.type === 'rack') {
      if (hallId && nodeById.has(hallId)) rackToHall.set(node.id, hallId);
      if (facilityId && nodeById.has(facilityId)) rackToFacility.set(node.id, facilityId);
    }
    if (node.type === 'device' && rackId && nodeById.has(rackId)) deviceToRack.set(node.id, rackId);
    if (isInfraType(node.type) && rackId && nodeById.has(rackId)) {
      infraToRack.set(node.id, rackId);
    }
  });

  const assignFromTypes = (fromNode, toNode) => {
    if (!fromNode || !toNode) return;
    if (fromNode.type === 'facility' && toNode.type === 'hall') hallToFacility.set(toNode.id, fromNode.id);
    if (fromNode.type === 'hall' && toNode.type === 'facility') hallToFacility.set(fromNode.id, toNode.id);
    if (fromNode.type === 'hall' && toNode.type === 'rack') rackToHall.set(toNode.id, fromNode.id);
    if (fromNode.type === 'rack' && toNode.type === 'hall') rackToHall.set(fromNode.id, toNode.id);
    if (fromNode.type === 'facility' && toNode.type === 'rack') rackToFacility.set(toNode.id, fromNode.id);
    if (fromNode.type === 'rack' && toNode.type === 'facility') rackToFacility.set(fromNode.id, toNode.id);
    if (fromNode.type === 'rack' && toNode.type === 'device') deviceToRack.set(toNode.id, fromNode.id);
    if (fromNode.type === 'device' && toNode.type === 'rack') deviceToRack.set(fromNode.id, toNode.id);
    if (fromNode.type === 'rack' && isInfraType(toNode.type)) infraToRack.set(toNode.id, fromNode.id);
    if (isInfraType(fromNode.type) && toNode.type === 'rack') infraToRack.set(fromNode.id, toNode.id);
  };

  edges.forEach((edge) => {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    assignFromTypes(source, target);
  });

  // Infer rack ownership for infra nodes from adjacent devices when explicit
  // rack metadata is missing (for example TOR switches linked only by network edges).
  edges.forEach((edge) => {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) return;
    if (source.type === 'device' && isInfraType(target.type)) {
      const deviceRack = deviceToRack.get(source.id);
      if (deviceRack && !infraToRack.has(target.id)) infraToRack.set(target.id, deviceRack);
    }
    if (isInfraType(source.type) && target.type === 'device') {
      const deviceRack = deviceToRack.get(target.id);
      if (deviceRack && !infraToRack.has(source.id)) infraToRack.set(source.id, deviceRack);
    }
  });

  const facilityIds = nodes.filter((node) => node.type === 'facility').map((node) => node.id);
  const nodeFacilityMap = new Map();
  facilityIds.forEach((facilityId) => nodeFacilityMap.set(facilityId, facilityId));
  hallToFacility.forEach((facilityId, hallId) => nodeFacilityMap.set(hallId, facilityId));

  const resolveRackFacility = (rackId) => {
    if (rackToFacility.has(rackId)) return rackToFacility.get(rackId);
    const hallId = rackToHall.get(rackId);
    if (hallId && hallToFacility.has(hallId)) return hallToFacility.get(hallId);
    return null;
  };

  nodes.forEach((node) => {
    if (node.type === 'rack') {
      const facilityId = resolveRackFacility(node.id);
      if (facilityId) nodeFacilityMap.set(node.id, facilityId);
    } else if (node.type === 'device') {
      const rackId = deviceToRack.get(node.id);
      if (rackId) {
        const facilityId = resolveRackFacility(rackId);
        if (facilityId) nodeFacilityMap.set(node.id, facilityId);
      }
    } else if (isInfraType(node.type)) {
      const rackId = infraToRack.get(node.id);
      if (rackId) {
        const facilityId = resolveRackFacility(rackId);
        if (facilityId) nodeFacilityMap.set(node.id, facilityId);
      }
    }
  });

  const hallsByFacility = new Map();
  hallToFacility.forEach((facilityId, hallId) => addToMapList(hallsByFacility, facilityId, hallId));

  const racksByHall = new Map();
  rackToHall.forEach((hallId, rackId) => addToMapList(racksByHall, hallId, rackId));

  const racksByFacility = new Map();
  nodes.filter((node) => node.type === 'rack').forEach((rackNode) => {
    const facilityId = resolveRackFacility(rackNode.id);
    if (facilityId) addToMapList(racksByFacility, facilityId, rackNode.id);
  });

  const devicesByRack = new Map();
  deviceToRack.forEach((rackId, deviceId) => addToMapList(devicesByRack, rackId, deviceId));

  const infraByRack = new Map();
  infraToRack.forEach((rackId, infraId) => addToMapList(infraByRack, rackId, infraId));

  const displayNameById = buildDisplayNames(nodes);
  const normalizedNodes = nodes.map((node) => ({
    ...node,
    displayName: displayNameById.get(node.id) || node.id,
    facilityId: nodeFacilityMap.get(node.id) || '',
    parentRackId: node.parentRackId
      || (node.type === 'device' ? (deviceToRack.get(node.id) || '') : '')
      || ((node.type === 'network' || node.type === 'power' || node.type === 'cooling') ? (infraToRack.get(node.id) || '') : ''),
  }));

  const finalNodeById = new Map(normalizedNodes.map((node) => [node.id, node]));

  return {
    nodes: normalizedNodes,
    edges,
    nodeById: finalNodeById,
    adjacency,
    hallToFacility,
    rackToHall,
    rackToFacility,
    deviceToRack,
    infraToRack,
    hallsByFacility,
    racksByHall,
    racksByFacility,
    devicesByRack,
    infraByRack,
    facilityIds,
  };
}

export function createSubModel(model, nodeIds) {
  if (!model) return null;
  const includeSet = new Set(nodeIds || []);
  if (includeSet.size === 0) return buildTopologyModel({ nodes: [], edges: [] });

  const rawNodes = model.nodes
    .filter((node) => includeSet.has(node.id))
    .map((node) => ({
      id: node.id,
      node_type: node.rawType,
      attributes: node.attributes,
    }));

  const rawEdges = model.edges
    .filter((edge) => includeSet.has(edge.source) && includeSet.has(edge.target))
    .map((edge) => ({
      from_id: edge.source,
      to_id: edge.target,
      type: edge.type,
      latency: edge.latency,
      attributes: edge.attributes,
    }));

  return buildTopologyModel({ nodes: rawNodes, edges: rawEdges });
}

export function filterModel(model, {
  facilityId = '',
  severity = '',
  entityId = '',
} = {}) {
  if (!model) return null;
  const normalizedFacility = asText(facilityId);
  const normalizedSeverity = asText(severity).toUpperCase();
  const normalizedEntity = asText(entityId);

  let includeSet = new Set(model.nodes.map((node) => node.id));

  if (normalizedFacility) {
    includeSet = new Set(
      model.nodes
        .filter((node) => node.id === normalizedFacility || node.facilityId === normalizedFacility)
        .map((node) => node.id)
    );
    if (model.nodeById.has(normalizedFacility)) includeSet.add(normalizedFacility);
  }

  if (normalizedSeverity && normalizedSeverity !== 'ALL') {
    const severityMatchesIds = new Set(
      model.nodes
        .filter((node) => severityMatches(node, normalizedSeverity))
        .map((node) => node.id)
    );
    if (severityMatchesIds.size > 0) {
      const expanded = new Set();
      severityMatchesIds.forEach((id) => {
        expanded.add(id);
        const neighbors = model.adjacency.get(id) || new Set();
        neighbors.forEach((neighborId) => expanded.add(neighborId));
      });
      if (includeSet.size > 0) {
        includeSet = new Set([...includeSet].filter((id) => expanded.has(id)));
      } else {
        includeSet = expanded;
      }
    }
  }

  if (normalizedEntity) {
    if (model.nodeById.has(normalizedEntity)) {
      const contextSet = new Set([normalizedEntity]);
      const neighbors = model.adjacency.get(normalizedEntity) || new Set();
      neighbors.forEach((id) => contextSet.add(id));
      if (includeSet.size > 0) {
        includeSet = new Set([...includeSet].filter((id) => contextSet.has(id)));
      } else {
        includeSet = contextSet;
      }
    } else {
      includeSet = new Set();
    }
  }

  return createSubModel(model, includeSet);
}

export function buildHierarchyEdges(model) {
  if (!model) return [];
  const edgeSet = new Set();
  const edges = [];
  const pushEdge = (source, target, type = 'structural') => {
    if (!source || !target) return;
    const key = `${source}->${target}:${type}`;
    if (edgeSet.has(key)) return;
    edgeSet.add(key);
    edges.push({ id: key, source, target, type });
  };

  const facilities = (model.nodes || [])
    .filter((node) => node.type === 'facility')
    .map((node) => node.id)
    .sort(sortById);
  const halls = (model.nodes || [])
    .filter((node) => node.type === 'hall')
    .map((node) => node.id)
    .sort(sortById);
  const racks = (model.nodes || [])
    .filter((node) => node.type === 'rack')
    .map((node) => node.id)
    .sort(sortById);

  const validFacility = (candidate) => {
    if (!candidate || !model.nodeById.has(candidate)) return '';
    return model.nodeById.get(candidate)?.type === 'facility' ? candidate : '';
  };
  const validHall = (candidate) => {
    if (!candidate || !model.nodeById.has(candidate)) return '';
    return model.nodeById.get(candidate)?.type === 'hall' ? candidate : '';
  };
  const validRack = (candidate) => {
    if (!candidate || !model.nodeById.has(candidate)) return '';
    return model.nodeById.get(candidate)?.type === 'rack' ? candidate : '';
  };

  const fallbackFacility = facilities[0] || '';
  const fallbackHall = halls[0] || '';
  const fallbackRack = racks[0] || '';

  const facilityForHall = new Map();
  halls.forEach((hallId) => {
    const hallNode = model.nodeById.get(hallId);
    const direct = validFacility(model.hallToFacility.get(hallId));
    const byNode = validFacility(asText(hallNode?.facilityId || hallNode?.attributes?.facility_id || hallNode?.attributes?.facilityId));
    const facilityId = direct || byNode || fallbackFacility;
    if (!facilityId) return;
    facilityForHall.set(hallId, facilityId);
    pushEdge(facilityId, hallId, 'structural');
  });

  const hallsByFacility = new Map();
  facilityForHall.forEach((facilityId, hallId) => addToMapList(hallsByFacility, facilityId, hallId));
  const fallbackHallByFacility = new Map();
  hallsByFacility.forEach((hallIds, facilityId) => {
    const firstHall = hallIds.slice().sort(sortById)[0];
    if (firstHall) fallbackHallByFacility.set(facilityId, firstHall);
  });

  const facilityForRack = new Map();
  racks.forEach((rackId) => {
    const rackNode = model.nodeById.get(rackId);
    const byHall = validHall(model.rackToHall.get(rackId));
    const byNodeHall = validHall(asText(rackNode?.attributes?.hall_id || rackNode?.attributes?.hallId || rackNode?.attributes?.row_id || rackNode?.attributes?.rowId));
    const hallId = byHall || byNodeHall || fallbackHall;
    if (hallId) pushEdge(hallId, rackId, 'structural');

    const byFacility = validFacility(model.rackToFacility.get(rackId));
    const byNodeFacility = validFacility(asText(rackNode?.facilityId || rackNode?.attributes?.facility_id || rackNode?.attributes?.facilityId));
    const fromHallFacility = validFacility(facilityForHall.get(hallId));
    const facilityId = byFacility || byNodeFacility || fromHallFacility || fallbackFacility;
    if (facilityId) facilityForRack.set(rackId, facilityId);
  });

  const racksByFacility = new Map();
  facilityForRack.forEach((facilityId, rackId) => addToMapList(racksByFacility, facilityId, rackId));
  const fallbackRackByFacility = new Map();
  racksByFacility.forEach((rackIds, facilityId) => {
    const firstRack = rackIds.slice().sort(sortById)[0];
    if (firstRack) fallbackRackByFacility.set(facilityId, firstRack);
  });

  const resolveRackForNode = (
    node,
    directRackId,
    {
      allowFacilityFallback = true,
      allowGlobalFallback = true,
    } = {}
  ) => {
    const explicitRack = validRack(directRackId);
    if (explicitRack) return explicitRack;
    const nodeRack = validRack(asText(node?.attributes?.rack_id || node?.attributes?.rackId));
    if (nodeRack) return nodeRack;
    if (allowFacilityFallback) {
      const nodeFacility = validFacility(asText(node?.facilityId || node?.attributes?.facility_id || node?.attributes?.facilityId));
      const facilityRack = validRack(fallbackRackByFacility.get(nodeFacility));
      if (facilityRack) return facilityRack;
    }
    return allowGlobalFallback ? fallbackRack : '';
  };

  (model.nodes || [])
    .filter((node) => node.type === 'device')
    .forEach((node) => {
      const rackId = resolveRackForNode(node, model.deviceToRack.get(node.id), {
        allowFacilityFallback: true,
        allowGlobalFallback: true,
      });
      if (rackId) pushEdge(rackId, node.id, 'structural');
    });

  (model.nodes || [])
    .filter((node) => node.type === 'network' || node.type === 'power' || node.type === 'cooling')
    .forEach((node) => {
      const rackId = resolveRackForNode(node, model.infraToRack.get(node.id), {
        allowFacilityFallback: false,
        allowGlobalFallback: false,
      });
      if (rackId) pushEdge(rackId, node.id, 'structural');
    });

  return edges;
}

export function getNeighborSet(model, nodeId) {
  const set = new Set();
  if (!model || !nodeId) return set;
  const neighbors = model.adjacency.get(nodeId) || new Set();
  neighbors.forEach((id) => set.add(id));
  return set;
}

export function buildNodeLookup(model) {
  const map = new Map();
  model?.nodes?.forEach((node) => map.set(node.id, node));
  return map;
}

export function normalizeRuntimeStatus(value) {
  const raw = String(value || '').toUpperCase();
  if (!raw) return 'ACTIVE';
  if (raw.includes('FAILED')) return 'FAILED';
  if (raw.includes('DEGRADED')) return 'DEGRADED';
  if (raw.includes('RISK')) return 'AT_RISK';
  if (raw.includes('PROGRESS')) return 'IN_PROGRESS';
  if (raw.includes('RESOLVED') || raw.includes('ACTIVE')) return 'ACTIVE';
  return 'ACTIVE';
}

export function statusRank(status) {
  switch (normalizeRuntimeStatus(status)) {
    case 'FAILED':
      return 4;
    case 'DEGRADED':
      return 3;
    case 'AT_RISK':
      return 2;
    case 'IN_PROGRESS':
      return 1;
    default:
      return 0;
  }
}

export function parseBlastData(centerId, payload) {
  const levels = new Map();
  const severity = new Map();
  const edgeSetByTarget = new Map();
  const pathEdges = new Set();

  if (centerId) {
    levels.set(centerId, 0);
    severity.set(centerId, 'HIGH');
  }

  const impacted = Array.isArray(payload?.impacted_nodes) ? payload.impacted_nodes : [];
  impacted.forEach((entry) => {
    const id = entry?.entity_id || entry?.id || entry?.node_id;
    if (!id) return;
    const numericLevel = Number(entry?.level ?? entry?.distance ?? entry?.hop_count);
    const level = Number.isFinite(numericLevel) ? Math.max(1, Math.floor(numericLevel)) : 1;
    const current = levels.get(String(id));
    if (current === undefined || level < current) levels.set(String(id), level);
    const sev = String(entry?.severity || '').toUpperCase();
    if (sev) severity.set(String(id), sev);
  });

  const direct = Array.isArray(payload?.directly_connected) ? payload.directly_connected : [];
  direct.forEach((entry) => {
    const id = entry?.entity_id || entry?.id || entry?.node_id;
    if (!id) return;
    const key = String(id);
    const current = levels.get(key);
    if (current === undefined || 1 < current) levels.set(key, 1);
    if (!severity.has(key)) severity.set(key, 'MEDIUM');
  });

  const indirect = Array.isArray(payload?.indirectly_affected) ? payload.indirectly_affected : [];
  indirect.forEach((entry) => {
    const id = entry?.entity_id || entry?.id || entry?.node_id;
    if (!id) return;
    const key = String(id);
    const current = levels.get(key);
    if (current === undefined || 2 < current) levels.set(key, 2);
    if (!severity.has(key)) severity.set(key, 'LOW');
  });

  const rawPaths = Array.isArray(payload?.paths)
    ? payload.paths
    : Array.isArray(payload?.propagation_paths)
      ? payload.propagation_paths
      : [];

  rawPaths.forEach((entry) => {
    const path = Array.isArray(entry)
      ? entry
      : Array.isArray(entry?.path)
        ? entry.path
        : [];
    if (path.length < 2) return;

    const last = String(path[path.length - 1]);
    if (!edgeSetByTarget.has(last)) edgeSetByTarget.set(last, new Set());

    for (let i = 0; i < path.length; i += 1) {
      const nodeId = String(path[i]);
      if (i > 0) {
        const level = i;
        const current = levels.get(nodeId);
        if (current === undefined || level < current) levels.set(nodeId, level);
      }
      if (i < path.length - 1) {
        const source = String(path[i]);
        const target = String(path[i + 1]);
        const edgeKey = `${source}->${target}`;
        const reverseKey = `${target}->${source}`;
        pathEdges.add(edgeKey);
        pathEdges.add(reverseKey);
        edgeSetByTarget.get(last).add(edgeKey);
        edgeSetByTarget.get(last).add(reverseKey);
      }
    }
  });

  const impactedSet = new Set(levels.keys());
  if (centerId) impactedSet.add(centerId);

  return {
    centerId: centerId || '',
    levels,
    severity,
    impactedSet,
    pathEdges,
    edgeSetByTarget,
  };
}

export function computeBfsBlast(model, centerId, maxDepth = 2, options = {}) {
  const levels = new Map();
  const impactedSet = new Set();
  const edgeSetByTarget = new Map();
  const parentByNode = new Map();

  if (!model || !centerId || !model.nodeById.has(centerId)) {
    return {
      centerId: centerId || '',
      levels,
      impactedSet,
      edgeSetByTarget,
    };
  }

  const includeUpstream = Boolean(options?.includeUpstream);
  const outgoing = buildCanonicalDirectedAdjacency(model);
  const incoming = new Map();
  outgoing.forEach((targets, sourceId) => {
    targets.forEach((targetId) => {
      if (!incoming.has(targetId)) incoming.set(targetId, new Set());
      incoming.get(targetId).add(sourceId);
    });
  });

  const queue = [{ id: centerId, depth: 0 }];
  levels.set(centerId, 0);
  impactedSet.add(centerId);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    const nextDepth = current.depth + 1;
    if (nextDepth > maxDepth) continue;

    const downstream = outgoing.get(current.id) || new Set();
    downstream.forEach((neighborId) => {
      if (levels.has(neighborId)) return;
      levels.set(neighborId, nextDepth);
      impactedSet.add(neighborId);
      parentByNode.set(neighborId, current.id);
      queue.push({ id: neighborId, depth: nextDepth });
    });
  }

  if (includeUpstream) {
    const upstreamQueue = [{ id: centerId, depth: 0 }];
    const upstreamSeen = new Set([centerId]);
    while (upstreamQueue.length > 0) {
      const current = upstreamQueue.shift();
      if (!current) continue;
      const nextDepth = current.depth + 1;
      if (nextDepth > maxDepth) continue;
      const upstream = incoming.get(current.id) || new Set();
      upstream.forEach((dependencyId) => {
        if (upstreamSeen.has(dependencyId)) return;
        upstreamSeen.add(dependencyId);
        if (!levels.has(dependencyId) || nextDepth < levels.get(dependencyId)) {
          levels.set(dependencyId, nextDepth);
          parentByNode.set(dependencyId, current.id);
        }
        impactedSet.add(dependencyId);
        upstreamQueue.push({ id: dependencyId, depth: nextDepth });
      });
    }
  }

  impactedSet.forEach((targetId) => {
    if (targetId === centerId) return;
    const pathEdges = new Set();
    let cursor = targetId;
    while (parentByNode.has(cursor)) {
      const parentId = parentByNode.get(cursor);
      pathEdges.add(`${parentId}->${cursor}`);
      pathEdges.add(`${cursor}->${parentId}`);
      cursor = parentId;
    }
    edgeSetByTarget.set(targetId, pathEdges);
  });

  return {
    centerId,
    levels,
    impactedSet,
    edgeSetByTarget,
  };
}

export function computeDependencyChain(model, centerId, maxNodes = 400) {
  const chainSet = new Set();
  if (!model || !centerId || !model.nodeById.has(centerId)) return chainSet;

  const queue = [centerId];
  chainSet.add(centerId);
  let idx = 0;
  while (idx < queue.length && chainSet.size < maxNodes) {
    const current = queue[idx];
    idx += 1;
    const neighbors = model.adjacency.get(current) || new Set();
    neighbors.forEach((neighborId) => {
      if (chainSet.has(neighborId) || chainSet.size >= maxNodes) return;
      chainSet.add(neighborId);
      queue.push(neighborId);
    });
  }

  return chainSet;
}

function resolveEntityId(value) {
  if (value && typeof value === 'object' && value.id) return String(value.id);
  return String(value || '');
}

function addDirectedEdge(map, sourceId, targetId) {
  if (!sourceId || !targetId || sourceId === targetId) return;
  if (!map.has(sourceId)) map.set(sourceId, new Set());
  map.get(sourceId).add(targetId);
}

function isInfraNodeType(type) {
  return type === 'network' || type === 'power' || type === 'cooling';
}

function canonicalDirectedPair(model, sourceId, targetId) {
  const sourceNode = model?.nodeById?.get(sourceId);
  const targetNode = model?.nodeById?.get(targetId);
  if (!sourceNode || !targetNode) return [sourceId, targetId];

  const sourceType = sourceNode.type;
  const targetType = targetNode.type;

  if (sourceType === 'facility' && targetType === 'hall') return [sourceId, targetId];
  if (sourceType === 'hall' && targetType === 'facility') return [targetId, sourceId];

  if (sourceType === 'hall' && targetType === 'rack') return [sourceId, targetId];
  if (sourceType === 'rack' && targetType === 'hall') return [targetId, sourceId];

  if (sourceType === 'facility' && targetType === 'rack') return [sourceId, targetId];
  if (sourceType === 'rack' && targetType === 'facility') return [targetId, sourceId];

  if (sourceType === 'rack' && targetType === 'device') return [sourceId, targetId];
  if (sourceType === 'device' && targetType === 'rack') return [targetId, sourceId];

  if (sourceType === 'rack' && isInfraNodeType(targetType)) return [sourceId, targetId];
  if (isInfraNodeType(sourceType) && targetType === 'rack') return [targetId, sourceId];

  return [sourceId, targetId];
}

function buildCanonicalDirectedAdjacency(model) {
  const outgoing = new Map();
  if (!model) return outgoing;

  const addCanonicalEdge = (rawSourceId, rawTargetId) => {
    const sourceId = resolveEntityId(rawSourceId);
    const targetId = resolveEntityId(rawTargetId);
    if (!model.nodeById.has(sourceId) || !model.nodeById.has(targetId)) return;
    const [canonicalSource, canonicalTarget] = canonicalDirectedPair(model, sourceId, targetId);
    addDirectedEdge(outgoing, canonicalSource, canonicalTarget);
  };

  (model.edges || []).forEach((edge) => {
    addCanonicalEdge(edge?.source, edge?.target);
  });

  if (model.hallToFacility?.forEach) {
    model.hallToFacility.forEach((facilityId, hallId) => {
      addCanonicalEdge(facilityId, hallId);
    });
  }

  if (model.rackToHall?.forEach) {
    model.rackToHall.forEach((hallId, rackId) => {
      addCanonicalEdge(hallId, rackId);
    });
  }

  if (model.rackToFacility?.forEach) {
    model.rackToFacility.forEach((facilityId, rackId) => {
      if (model.rackToHall?.has?.(rackId)) return;
      addCanonicalEdge(facilityId, rackId);
    });
  }

  if (model.deviceToRack?.forEach) {
    model.deviceToRack.forEach((rackId, deviceId) => {
      addCanonicalEdge(rackId, deviceId);
    });
  }

  if (model.infraToRack?.forEach) {
    model.infraToRack.forEach((rackId, infraId) => {
      addCanonicalEdge(rackId, infraId);
    });
  }

  return outgoing;
}

function alertSeverityWeight(alerts = []) {
  let best = 0;
  alerts.forEach((alert) => {
    const sev = String(alert?.severity || '').toUpperCase();
    if (sev.includes('CRITICAL')) best = Math.max(best, 4);
    else if (sev.includes('HIGH')) best = Math.max(best, 3);
    else if (sev.includes('WARNING') || sev.includes('MEDIUM')) best = Math.max(best, 2);
    else if (sev.includes('LOW') || sev.includes('INFO')) best = Math.max(best, 1);
  });
  return best;
}

function statusSeverityWeight(status) {
  const normalized = normalizeRuntimeStatus(status);
  if (normalized === 'FAILED') return 4;
  if (normalized === 'DEGRADED') return 3;
  if (normalized === 'AT_RISK') return 2;
  if (normalized === 'IN_PROGRESS') return 1;
  return 0;
}

export function buildDirectedAdjacency(model) {
  return buildCanonicalDirectedAdjacency(model);
}

export function computeDownstreamImpact(model, startId, maxDepth = 4) {
  const impacted = new Set();
  const levels = new Map();
  if (!model || !startId || !model.nodeById.has(startId)) {
    return { impacted, levels };
  }

  const outgoing = buildDirectedAdjacency(model);
  const queue = [{ id: startId, depth: 0 }];
  impacted.add(startId);
  levels.set(startId, 0);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    if (current.depth >= maxDepth) continue;
    const neighbors = outgoing.get(current.id) || new Set();
    neighbors.forEach((neighborId) => {
      if (impacted.has(neighborId)) return;
      impacted.add(neighborId);
      levels.set(neighborId, current.depth + 1);
      queue.push({ id: neighborId, depth: current.depth + 1 });
    });
  }

  return { impacted, levels };
}

export function detectRootCause(model, alertsByEntity = {}, entityLiveMap = {}) {
  if (!model || !Array.isArray(model.nodes) || model.nodes.length === 0) {
    return null;
  }

  let best = null;
  model.nodes.forEach((node) => {
    const alerts = alertsByEntity?.[node.id] || [];
    const alertWeight = alertSeverityWeight(alerts);
    const statusWeight = statusSeverityWeight(
      entityLiveMap?.[node.id]?.status
      || node?.state
      || node?.attributes?.status
      || node?.attributes?.state
      || 'ACTIVE'
    );
    const { impacted } = computeDownstreamImpact(model, node.id, 4);
    const downstreamImpact = Math.max(0, impacted.size - 1);
    const score = alertWeight * 1000 + statusWeight * 200 + downstreamImpact;

    if (score <= 0) return;

    if (!best || score > best.score || (score === best.score && node.id < best.id)) {
      best = {
        id: node.id,
        score,
        alertWeight,
        statusWeight,
        downstreamImpact,
      };
    }
  });

  return best;
}

export function computeShortestPath(model, sourceId, targetId, maxNodes = 4000) {
  const path = [];
  const nodeSet = new Set();
  const edgeSet = new Set();
  if (!model || !sourceId || !targetId || !model.nodeById.has(sourceId) || !model.nodeById.has(targetId)) {
    return { path, nodeSet, edgeSet };
  }

  const queue = [sourceId];
  const parent = new Map();
  parent.set(sourceId, null);
  let idx = 0;
  while (idx < queue.length && queue.length <= maxNodes) {
    const current = queue[idx];
    idx += 1;
    if (current === targetId) break;
    const neighbors = model.adjacency.get(current) || new Set();
    neighbors.forEach((neighborId) => {
      if (parent.has(neighborId)) return;
      parent.set(neighborId, current);
      queue.push(neighborId);
    });
  }

  if (!parent.has(targetId)) {
    return { path, nodeSet, edgeSet };
  }

  let cursor = targetId;
  while (cursor !== null && cursor !== undefined) {
    path.unshift(cursor);
    cursor = parent.get(cursor);
  }

  path.forEach((id) => nodeSet.add(id));
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i];
    const b = path[i + 1];
    edgeSet.add(`${a}->${b}`);
    edgeSet.add(`${b}->${a}`);
  }

  return { path, nodeSet, edgeSet };
}

export function computeDirectedContext(model, centerId, maxDepth = 4) {
  const upstream = new Set();
  const downstream = new Set();
  const hops = new Map();
  if (!model || !centerId || !model.nodeById.has(centerId)) {
    return { upstream, downstream, hops };
  }

  const outgoing = buildDirectedAdjacency(model);
  const incoming = new Map();
  outgoing.forEach((targets, sourceId) => {
    targets.forEach((targetId) => {
      if (!incoming.has(targetId)) incoming.set(targetId, new Set());
      incoming.get(targetId).add(sourceId);
    });
  });

  const walk = (seedId, map, targetSet, sign = 1) => {
    const queue = [{ id: seedId, depth: 0 }];
    const visited = new Set([seedId]);
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      if (current.depth >= maxDepth) continue;
      const neighbors = map.get(current.id) || new Set();
      neighbors.forEach((nextId) => {
        if (visited.has(nextId)) return;
        visited.add(nextId);
        targetSet.add(nextId);
        hops.set(nextId, sign * (current.depth + 1));
        queue.push({ id: nextId, depth: current.depth + 1 });
      });
    }
  };

  hops.set(centerId, 0);
  walk(centerId, outgoing, downstream, 1);
  walk(centerId, incoming, upstream, -1);

  return { upstream, downstream, hops };
}
