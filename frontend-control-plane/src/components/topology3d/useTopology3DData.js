import { useMemo } from 'react';

const INFRA_TYPES = new Set(['network', 'power', 'cooling']);
const STRUCTURAL_TYPES = new Set(['facility', 'hall', 'rack', 'device']);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function resolveAlerts(node, alertsByEntity) {
  return asArray(alertsByEntity?.[node?.id] || node?.alerts || []);
}

function resolveMetrics(node, entityLiveMap) {
  const live = entityLiveMap?.[node?.id] || {};
  return {
    temperature: toNumber(
      live.temperature
      ?? node?.metrics?.temperature
      ?? node?.attributes?.temp_c
      ?? node?.attributes?.temperature
    ),
    power: toNumber(
      live.power
      ?? node?.metrics?.power
      ?? node?.attributes?.power_kw
      ?? node?.attributes?.powerKw
      ?? node?.attributes?.default_power_kw
    ),
    network: toNumber(
      live.networkUsage
      ?? node?.metrics?.network
      ?? node?.attributes?.network_usage
      ?? node?.attributes?.networkUsage
      ?? node?.attributes?.latency_ms
    ),
    status: asText(live.status || node?.attributes?.status || node?.attributes?.state || 'ACTIVE'),
  };
}

function severityMatches(node, severity, entityLiveMap) {
  if (!severity || severity === 'ALL') return true;
  const normalized = String(severity).toUpperCase();
  const liveStatus = String(entityLiveMap?.[node?.id]?.status || '').toUpperCase();
  const nodeStatus = String(node?.attributes?.status || node?.attributes?.state || '').toUpperCase();

  if (normalized === 'CRITICAL') {
    return liveStatus.includes('FAILED') || nodeStatus.includes('CRITICAL') || nodeStatus.includes('FAILED');
  }
  if (normalized === 'WARNING') {
    return liveStatus.includes('DEGRADED')
      || liveStatus.includes('RISK')
      || nodeStatus.includes('WARNING')
      || nodeStatus.includes('DEGRADED')
      || nodeStatus.includes('RISK');
  }
  return true;
}

function resolveRackIdForNode(model, node) {
  if (!node) return '';
  if (node.type === 'rack') return node.id;
  if (node.parentRackId) return node.parentRackId;
  if (node.type === 'device') return asText(model?.deviceToRack?.get(node.id) || node.attributes?.rack_id || node.attributes?.rackId);
  if (INFRA_TYPES.has(node.type)) return asText(model?.infraToRack?.get(node.id) || node.attributes?.rack_id || node.attributes?.rackId);
  return '';
}

function resolveHallIdForRack(model, rackId) {
  if (!rackId) return '';
  return asText(model?.rackToHall?.get(rackId) || '');
}

function resolveFacilityIdForHall(model, hallId, fallback = '') {
  if (!hallId) return fallback;
  return asText(model?.hallToFacility?.get(hallId) || fallback);
}

function resolveDeviceKind(node) {
  const raw = String(
    node?.type === 'device'
      ? (node?.attributes?.device_type || node?.attributes?.deviceType || node?.attributes?.kind || 'compute')
      : node?.type
  ).toLowerCase();

  if (raw.includes('network') || raw.includes('switch') || raw.includes('router') || raw === 'tor') return 'network';
  if (raw.includes('power') || raw.includes('pdu')) return 'power';
  if (raw.includes('cool')) return 'cooling';
  return 'compute';
}

function resolveDeviceBaseColor(kind) {
  if (kind === 'network') return '#ff9f40';
  if (kind === 'power') return '#ffd13d';
  if (kind === 'cooling') return '#23d5be';
  return '#35d8ff';
}

function ensureHierarchyContext(model, includeSet, nodeById) {
  const result = new Set(includeSet);
  const queue = [...result];
  while (queue.length > 0) {
    const nodeId = queue.shift();
    const node = nodeById.get(nodeId);
    if (!node) continue;

    const rackId = resolveRackIdForNode(model, node);
    const hallId = node.type === 'hall' ? node.id : resolveHallIdForRack(model, rackId);
    const facilityId = node.type === 'facility'
      ? node.id
      : resolveFacilityIdForHall(model, hallId, asText(node.facilityId || node.attributes?.facility_id || node.attributes?.facilityId));

    [rackId, hallId, facilityId].forEach((id) => {
      if (!id || result.has(id) || !nodeById.has(id)) return;
      result.add(id);
      queue.push(id);
    });
  }
  return result;
}

