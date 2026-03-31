import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../../services/api';
import useSharedFilters from '../../../hooks/useSharedFilters';
import TopologyFilters from './TopologyFilters';
import TopologyLegend from './TopologyLegend';
import TopologyRadialPage from './TopologyRadialPage';
import TopologyGraphPage from './TopologyGraphPage';
import TopologyRackPage from './TopologyRackPage';
import {
  buildTopologyModel,
  computeDirectedContext,
  computeShortestPath,
  detectRootCause,
  computeBfsBlast,
  computeDependencyChain,
  filterModel,
  normalizeRuntimeStatus,
  statusRank,
} from './topologyModel';
import './TopologyWorkspace.css';

function emptyModel() {
  return buildTopologyModel({ nodes: [], edges: [] });
}

function asText(value, fallback = 'n/a') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function formatTime(value) {
  if (!value) return 'n/a';
  const numeric = Number(value);
  const date = Number.isFinite(numeric) ? new Date(numeric * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return 'n/a';
  return date.toLocaleString();
}

function formatMetric(value, decimals = 1, unit = '') {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'n/a';
  return `${numeric.toFixed(decimals)}${unit}`;
}

function parseMetric(entry, record) {
  const metricName = String(entry?.metric_name || '').toLowerCase();
  const rawValue = Number(entry?.metric_value);
  const value = Number.isFinite(rawValue) ? rawValue : null;
  if (value === null) return;

  if (metricName.includes('temp')) {
    record.temperature = value;
  } else if (metricName.includes('power')) {
    record.power = value;
  } else if (metricName.includes('network') || metricName.includes('latency') || metricName.includes('packet')) {
    record.networkUsage = value;
  }

  record.metricName = entry?.metric_name || record.metricName || null;
  record.metricValue = value;
}

function resolveTimelineEntityId(entry) {
  const direct = entry?.entity_id || entry?.entityId || entry?.node_id;
  if (direct) return String(direct);
  const rawMetric = entry?.raw?.alert_json?.raw_metric_event
    || entry?.raw?.kafka_event
    || entry?.kafka_event
    || {};
  return String(rawMetric.device_id || rawMetric.rack_id || rawMetric.facility_id || '').trim();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function firstNumber(...values) {
  for (let i = 0; i < values.length; i += 1) {
    const numeric = toNumber(values[i]);
    if (numeric !== null) return numeric;
  }
  return null;
}

function resolveDeviceKind(node, liveRecord = null) {
  const rawKind = String(
    liveRecord?.deviceType
    || node?.attributes?.device_type
    || node?.attributes?.deviceType
    || node?.attributes?.kind
    || node?.rawType
    || node?.type
    || ''
  ).trim().toLowerCase();
  if (!rawKind || rawKind === 'device') return 'device';
  return rawKind;
}

export default function TopologyWorkbenchPage() {
  const navigate = useNavigate();
  const { filters, setFilter, setFilters } = useSharedFilters();

  const [viewMode, setViewMode] = useState('radial');
  const [focusMode, setFocusMode] = useState(false);
  const [blastMode, setBlastMode] = useState(false);
  const [pathMode, setPathMode] = useState(false);
  const [pathStartId, setPathStartId] = useState('');
  const [pathEndId, setPathEndId] = useState('');
  const [heatmapMode, setHeatmapMode] = useState(false);
  const [propagationMode, setPropagationMode] = useState(true);
  const [rootCauseEntityId, setRootCauseEntityId] = useState('');
  const [layerToggles, setLayerToggles] = useState({
    structural: true,
    network: true,
    power: true,
    cooling: true,
  });
  const [selectedEntityId, setSelectedEntityId] = useState('');
  const [inspectorEntityId, setInspectorEntityId] = useState('');
  const [entityInputValue, setEntityInputValue] = useState(filters.entity_id || '');

  const [rawGraph, setRawGraph] = useState({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reloadVersion, setReloadVersion] = useState(0);
  const [resetToken, setResetToken] = useState(0);

  const [entityLiveMap, setEntityLiveMap] = useState({});
  const [alertsByEntity, setAlertsByEntity] = useState({});
  const [actionsByEntity, setActionsByEntity] = useState({});
  const [selectedState, setSelectedState] = useState(null);
  const [liveUpdatedAt, setLiveUpdatedAt] = useState(null);

  const [viewTransforms, setViewTransforms] = useState({
    radial: { x: 0, y: 0, k: 1 },
    graph: { x: 0, y: 0, k: 1 },
  });

  const baseModel = useMemo(() => {
    try {
      return buildTopologyModel(rawGraph);
    } catch {
      return emptyModel();
    }
  }, [rawGraph]);

  const model = useMemo(() => {
    if (!baseModel) return emptyModel();
    return filterModel(baseModel, {
      facilityId: filters.facility_id || '',
      severity: filters.severity || '',
      entityId: '',
    });
  }, [baseModel, filters.facility_id, filters.severity]);

  useEffect(() => {
    setEntityInputValue(filters.entity_id || '');
  }, [filters.entity_id]);

  useEffect(() => {
    const nextEntityId = String(filters.entity_id || '').trim();
    if (!nextEntityId) return;
    setSelectedEntityId(nextEntityId);
  }, [filters.entity_id]);

  const blastData = useMemo(() => {
    if (!blastMode || !selectedEntityId) return null;
    const selectedBlastNode = baseModel.nodeById.get(selectedEntityId);
    const selectedIsDevice = selectedBlastNode?.type === 'device';
    const depth = selectedIsDevice ? 3 : 2;
    return computeBfsBlast(baseModel, selectedEntityId, depth, {
      includeUpstream: selectedIsDevice,
    });
  }, [blastMode, selectedEntityId, baseModel]);

  useEffect(() => {
    const candidate = detectRootCause(baseModel, alertsByEntity, entityLiveMap);
    setRootCauseEntityId(candidate?.id || '');
  }, [baseModel, alertsByEntity, entityLiveMap]);

  const pathData = useMemo(() => {
    if (!pathMode || !pathStartId || !pathEndId) {
      return {
        path: [],
        nodeSet: new Set(),
        edgeSet: new Set(),
      };
    }
    return computeShortestPath(baseModel, pathStartId, pathEndId);
  }, [pathMode, pathStartId, pathEndId, baseModel]);

  const dependencyChainSet = useMemo(() => {
    if (!focusMode || !selectedEntityId) return new Set();
    return computeDependencyChain(model, selectedEntityId, 500);
  }, [focusMode, selectedEntityId, model]);

  const focusContext = useMemo(() => {
    if (!focusMode || !selectedEntityId) {
      return { upstream: new Set(), downstream: new Set(), hops: new Map() };
    }
    return computeDirectedContext(baseModel, selectedEntityId, 4);
  }, [focusMode, selectedEntityId, baseModel]);

  const fetchTopology = useCallback(async () => {
    if (!filters.workspace_id) {
      setRawGraph({ nodes: [], edges: [] });
      setError('');
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await api.get(`/v1/topology/${encodeURIComponent(filters.workspace_id)}`);
      const nodes = Array.isArray(response?.nodes) ? response.nodes : [];
      const edges = Array.isArray(response?.edges) ? response.edges : [];
      setRawGraph({ nodes, edges });
      setError('');
    } catch (err) {
      setRawGraph({ nodes: [], edges: [] });
      setError(err.message || 'Failed to load topology graph.');
    } finally {
      setLoading(false);
    }
  }, [filters.workspace_id]);

  useEffect(() => {
    fetchTopology();
  }, [fetchTopology, reloadVersion]);

  const fetchLiveData = useCallback(async () => {
    if (!filters.workspace_id) {
      setEntityLiveMap({});
      setAlertsByEntity({});
      setActionsByEntity({});
      setLiveUpdatedAt(null);
      return;
    }

    try {
      const timelineParams = new URLSearchParams({
        workspace_id: filters.workspace_id,
        limit: '260',
      });
      if (filters.facility_id) timelineParams.set('facility_id', filters.facility_id);

      const alertsParams = new URLSearchParams({
        workspace_id: filters.workspace_id,
        limit: '200',
      });

      const metricsParams = new URLSearchParams({
        workspace_id: filters.workspace_id,
      });
      if (filters.facility_id) metricsParams.set('facility_id', filters.facility_id);

      const [timelineResponse, alertsResponse, metricsResponse] = await Promise.all([
        api.get(`/v1/timeline?${timelineParams.toString()}`).catch(() => []),
        api.get(`/v1/alerts?${alertsParams.toString()}`).catch(() => []),
        api.get(`/v1/metrics/entities/live?${metricsParams.toString()}`).catch(() => ({ entities: {} })),
      ]);

      const timelineEntries = toArray(timelineResponse)
        .slice()
        .sort((a, b) => Number(b?.timestamp || 0) - Number(a?.timestamp || 0));

      const nextLive = {};
      const nextActions = {};

      timelineEntries.forEach((entry) => {
        const entityId = resolveTimelineEntityId(entry);
        if (!entityId) return;

        if (!nextLive[entityId]) {
          nextLive[entityId] = {
            status: 'ACTIVE',
            healthScore: null,
            riskScore: null,
            temperature: null,
            power: null,
            networkUsage: null,
            metricName: null,
            metricValue: null,
            deviceType: null,
            lastTimestamp: null,
          };
        }

        const record = nextLive[entityId];
        const status = normalizeRuntimeStatus(
          entry?.status
          || entry?.runtime?.status
          || entry?.runtime?.state
          || entry?.alert?.status
          || entry?.alert?.severity
        );

        if (statusRank(status) >= statusRank(record.status)) {
          record.status = status;
        }

        if (record.lastTimestamp === null) {
          record.lastTimestamp = entry?.timestamp || null;
        }

        const runtimeHealth = Number(entry?.runtime?.health_score);
        const topologyHealth = Number(entry?.topology_intelligence?.health_score);
        const runtimeRisk = Number(entry?.runtime?.risk_score);
        const topologyRisk = Number(entry?.topology_intelligence?.risk_score);

        if (Number.isFinite(runtimeHealth)) record.healthScore = runtimeHealth;
        else if (Number.isFinite(topologyHealth)) record.healthScore = topologyHealth;

        if (Number.isFinite(runtimeRisk)) record.riskScore = runtimeRisk;
        else if (Number.isFinite(topologyRisk)) record.riskScore = topologyRisk;

        parseMetric(entry, record);

        const actionName = entry?.runtime?.action
          || entry?.runtime?.decision?.policy_selected
          || entry?.runtime?.decision?.action;

        if (actionName) {
          if (!nextActions[entityId]) nextActions[entityId] = [];
          if (nextActions[entityId].length < 20) {
            nextActions[entityId].push({
              action: actionName,
              status: entry?.runtime?.verification || entry?.runtime?.status || entry?.status || 'UNKNOWN',
              timestamp: entry?.runtime?.runtime_start || entry?.timestamp || null,
            });
          }
        }
      });

      const liveEntities = metricsResponse && typeof metricsResponse === 'object'
        ? (metricsResponse.entities || {})
        : {};

      Object.entries(liveEntities).forEach(([entityId, metrics]) => {
        const key = String(entityId || '').trim();
        if (!key || !metrics || typeof metrics !== 'object') return;

        if (!nextLive[key]) {
          nextLive[key] = {
            status: 'ACTIVE',
            healthScore: null,
            riskScore: null,
            temperature: null,
            power: null,
            networkUsage: null,
            metricName: null,
            metricValue: null,
            deviceType: null,
            lastTimestamp: null,
          };
        }

        const record = nextLive[key];
        const temperature = firstNumber(metrics.temperature, metrics.temp_c, metrics.temp);
        const power = firstNumber(
          metrics.power,
          metrics.power_kw,
          metrics.powerKw,
          metrics.power_mw !== undefined ? Number(metrics.power_mw) * 1000 : null
        );
        const networkUsage = firstNumber(metrics.networkUsage, metrics.network, metrics.network_mbps, metrics.network_pct);

        if (temperature !== null) record.temperature = temperature;
        if (power !== null) record.power = power;
        if (networkUsage !== null) record.networkUsage = networkUsage;

        if (metrics.metricName) record.metricName = metrics.metricName;
        if (metrics.metricValue !== undefined && metrics.metricValue !== null) {
          const numericMetricValue = Number(metrics.metricValue);
          record.metricValue = Number.isFinite(numericMetricValue) ? numericMetricValue : metrics.metricValue;
        }

        const deviceType = String(metrics.deviceType || metrics.device_type || '').trim();
        if (deviceType) record.deviceType = deviceType;
      });

      const alertList = Array.isArray(alertsResponse)
        ? alertsResponse
        : Array.isArray(alertsResponse?.items)
          ? alertsResponse.items
          : [];

      const nextAlerts = {};
      alertList.forEach((alert) => {
        const entityId = alert?.entity_id || alert?.entity || alert?.source_id || alert?.component;
        if (!entityId) return;
        if (!nextAlerts[entityId]) nextAlerts[entityId] = [];
        if (nextAlerts[entityId].length < 20) {
          nextAlerts[entityId].push({
            id: alert?.id || alert?.alert_id || `${entityId}-${alert?.timestamp || Date.now()}`,
            severity: alert?.severity || 'UNKNOWN',
            description: alert?.description || alert?.message || alert?.detail || 'Alert',
            timestamp: alert?.timestamp || null,
          });
        }
      });

      setEntityLiveMap(nextLive);
      setAlertsByEntity(nextAlerts);
      setActionsByEntity(nextActions);
      setLiveUpdatedAt(Date.now());
    } catch {
      // Keep previous successful data.
    }
  }, [filters.workspace_id, filters.facility_id]);

  useEffect(() => {
    fetchLiveData();
  }, [fetchLiveData, reloadVersion]);

  useEffect(() => {
    if (!selectedEntityId || !filters.workspace_id) {
      setSelectedState(null);
      return;
    }

    let active = true;
    const run = async () => {
      try {
        const response = await api.get(`/v1/state/${encodeURIComponent(selectedEntityId)}?workspace_id=${encodeURIComponent(filters.workspace_id)}`);
        if (!active) return;
        setSelectedState(response || null);
      } catch {
        if (!active) return;
        setSelectedState(null);
      }
    };

    run();
    return () => {
      active = false;
    };
  }, [selectedEntityId, filters.workspace_id, liveUpdatedAt]);

  const onFilterChange = useCallback((key, value) => {
    if (key === 'entity_id') {
      setEntityInputValue(String(value || ''));
      return;
    }
    setFilter(key, value);
  }, [setFilter]);

  const onEntityInputChange = useCallback((value) => {
    const nextRaw = String(value || '');
    setEntityInputValue(nextRaw);
    if (nextRaw.trim() !== '') return;
    setFilter('entity_id', '');
    setSelectedEntityId('');
    setInspectorEntityId('');
    setSelectedState(null);
    setBlastMode(false);
  }, [setFilter]);

  const onEntityInputCommit = useCallback((value) => {
    const nextEntityId = String(value || '').trim();
    setEntityInputValue(nextEntityId);
    setFilter('entity_id', nextEntityId);
    setSelectedEntityId(nextEntityId);
    setSelectedState(null);

    if (!nextEntityId) {
      setInspectorEntityId('');
      setBlastMode(false);
      return;
    }

    if (inspectorEntityId) setInspectorEntityId(nextEntityId);
  }, [inspectorEntityId, setFilter]);

  const onTransformChange = useCallback((targetView, transform) => {
    if (!targetView || !transform) return;
    setViewTransforms((prev) => ({
      ...prev,
      [targetView]: {
        x: Number(transform.x || 0),
        y: Number(transform.y || 0),
        k: Number(transform.k || 1),
      },
    }));
  }, []);

  const onNodeSelect = useCallback((entityId) => {
    const nextEntityId = String(entityId || '').trim();
    if (!nextEntityId) return;

    if (pathMode) {
      if (!pathStartId) {
        setPathStartId(nextEntityId);
        setPathEndId('');
      } else if (!pathEndId && pathStartId !== nextEntityId) {
        setPathEndId(nextEntityId);
      } else {
        setPathStartId(nextEntityId);
        setPathEndId('');
      }
    }

    if (selectedEntityId && selectedEntityId === nextEntityId) {
      setSelectedEntityId('');
      setInspectorEntityId('');
      setSelectedState(null);
      setBlastMode(false);
      return;
    }

    setEntityInputValue(nextEntityId);
    setSelectedEntityId(nextEntityId);
    setInspectorEntityId(focusMode ? nextEntityId : '');
    setSelectedState(null);
  }, [focusMode, selectedEntityId, pathMode, pathStartId, pathEndId]);

  const onNodeInspect = useCallback((entityId) => {
    const nextEntityId = String(entityId || '').trim();
    if (!nextEntityId) return;
    setEntityInputValue(nextEntityId);
    setSelectedEntityId(nextEntityId);
    setInspectorEntityId(nextEntityId);
    setSelectedState(null);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedEntityId('');
    setInspectorEntityId('');
    setSelectedState(null);
    setBlastMode(false);
  }, []);

  const closeInspector = useCallback(() => {
    setInspectorEntityId('');
  }, []);

  const onRadialTransformChange = useCallback(
    (transform) => onTransformChange('radial', transform),
    [onTransformChange]
  );

  const onGraphTransformChange = useCallback(
    (transform) => onTransformChange('graph', transform),
    [onTransformChange]
  );

  const onToggleLayer = useCallback((layerKey) => {
    if (!layerKey) return;
    setLayerToggles((prev) => {
      const next = {
        ...prev,
        [layerKey]: !prev[layerKey],
      };
      const enabledCount = Object.values(next).filter(Boolean).length;
      if (enabledCount === 0) {
        next[layerKey] = true;
      }
      return next;
    });
  }, []);

  const onAutoDetectRootCause = useCallback(() => {
    const candidate = detectRootCause(baseModel, alertsByEntity, entityLiveMap);
    if (!candidate?.id) return;
    setRootCauseEntityId(candidate.id);
    setSelectedEntityId(candidate.id);
    setEntityInputValue(candidate.id);
    setFilter('entity_id', candidate.id);
    setBlastMode(true);
    setFocusMode(true);
  }, [baseModel, alertsByEntity, entityLiveMap, setFilter]);

  const onReset = () => {
    setFilters({
      facility_id: '',
      entity_id: '',
      severity: '',
    });
    setEntityInputValue('');
    setViewMode('radial');
    setFocusMode(false);
    setBlastMode(false);
    setPathMode(false);
    setPathStartId('');
    setPathEndId('');
    setHeatmapMode(false);
    setPropagationMode(true);
    setSelectedEntityId('');
    setInspectorEntityId('');
    setRootCauseEntityId('');
    setLayerToggles({ structural: true, network: true, power: true, cooling: true });
    setViewTransforms({ radial: { x: 0, y: 0, k: 1 }, graph: { x: 0, y: 0, k: 1 } });
    setResetToken((value) => value + 1);
    setReloadVersion((value) => value + 1);
  };

  const onClearFilters = () => {
    setFilters({
      facility_id: '',
      entity_id: '',
      severity: '',
    });
    setEntityInputValue('');
    setSelectedEntityId('');
    setInspectorEntityId('');
    setSelectedState(null);
    setBlastMode(false);
    setPathStartId('');
    setPathEndId('');
  };

  const activeInspectorEntityId = inspectorEntityId || '';
  const selectedNode = activeInspectorEntityId ? baseModel.nodeById.get(activeInspectorEntityId) : null;
  const selectedLive = activeInspectorEntityId ? (entityLiveMap[activeInspectorEntityId] || null) : null;
  const selectedAlerts = activeInspectorEntityId ? (alertsByEntity[activeInspectorEntityId] || []) : [];
  const selectedActions = activeInspectorEntityId ? (actionsByEntity[activeInspectorEntityId] || []) : [];
  const selectedMetrics = useMemo(() => ({
    temperature: firstNumber(
      selectedLive?.temperature,
      selectedNode?.metrics?.temperature,
      selectedNode?.attributes?.temp_c,
      selectedNode?.attributes?.temperature
    ),
    power: firstNumber(
      selectedLive?.power,
      selectedNode?.metrics?.power,
      selectedNode?.attributes?.power_kw,
      selectedNode?.attributes?.powerKw,
      selectedNode?.attributes?.default_power_kw
    ),
    network: firstNumber(
      selectedLive?.networkUsage,
      selectedNode?.metrics?.network,
      selectedNode?.attributes?.network_usage,
      selectedNode?.attributes?.networkUsage,
      selectedNode?.attributes?.latency_ms,
      selectedNode?.attributes?.latency
    ),
  }), [selectedLive, selectedNode]);
  const selectedLastAction = selectedActions[0] || null;
  const selectedDeviceKind = resolveDeviceKind(selectedNode, selectedLive);
  const rackDeviceDetails = useMemo(() => {
    if (!selectedNode || selectedNode.type !== 'rack' || !activeInspectorEntityId) return [];
    return (baseModel.devicesByRack.get(activeInspectorEntityId) || [])
      .slice()
      .sort((a, b) => String(a).localeCompare(String(b)))
      .map((deviceId) => {
        const deviceNode = baseModel.nodeById.get(deviceId);
        const live = entityLiveMap[deviceId] || {};
        const alerts = alertsByEntity[deviceId] || [];
        const actions = actionsByEntity[deviceId] || [];
        return {
          id: deviceId,
          displayName: deviceNode?.displayName || deviceId,
          deviceType: resolveDeviceKind(deviceNode, live),
          status: normalizeRuntimeStatus(live.status || deviceNode?.attributes?.status || 'ACTIVE'),
          temperature: firstNumber(
            live.temperature,
            deviceNode?.metrics?.temperature,
            deviceNode?.attributes?.temp_c,
            deviceNode?.attributes?.temperature
          ),
          power: firstNumber(
            live.power,
            deviceNode?.metrics?.power,
            deviceNode?.attributes?.power_kw,
            deviceNode?.attributes?.powerKw,
            deviceNode?.attributes?.default_power_kw
          ),
          network: firstNumber(
            live.networkUsage,
            deviceNode?.metrics?.network,
            deviceNode?.attributes?.network_usage,
            deviceNode?.attributes?.networkUsage,
            deviceNode?.attributes?.latency_ms,
            deviceNode?.attributes?.latency
          ),
          alerts,
          lastAction: actions[0]?.action || 'none',
          alertSummary: alerts.length === 0
            ? 'none'
            : alerts
              .slice(0, 3)
              .map((alert) => String(alert.severity || 'UNKNOWN'))
              .join(', '),
        };
      });
  }, [selectedNode, activeInspectorEntityId, baseModel, entityLiveMap, alertsByEntity, actionsByEntity]);

  const rackSummary = useMemo(() => {
    if (!selectedNode || selectedNode.type !== 'rack' || !activeInspectorEntityId) return null;
    const devices = rackDeviceDetails;
    const totalPower = devices.reduce((sum, item) => sum + Number(item.power || 0), 0);
    const temps = devices
      .map((item) => Number(item.temperature || 0))
      .filter((value) => Number.isFinite(value) && value > 0);
    const avgTemp = temps.length > 0 ? temps.reduce((sum, value) => sum + value, 0) / temps.length : 0;
    const alertCount = devices.reduce((sum, item) => sum + Number(item.alerts?.length || 0), 0) + selectedAlerts.length;
    return {
      devices,
      totalPower,
      avgTemp,
      alertCount,
    };
  }, [selectedNode, activeInspectorEntityId, rackDeviceDetails, selectedAlerts]);

  const facilitySummary = useMemo(() => {
    if (!selectedNode || selectedNode.type !== 'facility' || !activeInspectorEntityId) return null;
    const rackIds = (baseModel.racksByFacility.get(activeInspectorEntityId) || []).slice();
    const nodeIds = baseModel.nodes
      .filter((node) => node.id === activeInspectorEntityId || node.facilityId === activeInspectorEntityId)
      .map((node) => node.id);
    const alertTotal = nodeIds.reduce((sum, nodeId) => sum + Number((alertsByEntity[nodeId] || []).length), 0);
    const healthSignals = nodeIds.map((nodeId) => normalizeRuntimeStatus(
      entityLiveMap[nodeId]?.status
      || baseModel.nodeById.get(nodeId)?.state
      || baseModel.nodeById.get(nodeId)?.attributes?.status
      || 'ACTIVE'
    ));
    const healthyCount = healthSignals.filter((status) => status === 'ACTIVE').length;
    const healthPercent = healthSignals.length > 0 ? Math.round((healthyCount / healthSignals.length) * 100) : 100;
    return {
      totalRacks: rackIds.length,
      totalAlerts: alertTotal,
      healthPercent,
    };
  }, [selectedNode, activeInspectorEntityId, baseModel, alertsByEntity, entityLiveMap]);

  const breadcrumb = useMemo(() => {
    if (!selectedNode) return '';
    const parts = [];
    const facilityNameById = (id) => baseModel.nodeById.get(id)?.displayName || id;
    const hallNameById = (id) => baseModel.nodeById.get(id)?.displayName || id;
    const rackNameById = (id) => baseModel.nodeById.get(id)?.displayName || id;

    if (selectedNode.type === 'facility') {
      parts.push(selectedNode.displayName || selectedNode.id);
      return parts.join(' -> ');
    }

    const facilityId = selectedNode.facilityId || selectedNode.attributes?.facility_id || selectedNode.attributes?.facilityId || '';
    if (facilityId) parts.push(facilityNameById(facilityId));

    if (selectedNode.type === 'hall') {
      parts.push(selectedNode.displayName || selectedNode.id);
      return parts.join(' -> ');
    }

    const rackIdForNode = selectedNode.type === 'rack'
      ? selectedNode.id
      : selectedNode.parentRackId
        || baseModel.deviceToRack.get(selectedNode.id)
        || baseModel.infraToRack.get(selectedNode.id)
        || selectedNode.attributes?.rack_id
        || selectedNode.attributes?.rackId
        || '';

    const hallIdForRack = rackIdForNode ? (baseModel.rackToHall.get(rackIdForNode) || '') : '';
    if (hallIdForRack) parts.push(hallNameById(hallIdForRack));
    if (rackIdForNode) parts.push(rackNameById(rackIdForNode));

    if (selectedNode.type !== 'rack') {
      parts.push(selectedNode.displayName || selectedNode.id);
    }
    return parts.join(' -> ');
  }, [selectedNode, baseModel]);

  const directedContext = useMemo(() => {
    if (!selectedNode?.id) return { upstream: new Set(), downstream: new Set(), hops: new Map() };
    return computeDirectedContext(baseModel, selectedNode.id, 4);
  }, [selectedNode, baseModel]);

  const inspectorStatus = normalizeRuntimeStatus(
    selectedLive?.status
    || selectedState?.status
    || selectedState?.state
    || selectedNode?.state
    || selectedNode?.attributes?.status
    || 'ACTIVE'
  );

  const aiInsight = useMemo(() => {
    if (!selectedNode) return null;
    const downstreamCount = directedContext.downstream.size;
    const upstreamCount = directedContext.upstream.size;
    const alertCount = selectedAlerts.length;
    const riskScore = Math.max(
      5,
      Math.min(
        99,
        Math.round(
          (statusRank(inspectorStatus) * 18)
          + (alertCount * 5)
          + (downstreamCount * 1.2)
        )
      )
    );

    const probableRootCause = selectedNode.id === rootCauseEntityId
      ? `${selectedNode.displayName || selectedNode.id} is the highest-likelihood root cause based on severity and downstream impact.`
      : `${selectedNode.displayName || selectedNode.id} is likely impacted by upstream dependencies.`;

    let suggestedAction = 'Monitor and verify downstream node stability.';
    if (inspectorStatus === 'FAILED') {
      suggestedAction = 'Isolate this node, apply remediation, and watch dependent racks/devices.';
    } else if (inspectorStatus === 'DEGRADED' || alertCount > 0) {
      suggestedAction = 'Run targeted diagnostics and preemptive remediation on immediate neighbors.';
    }

    return {
      probableRootCause,
      suggestedAction,
      riskScore,
      upstreamCount,
      downstreamCount,
    };
  }, [selectedNode, directedContext, selectedAlerts, inspectorStatus, rootCauseEntityId]);

  const stats = useMemo(() => {
    const nodes = model?.nodes?.length || 0;
    const edges = model?.edges?.length || 0;
    const racks = (model?.nodes || []).filter((node) => node.type === 'rack').length;
    const devices = (model?.nodes || []).filter((node) => node.type === 'device').length;
    return { nodes, edges, racks, devices };
  }, [model]);

  const viewTitle = useMemo(() => {
    if (viewMode === 'graph') return 'Graph View (Dependency Debugger)';
    if (viewMode === 'rack') return 'Rack View (Physical Layout)';
    return 'Radial View (Hierarchy Overview)';
  }, [viewMode]);

  const performanceMode = stats.nodes > 500;
  const showInspectorModal = Boolean(activeInspectorEntityId);

  return (
    <div className="page-content topology-workspace-page">
      <TopologyFilters
        filters={filters}
        selectedEntityId={selectedEntityId}
        entityInputValue={entityInputValue}
        onEntityInputChange={onEntityInputChange}
        onEntityInputCommit={onEntityInputCommit}
        onFilterChange={onFilterChange}
        activeView={viewMode}
        onViewChange={setViewMode}
        focusMode={focusMode}
        onToggleFocusMode={() => {
          setFocusMode((value) => {
            const next = !value;
            if (!next) setInspectorEntityId('');
            return next;
          });
        }}
        blastMode={blastMode}
        onToggleBlastMode={() => {
          if (!selectedEntityId) return;
          setBlastMode((value) => !value);
        }}
        pathMode={pathMode}
        onTogglePathMode={() => {
          setPathMode((value) => {
            const next = !value;
            if (!next) {
              setPathStartId('');
              setPathEndId('');
            }
            return next;
          });
        }}
        onClearPathMode={() => {
          setPathStartId('');
          setPathEndId('');
        }}
        heatmapMode={heatmapMode}
        onToggleHeatmapMode={() => setHeatmapMode((value) => !value)}
        propagationMode={propagationMode}
        onTogglePropagationMode={() => setPropagationMode((value) => !value)}
        onAutoDetectRootCause={onAutoDetectRootCause}
        layerToggles={layerToggles}
        onToggleLayer={onToggleLayer}
        onReset={onReset}
        onClearFilters={onClearFilters}
        onReload={() => setReloadVersion((value) => value + 1)}
        onBack={() => navigate('/war-room')}
        loading={loading}
      />

      {error && <div className="topology-error-banner">{error}</div>}
      {!filters.workspace_id && <div className="topology-empty-banner">Provide workspace_id to load topology.</div>}

      <section className="topology-workspace-canvas">
        <div className="topology-workspace-meta floating">
          <span>{viewTitle}</span>
          <span>Nodes: {stats.nodes}</span>
          <span>Edges: {stats.edges}</span>
          <span>Racks: {stats.racks}</span>
          <span>Devices: {stats.devices}</span>
          <span>Focus: {focusMode ? 'ON' : 'OFF'}</span>
          <span>Blast: {blastMode ? 'ON' : 'OFF'}</span>
          <span>Path: {pathMode ? `${pathStartId || '?'} -> ${pathEndId || '?'}` : 'OFF'}</span>
          <span>Root Cause: {rootCauseEntityId || 'auto-pending'}</span>
          <span>Selected: {selectedEntityId || 'none'}</span>
          <span>Live: {liveUpdatedAt ? `updated ${new Date(liveUpdatedAt).toLocaleTimeString()}` : 'waiting'}</span>
        </div>
        <TopologyLegend className="topology-legend-floating" />
        {!loading && !error && stats.nodes === 0 && (
          <div className="topology-empty-overlay">
            No topology nodes are visible. Verify workspace, filters, and data feed.
          </div>
        )}

        {viewMode === 'radial' && (
          <TopologyRadialPage
            key={`radial-${resetToken}`}
            model={model}
            selectedEntityId={selectedEntityId}
            onEntitySelect={onNodeSelect}
            onEntityInspect={onNodeInspect}
            onBackgroundSelect={clearSelection}
            entityLiveMap={entityLiveMap}
            alertsByEntity={alertsByEntity}
            blastMode={blastMode}
            blastData={blastData}
            rootCauseEntityId={rootCauseEntityId}
            focusMode={focusMode}
            dependencyChainSet={dependencyChainSet}
            pathMode={pathMode}
            pathNodeSet={pathData.nodeSet}
            pathEdgeSet={pathData.edgeSet}
            layerToggles={layerToggles}
            heatmapMode={heatmapMode}
            entityMetricsMap={entityLiveMap}
            initialTransform={viewTransforms.radial}
            onTransformChange={onRadialTransformChange}
            performanceMode={performanceMode}
          />
        )}

        {viewMode === 'graph' && (
          <TopologyGraphPage
            key={`graph-${resetToken}`}
            model={baseModel}
            selectedEntityId={selectedEntityId}
            onEntitySelect={onNodeSelect}
            onEntityInspect={onNodeInspect}
            onBackgroundSelect={clearSelection}
            entityLiveMap={entityLiveMap}
            alertsByEntity={alertsByEntity}
            blastMode={blastMode}
            blastData={blastData}
            rootCauseEntityId={rootCauseEntityId}
            focusMode={focusMode}
            dependencyChainSet={dependencyChainSet}
            pathMode={pathMode}
            pathNodeSet={pathData.nodeSet}
            pathEdgeSet={pathData.edgeSet}
            layerToggles={layerToggles}
            heatmapMode={heatmapMode}
            propagationMode={propagationMode}
            initialTransform={viewTransforms.graph}
            onTransformChange={onGraphTransformChange}
            performanceMode={performanceMode}
            facilityFilter={filters.facility_id}
            severityFilter={filters.severity}
          />
        )}

        {viewMode === 'rack' && (
          <TopologyRackPage
            key={`rack-${resetToken}`}
            model={model}
            selectedEntityId={selectedEntityId}
            onEntitySelect={onNodeSelect}
            onEntityInspect={onNodeInspect}
            entityLiveMap={entityLiveMap}
            alertsByEntity={alertsByEntity}
            performanceMode={performanceMode}
          />
        )}
      </section>

      {showInspectorModal && (
        <div className="topology-inspector-modal-backdrop" onClick={closeInspector}>
          <div className="topology-inspector-modal" onClick={(event) => event.stopPropagation()}>
            <div className="topology-inspector-modal-header">
              <h3>Entity Inspector</h3>
              <button type="button" onClick={closeInspector}>Close</button>
            </div>

            <div className="topology-inspector-section">
              <h4>Basic Info</h4>
              <div className="topology-side-row"><span>entity_id</span><strong>{activeInspectorEntityId || 'none'}</strong></div>
              <div className="topology-side-row"><span>type</span><strong>{selectedNode?.type === 'device' ? `device (${selectedDeviceKind})` : (selectedNode?.type || 'n/a')}</strong></div>
              <div className="topology-side-row"><span>state</span><strong className={`state-chip ${inspectorStatus.toLowerCase()}`}>{inspectorStatus}</strong></div>
              <div className="topology-side-row"><span>health</span><strong>{asText(selectedLive?.healthScore ?? selectedState?.health_score)}</strong></div>
              <div className="topology-side-row"><span>risk</span><strong>{asText(selectedLive?.riskScore ?? selectedState?.risk_score)}</strong></div>
            </div>

            <div className="topology-inspector-section">
              <h4>Metrics (Live)</h4>
              <div className="topology-side-row"><span>temperature</span><strong>{asText(selectedMetrics.temperature)}</strong></div>
              <div className="topology-side-row"><span>power</span><strong>{asText(selectedMetrics.power)}</strong></div>
              <div className="topology-side-row"><span>network</span><strong>{asText(selectedMetrics.network)}</strong></div>
              <div className="topology-side-row"><span>metric</span><strong>{asText(selectedLive?.metricName)}</strong></div>
            </div>

            {selectedNode?.type === 'device' && (
              <div className="topology-inspector-section">
                <h4>Device Details</h4>
                <div className="topology-side-row"><span>type</span><strong>{selectedDeviceKind}</strong></div>
                <div className="topology-side-row"><span>device id</span><strong>{selectedNode?.id || 'n/a'}</strong></div>
                <div className="topology-side-row"><span>temperature</span><strong>{asText(selectedMetrics.temperature)}</strong></div>
                <div className="topology-side-row"><span>power</span><strong>{asText(selectedMetrics.power)}</strong></div>
                <div className="topology-side-row"><span>alerts</span><strong>{selectedAlerts.length}</strong></div>
                <div className="topology-side-row"><span>last action</span><strong>{asText(selectedLastAction?.action || 'none')}</strong></div>
              </div>
            )}

            {selectedNode?.type === 'facility' && facilitySummary && (
              <div className="topology-inspector-section">
                <h4>Facility Summary</h4>
                <div className="topology-side-row"><span>total racks</span><strong>{facilitySummary.totalRacks}</strong></div>
                <div className="topology-side-row"><span>total alerts</span><strong>{facilitySummary.totalAlerts}</strong></div>
                <div className="topology-side-row"><span>health %</span><strong>{facilitySummary.healthPercent}%</strong></div>
              </div>
            )}

            {selectedNode?.type === 'rack' && rackSummary && (
              <div className="topology-inspector-section">
                <h4>Rack Summary</h4>
                <div className="topology-side-row"><span>devices</span><strong>{rackSummary.devices.length}</strong></div>
                <div className="topology-side-row"><span>avg temp</span><strong>{Number(rackSummary.avgTemp || 0).toFixed(1)} C</strong></div>
                <div className="topology-side-row"><span>power usage</span><strong>{Number(rackSummary.totalPower || 0).toFixed(2)} kW</strong></div>
                <div className="topology-side-row"><span>alert summary</span><strong>{rackSummary.alertCount}</strong></div>
              </div>
            )}

            <div className="topology-inspector-section">
              <h4>Alerts</h4>
              {selectedAlerts.length === 0 && <div className="topology-side-empty">No active alerts</div>}
              {selectedAlerts.slice(0, 8).map((alert) => (
                <div key={alert.id} className="inspector-list-item">
                  <div className="inspector-list-top">
                    <span className={`severity-chip ${String(alert.severity).toLowerCase()}`}>{alert.severity}</span>
                    <span>{formatTime(alert.timestamp)}</span>
                  </div>
                  <div>{alert.description}</div>
                </div>
              ))}
            </div>

            <div className="topology-inspector-section">
              <h4>Recent Actions</h4>
              {selectedActions.length === 0 && <div className="topology-side-empty">No remediation actions</div>}
              {selectedActions.slice(0, 8).map((action, index) => (
                <div key={`${action.action}-${action.timestamp || index}`} className="inspector-list-item">
                  <div className="inspector-list-top">
                    <span>{action.action}</span>
                    <span>{formatTime(action.timestamp)}</span>
                  </div>
                  <div>{asText(action.status)}</div>
                </div>
              ))}
            </div>

            <div className="topology-inspector-section">
              <h4>Reasoning</h4>
              <div className="topology-side-row"><span>root cause</span><strong>{asText(selectedState?.root_cause || selectedState?.reason || 'Awaiting correlation')}</strong></div>
              <div className="topology-side-row"><span>impact hops</span><strong>{blastData?.levels?.get(activeInspectorEntityId) ?? 0}</strong></div>
              <div className="topology-side-row"><span>upstream deps</span><strong>{directedContext.upstream.size}</strong></div>
              <div className="topology-side-row"><span>downstream impact</span><strong>{directedContext.downstream.size}</strong></div>
              <div className="topology-side-row"><span>breadcrumb</span><strong>{breadcrumb || 'n/a'}</strong></div>
            </div>

            {aiInsight && (
              <div className="topology-inspector-section">
                <h4>AI Insight</h4>
                <div className="topology-side-row"><span>risk score</span><strong>{aiInsight.riskScore}</strong></div>
                <div className="inspector-list-item">{aiInsight.probableRootCause}</div>
                <div className="inspector-list-item">{aiInsight.suggestedAction}</div>
              </div>
            )}

            {pathMode && (
              <div className="topology-inspector-section">
                <h4>Path Mode</h4>
                <div className="topology-side-row"><span>source</span><strong>{pathStartId || 'select node A'}</strong></div>
                <div className="topology-side-row"><span>target</span><strong>{pathEndId || 'select node B'}</strong></div>
                <div className="topology-side-row"><span>hops</span><strong>{Math.max(0, (pathData.path?.length || 0) - 1)}</strong></div>
              </div>
            )}

            {rootCauseEntityId && (
              <div className="topology-inspector-section">
                <h4>Root Cause</h4>
                <div className="topology-side-row"><span>auto-detected</span><strong>{rootCauseEntityId}</strong></div>
              </div>
            )}

            {selectedNode?.type === 'rack' && (
              <div className="topology-inspector-section">
                <h4>Rack Devices</h4>
                {rackDeviceDetails.length === 0 && <div className="topology-side-empty">No devices found in this rack</div>}
                {rackDeviceDetails.map((device) => (
                  <div key={device.id} className="inspector-list-item">
                    <div className="inspector-list-top">
                      <span>{device.displayName}</span>
                      <span className={`state-chip ${String(device.status).toLowerCase()}`}>{device.status}</span>
                    </div>
                    <div>ID: {device.id}</div>
                    <div>Type: {device.deviceType}</div>
                    <div>Temp: {formatMetric(device.temperature, 1, ' C')}</div>
                    <div>Power: {formatMetric(device.power, 2, ' kW')}</div>
                    <div>Network: {formatMetric(device.network, 2)}</div>
                    <div>Alerts: {device.alerts.length}</div>
                    <div>Alert Levels: {device.alertSummary}</div>
                    <div>Last Action: {device.lastAction}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
