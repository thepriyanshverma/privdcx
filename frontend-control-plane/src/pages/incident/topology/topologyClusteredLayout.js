import { buildHierarchyEdges } from './topologyModel';

const INFRA_TYPES = new Set(['network', 'power', 'cooling']);
const HALL_GAP_X = 620;
const HALL_GAP_Y = 460;
const RACK_GAP_X = 170;
const RACK_GAP_Y = 130;
const DEVICE_RING_RADIUS = 34;
const DEVICE_RING_GAP = 20;
const MAX_DEVICES_PER_RING = 14;

function sortById(a, b) {
  return String(a).localeCompare(String(b));
}

function hashString(value) {
  const text = String(value || '');
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function stableAngle(seed) {
  const turns = hashString(seed) % 360;
  return (turns / 360) * Math.PI * 2;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function mergeEdges(primaryEdges, secondaryEdges) {
  const seen = new Set();
  const merged = [];
  [...asArray(primaryEdges), ...asArray(secondaryEdges)].forEach((edge, index) => {
    const source = String(edge?.source || '');
    const target = String(edge?.target || '');
    if (!source || !target) return;
    const type = String(edge?.type || 'structural');
    const key = `${source}->${target}:${type}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push({
      id: edge?.id || `${key}#${index}`,
      source,
      target,
      type,
      latency: Number(edge?.latency || 0),
      attributes: edge?.attributes || {},
    });
  });
  return merged;
}

function averagePoint(points) {
  if (!points || points.length === 0) return null;
  const total = points.reduce((acc, point) => ({
    x: acc.x + Number(point.x || 0),
    y: acc.y + Number(point.y || 0),
  }), { x: 0, y: 0 });
  return { x: total.x / points.length, y: total.y / points.length };
}

function resolveRackForNode(model, nodeId) {
  const node = model.nodeById.get(nodeId);
  if (!node) return '';
  if (node.type === 'rack') return nodeId;
  if (node.type === 'device') return model.deviceToRack.get(nodeId) || '';
  if (INFRA_TYPES.has(node.type)) return model.infraToRack.get(nodeId) || '';
  return '';
}

function buildRackHallAssignment(model) {
  const halls = (model.nodes || [])
    .filter((node) => node.type === 'hall')
    .map((node) => node.id)
    .sort(sortById);
  const firstHall = halls[0] || '';

  const hallForRack = new Map();
  const rackIds = (model.nodes || [])
    .filter((node) => node.type === 'rack')
    .map((node) => node.id)
    .sort(sortById);

  rackIds.forEach((rackId) => {
    const direct = model.rackToHall.get(rackId);
    if (direct && model.nodeById.has(direct)) {
      hallForRack.set(rackId, direct);
      return;
    }
    const facilityId = model.rackToFacility.get(rackId) || model.nodeById.get(rackId)?.facilityId || '';
    const facilityHalls = asArray(model.hallsByFacility.get(facilityId)).slice().sort(sortById);
    if (facilityHalls.length > 0) {
      hallForRack.set(rackId, facilityHalls[0]);
      return;
    }
    hallForRack.set(rackId, firstHall || '__unassigned_hall__');
  });

  return hallForRack;
}