function buildEntityContextSet(model, entityId, nodeById) {
  if (!entityId || !nodeById.has(entityId)) return null;
  const set = new Set([entityId]);
  const node = nodeById.get(entityId);

  const neighbors = model?.adjacency?.get(entityId);
  if (neighbors) neighbors.forEach((id) => set.add(id));

  const addMany = (ids) => asArray(ids).forEach((id) => set.add(String(id)));
  if (node?.type === 'facility') {
    const hallIds = model?.hallsByFacility?.get(entityId) || [];
    addMany(hallIds);
    hallIds.forEach((hallId) => {
      const rackIds = model?.racksByHall?.get(hallId) || [];
      addMany(rackIds);
      rackIds.forEach((rackId) => {
        addMany(model?.devicesByRack?.get(rackId));
        addMany(model?.infraByRack?.get(rackId));
      });
    });
  } else if (node?.type === 'hall') {
    const rackIds = model?.racksByHall?.get(entityId) || [];
    addMany(rackIds);
    rackIds.forEach((rackId) => {
      addMany(model?.devicesByRack?.get(rackId));
      addMany(model?.infraByRack?.get(rackId));
    });
  } else if (node?.type === 'rack') {
    addMany(model?.devicesByRack?.get(entityId));
    addMany(model?.infraByRack?.get(entityId));
  }

  return ensureHierarchyContext(model, set, nodeById);
}

export default function useTopology3DData({
  model,
  entityLiveMap = {},
  alertsByEntity = {},
  facilityFilter = '',
  severityFilter = '',
  entityFilter = '',
  layerToggles = { structural: true, network: true, power: true, cooling: true },
}) {
  return useMemo(() => {
    const allNodes = asArray(model?.nodes);
    const nodeById = model?.nodeById instanceof Map
      ? model.nodeById
      : new Map(allNodes.map((node) => [node.id, node]));

    if (allNodes.length === 0) {
      return {
        facility: {
          id: 'FACILITY::EMPTY',
          name: 'Facility',
          width: 80,
          depth: 80,
          userData: {
            entity_id: 'FACILITY::EMPTY',
            type: 'facility',
            parent_id: '',
            metrics: {},
            alerts: [],
          },
        },
        halls: [],
        racks: [],
        devices: [],
        entityIndex: new Map(),
      };
    }

    let includeSet = new Set(allNodes.map((node) => node.id));
    const normalizedFacility = asText(facilityFilter);
    const normalizedSeverity = asText(severityFilter).toUpperCase();
    const normalizedEntity = asText(entityFilter);

    if (normalizedFacility) {
      includeSet = new Set(
        allNodes
          .filter((node) => node.id === normalizedFacility || node.facilityId === normalizedFacility)
          .map((node) => node.id)
      );
    }

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

    if (normalizedEntity) {
      const contextSet = buildEntityContextSet(model, normalizedEntity, nodeById);
      if (contextSet && contextSet.size > 0) {
        includeSet = includeSet.size > 0
          ? new Set([...includeSet].filter((id) => contextSet.has(id)))
          : contextSet;
      }
    }

    includeSet = ensureHierarchyContext(model, includeSet, nodeById);
    if (includeSet.size === 0) includeSet = new Set(allNodes.map((node) => node.id));

    const structuralEnabled = layerToggles?.structural !== false;
    const networkEnabled = layerToggles?.network !== false;
    const powerEnabled = layerToggles?.power !== false;
    const coolingEnabled = layerToggles?.cooling !== false;

    const isVisibleByLayer = (node) => {
      if (!node) return false;
      if (STRUCTURAL_TYPES.has(node.type)) return structuralEnabled;
      if (node.type === 'network') return networkEnabled;
      if (node.type === 'power') return powerEnabled;
      if (node.type === 'cooling') return coolingEnabled;
      return true;
    };

    const visibleNodes = allNodes.filter((node) => includeSet.has(node.id) && isVisibleByLayer(node));
    const visibleNodeSet = new Set(visibleNodes.map((node) => node.id));

    const hallNodes = visibleNodes.filter((node) => node.type === 'hall').slice().sort((a, b) => a.id.localeCompare(b.id));
    const rackNodes = visibleNodes.filter((node) => node.type === 'rack').slice().sort((a, b) => a.id.localeCompare(b.id));
    const deviceNodes = visibleNodes.filter((node) => node.type === 'device' || INFRA_TYPES.has(node.type)).slice().sort((a, b) => a.id.localeCompare(b.id));
    const facilityNodes = visibleNodes.filter((node) => node.type === 'facility');

    const halls = hallNodes.map((node) => ({
      id: node.id,
      name: node.displayName || node.id,
      width: clamp((toNumber(node.attributes?.width_m) || 70) * 0.32, 18, 42),
      depth: clamp((toNumber(node.attributes?.length_m) || 120) * 0.16, 16, 36),
      height: 1.8,
      node,
    }));

    const hallCols = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, halls.length))));
    const hallRows = Math.max(1, Math.ceil(halls.length / hallCols));
    const hallSpacingX = 52;
    const hallSpacingZ = 40;

    const hallLayouts = halls.map((hall, index) => {
      const col = index % hallCols;
      const row = Math.floor(index / hallCols);
      const x = (col - ((hallCols - 1) / 2)) * hallSpacingX;
      const z = (row - ((hallRows - 1) / 2)) * hallSpacingZ;
      const y = hall.height / 2;
      const metrics = resolveMetrics(hall.node, entityLiveMap);
      const alerts = resolveAlerts(hall.node, alertsByEntity);
      return {
        ...hall,
        x,
        y,
        z,
        userData: {
          entity_id: hall.id,
          type: 'hall',
          parent_id: asText(model?.hallToFacility?.get(hall.id) || hall.node?.facilityId || ''),
          metrics,
          alerts,
          display_name: hall.name,
        },
      };
    });

    const hallLayoutById = new Map(hallLayouts.map((hall) => [hall.id, hall]));
    const fallbackHall = hallLayouts[0] || null;

    const racksByHallId = new Map();
    rackNodes.forEach((rack) => {
      let hallId = asText(model?.rackToHall?.get(rack.id) || rack.attributes?.hall_id || rack.attributes?.hallId || rack.attributes?.row_id || rack.attributes?.rowId);
      if (!hallLayoutById.has(hallId) && fallbackHall) hallId = fallbackHall.id;
      if (!racksByHallId.has(hallId)) racksByHallId.set(hallId, []);
      racksByHallId.get(hallId).push(rack);
    });
    racksByHallId.forEach((list) => list.sort((a, b) => a.id.localeCompare(b.id)));

    const rackLayouts = [];
    hallLayouts.forEach((hall) => {
      const hallRacks = racksByHallId.get(hall.id) || [];
      const cols = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, hallRacks.length))));
      const rows = Math.max(1, Math.ceil(hallRacks.length / cols));
      const spacingX = Math.max(1.7, Math.min(3.0, (hall.width * 0.76) / Math.max(1, cols)));
      const spacingZ = Math.max(1.9, Math.min(3.2, (hall.depth * 0.76) / Math.max(1, rows)));
      const startX = hall.x - ((cols - 1) * spacingX) / 2;
      const startZ = hall.z - ((rows - 1) * spacingZ) / 2;

      hallRacks.forEach((rackNode, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        const maxU = clamp(toNumber(rackNode.attributes?.max_u || rackNode.attributes?.maxU || rackNode.attributes?.u_capacity || 42) || 42, 12, 60);
        const height = clamp(maxU * 0.065, 2.2, 3.9);
        const width = 0.95;
        const depth = 1.15;
        const x = startX + col * spacingX;
        const z = startZ + row * spacingZ;
        const y = height / 2;
        const metrics = resolveMetrics(rackNode, entityLiveMap);
        const alerts = resolveAlerts(rackNode, alertsByEntity);

        rackLayouts.push({
          id: rackNode.id,
          name: rackNode.displayName || rackNode.id,
          x,
          y,
          z,
          width,
          height,
          depth,
          maxU,
          hallId: hall.id,
          node: rackNode,
          userData: {
            entity_id: rackNode.id,
            type: 'rack',
            parent_id: hall.id,
            metrics,
            alerts,
            display_name: rackNode.displayName || rackNode.id,
          },
        });
      });
    });

    const rackLayoutById = new Map(rackLayouts.map((rack) => [rack.id, rack]));
    const deviceLayouts = [];

    rackLayouts.forEach((rack) => {
      const fromModel = [
        ...asArray(model?.devicesByRack?.get(rack.id)),
        ...asArray(model?.infraByRack?.get(rack.id)),
      ]
        .map((nodeId) => nodeById.get(nodeId))
        .filter((node) => node && visibleNodeSet.has(node.id));

      const fallbackChildren = deviceNodes.filter((node) => resolveRackIdForNode(model, node) === rack.id);
      const children = (fromModel.length > 0 ? fromModel : fallbackChildren)
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id));

      const rackU = Math.max(8, Number(rack.maxU || 42));
      const uScale = (rack.height * 0.86) / rackU;
      let cursorU = 0;

      children.forEach((node) => {
        const sizeU = clamp(toNumber(node.attributes?.size_u || node.attributes?.sizeU || node.attributes?.u_size || 1) || 1, 1, 8);
        if (cursorU + sizeU > rackU) cursorU = Math.max(0, cursorU % rackU);
        const slotU = Math.min(cursorU, Math.max(0, rackU - sizeU));
        cursorU += sizeU + 0.2;

        const kind = resolveDeviceKind(node);
        const width = rack.width * 0.74;
        const depth = rack.depth * 0.8;
        const height = Math.max(0.065, sizeU * uScale * 0.88);
        const xOffset = kind === 'network' ? -0.16 : kind === 'power' ? 0.16 : 0;
        const zOffset = kind === 'cooling' ? 0.12 : 0;
        const yOffset = (-rack.height / 2) + 0.1 + ((slotU + (sizeU * 0.5)) * uScale);
        const metrics = resolveMetrics(node, entityLiveMap);
        const alerts = resolveAlerts(node, alertsByEntity);

        deviceLayouts.push({
          id: node.id,
          name: node.displayName || node.id,
          rackId: rack.id,
          hallId: rack.hallId,
          kind,
          baseColor: resolveDeviceBaseColor(kind),
          x: rack.x + xOffset,
          y: rack.y + yOffset,
          z: rack.z + zOffset,
          width,
          height,
          depth,
          sizeU,
          node,
          userData: {
            entity_id: node.id,
            type: node.type === 'device' ? kind : node.type,
            parent_id: rack.id,
            metrics,
            alerts,
            display_name: node.displayName || node.id,
          },
        });
      });
    });

    const extentSource = hallLayouts.length > 0 ? hallLayouts : rackLayouts;
    let minX = -30;
    let maxX = 30;
    let minZ = -30;
    let maxZ = 30;
    if (extentSource.length > 0) {
      minX = Math.min(...extentSource.map((entry) => entry.x - (entry.width || 1) / 2));
      maxX = Math.max(...extentSource.map((entry) => entry.x + (entry.width || 1) / 2));
      minZ = Math.min(...extentSource.map((entry) => entry.z - (entry.depth || 1) / 2));
      maxZ = Math.max(...extentSource.map((entry) => entry.z + (entry.depth || 1) / 2));
    }

    const floorWidth = clamp((maxX - minX) + 36, 80, 280);
    const floorDepth = clamp((maxZ - minZ) + 36, 80, 280);
    const facilityNode = facilityNodes[0] || null;
    const facilityId = facilityNode?.id || 'FACILITY::3D';
    const facilityName = facilityNode?.displayName || 'Facility';
    const facilityMetrics = facilityNode ? resolveMetrics(facilityNode, entityLiveMap) : {};
    const facilityAlerts = facilityNode ? resolveAlerts(facilityNode, alertsByEntity) : [];

    const entityIndex = new Map();
    hallLayouts.forEach((hall) => entityIndex.set(hall.id, { x: hall.x, y: hall.y, z: hall.z, type: 'hall' }));
    rackLayouts.forEach((rack) => entityIndex.set(rack.id, { x: rack.x, y: rack.y, z: rack.z, type: 'rack' }));
    deviceLayouts.forEach((device) => entityIndex.set(device.id, { x: device.x, y: device.y, z: device.z, type: device.kind }));
    entityIndex.set(facilityId, { x: 0, y: 0, z: 0, type: 'facility' });

    return {
      facility: {
        id: facilityId,
        name: facilityName,
        width: floorWidth,
        depth: floorDepth,
        userData: {
          entity_id: facilityId,
          type: 'facility',
          parent_id: '',
          metrics: facilityMetrics,
          alerts: facilityAlerts,
          display_name: facilityName,
        },
      },
      halls: hallLayouts,
      racks: rackLayouts,
      devices: deviceLayouts,
      entityIndex,
    };
  }, [
    model,
    entityLiveMap,
    alertsByEntity,
    facilityFilter,
    severityFilter,
    entityFilter,
    layerToggles,
  ]);
}