export function buildClusteredGraphLayout(model) {
  if (!model || !Array.isArray(model.nodes) || model.nodes.length === 0) {
    return { positions: new Map(), edges: [], hallZones: [] };
  }

  const positions = new Map();
  const hallZones = [];
  const hierarchyEdges = buildHierarchyEdges(model);
  const edges = mergeEdges(model.edges || [], hierarchyEdges);

  const halls = (model.nodes || [])
    .filter((node) => node.type === 'hall')
    .map((node) => node.id)
    .sort(sortById);
  const racks = (model.nodes || [])
    .filter((node) => node.type === 'rack')
    .map((node) => node.id)
    .sort(sortById);
  const facilities = (model.nodes || [])
    .filter((node) => node.type === 'facility')
    .map((node) => node.id)
    .sort(sortById);

  const hallForRack = buildRackHallAssignment(model);
  const racksByHall = new Map();
  halls.forEach((hallId) => racksByHall.set(hallId, []));
  racks.forEach((rackId) => {
    const hallId = hallForRack.get(rackId) || '__unassigned_hall__';
    if (!racksByHall.has(hallId)) racksByHall.set(hallId, []);
    racksByHall.get(hallId).push(rackId);
  });
  racksByHall.forEach((rackIds) => rackIds.sort(sortById));

  const hallOrder = [];
  const pushedHall = new Set();
  facilities.forEach((facilityId) => {
    asArray(model.hallsByFacility.get(facilityId))
      .slice()
      .sort(sortById)
      .forEach((hallId) => {
        if (pushedHall.has(hallId)) return;
        pushedHall.add(hallId);
        hallOrder.push(hallId);
      });
  });
  halls.forEach((hallId) => {
    if (pushedHall.has(hallId)) return;
    pushedHall.add(hallId);
    hallOrder.push(hallId);
  });
  if (racksByHall.has('__unassigned_hall__') && racksByHall.get('__unassigned_hall__').length > 0) {
    hallOrder.push('__unassigned_hall__');
  }

  const hallCols = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, hallOrder.length))));
  const hallAnchorById = new Map();

  hallOrder.forEach((hallId, hallIndex) => {
    const row = Math.floor(hallIndex / hallCols);
    const col = hallIndex % hallCols;
    const anchorX = col * HALL_GAP_X;
    const anchorY = row * HALL_GAP_Y;
    hallAnchorById.set(hallId, { x: anchorX, y: anchorY });

    const rackIds = asArray(racksByHall.get(hallId)).slice().sort(sortById);
    const rackCols = Math.max(2, Math.ceil(Math.sqrt(Math.max(1, rackIds.length))));
    const rackRows = Math.max(1, Math.ceil(rackIds.length / rackCols));
    const zoneWidth = Math.max(340, rackCols * RACK_GAP_X + 120);
    const zoneHeight = Math.max(260, rackRows * RACK_GAP_Y + 190);

    hallZones.push({
      hallId,
      x: anchorX - zoneWidth / 2,
      y: anchorY - zoneHeight / 2 + 70,
      width: zoneWidth,
      height: zoneHeight,
      isUnassigned: hallId === '__unassigned_hall__',
    });

    if (hallId !== '__unassigned_hall__') {
      positions.set(hallId, {
        x: anchorX,
        y: anchorY - zoneHeight / 2 + 18,
      });
    }

    rackIds.forEach((rackId, rackIndex) => {
      const rackRow = Math.floor(rackIndex / rackCols);
      const rackCol = rackIndex % rackCols;
      const x = anchorX + (rackCol - (rackCols - 1) / 2) * RACK_GAP_X;
      const y = anchorY + 20 + rackRow * RACK_GAP_Y;
      positions.set(rackId, { x, y });
    });
  });

  racks.forEach((rackId, rackIndex) => {
    if (positions.has(rackId)) return;
    const row = Math.floor(rackIndex / 6);
    const col = rackIndex % 6;
    const x = col * RACK_GAP_X;
    const y = row * RACK_GAP_Y;
    positions.set(rackId, { x, y });
  });

  racks.forEach((rackId) => {
    const rackPos = positions.get(rackId);
    if (!rackPos) return;
    const devices = asArray(model.devicesByRack.get(rackId)).slice().sort(sortById);
    const base = stableAngle(rackId);
    devices.forEach((deviceId, deviceIndex) => {
      const ring = Math.floor(deviceIndex / MAX_DEVICES_PER_RING);
      const slot = deviceIndex % MAX_DEVICES_PER_RING;
      const remaining = devices.length - ring * MAX_DEVICES_PER_RING;
      const countThisRing = Math.min(MAX_DEVICES_PER_RING, Math.max(1, remaining));
      const angle = base + (Math.PI * 2 * slot) / countThisRing;
      const radius = DEVICE_RING_RADIUS + ring * DEVICE_RING_GAP;
      positions.set(deviceId, {
        x: rackPos.x + Math.cos(angle) * radius,
        y: rackPos.y + Math.sin(angle) * radius,
      });
    });
  });

  const infraNodes = (model.nodes || [])
    .filter((node) => INFRA_TYPES.has(node.type))
    .slice()
    .sort((a, b) => sortById(a.id, b.id));
  const infraGroupCount = new Map();

  infraNodes.forEach((infraNode) => {
    const connectedRacks = new Set();
    const mappedRack = model.infraToRack.get(infraNode.id);
    if (mappedRack && positions.has(mappedRack)) connectedRacks.add(mappedRack);

    const neighbors = model.adjacency.get(infraNode.id) || new Set();
    neighbors.forEach((neighborId) => {
      const rackId = resolveRackForNode(model, neighborId);
      if (rackId && positions.has(rackId)) connectedRacks.add(rackId);
    });

    const rackIds = [...connectedRacks].sort(sortById);
    if (rackIds.length >= 2) {
      const rackPoints = rackIds
        .map((rackId) => positions.get(rackId))
        .filter(Boolean);
      const centroid = averagePoint(rackPoints);
      if (centroid) {
        const signature = rackIds.join('|');
        const count = infraGroupCount.get(signature) || 0;
        infraGroupCount.set(signature, count + 1);
        const angle = stableAngle(`${infraNode.id}:${signature}`) + count * 0.7;
        const radius = 18 + count * 14;
        positions.set(infraNode.id, {
          x: centroid.x + Math.cos(angle) * radius,
          y: centroid.y + Math.sin(angle) * radius,
        });
        return;
      }
    }

    if (rackIds.length === 1) {
      const rackPos = positions.get(rackIds[0]);
      const typeOffset = infraNode.type === 'network'
        ? { radius: 58, angle: -0.9 }
        : infraNode.type === 'power'
          ? { radius: 58, angle: 2.2 }
          : { radius: 62, angle: 0.75 };
      const angle = typeOffset.angle + stableAngle(infraNode.id) * 0.2;
      positions.set(infraNode.id, {
        x: rackPos.x + Math.cos(angle) * typeOffset.radius,
        y: rackPos.y + Math.sin(angle) * typeOffset.radius,
      });
      return;
    }

    const hallId = hallForRack.get(racks[0]) || hallOrder[0] || '__unassigned_hall__';
    const hallAnchor = hallAnchorById.get(hallId) || { x: 0, y: 0 };
    const fallbackAngle = stableAngle(infraNode.id);
    const fallbackRadius = 140 + (hashString(infraNode.id) % 80);
    positions.set(infraNode.id, {
      x: hallAnchor.x + Math.cos(fallbackAngle) * fallbackRadius,
      y: hallAnchor.y + Math.sin(fallbackAngle) * fallbackRadius,
    });
  });

  facilities.forEach((facilityId, facilityIndex) => {
    const hallIds = asArray(model.hallsByFacility.get(facilityId))
      .filter((hallId) => positions.has(hallId))
      .sort(sortById);
    const hallPoints = hallIds
      .map((hallId) => positions.get(hallId))
      .filter(Boolean);
    const rackIds = asArray(model.racksByFacility.get(facilityId))
      .filter((rackId) => positions.has(rackId))
      .sort(sortById);
    const rackPoints = rackIds
      .map((rackId) => positions.get(rackId))
      .filter(Boolean);

    if (hallPoints.length > 0) {
      const center = averagePoint(hallPoints);
      const minHallY = Math.min(...hallPoints.map((point) => point.y));
      const minRackY = rackPoints.length > 0
        ? Math.min(...rackPoints.map((point) => point.y))
        : Number.POSITIVE_INFINITY;
      positions.set(facilityId, {
        x: center.x,
        y: Math.min(minHallY, minRackY) - 120,
      });
      return;
    }

    if (rackPoints.length > 0) {
      const center = averagePoint(rackPoints);
      const minRackY = Math.min(...rackPoints.map((point) => point.y));
      positions.set(facilityId, {
        x: center.x,
        y: minRackY - 180,
      });
      return;
    }

    positions.set(facilityId, {
      x: facilityIndex * 220,
      y: -220,
    });
  });

  const placedPoints = [...positions.values()];
  const maxX = placedPoints.length > 0 ? Math.max(...placedPoints.map((point) => point.x)) : 0;
  const unresolved = (model.nodes || [])
    .filter((node) => !positions.has(node.id))
    .slice()
    .sort((a, b) => sortById(a.id, b.id));

  unresolved.forEach((node, index) => {
    const row = Math.floor(index / 8);
    const col = index % 8;
    positions.set(node.id, {
      x: maxX + 220 + col * 90,
      y: row * 90,
    });
  });

  return {
    positions,
    edges,
    hallZones,
  };
}

export default buildClusteredGraphLayout;
