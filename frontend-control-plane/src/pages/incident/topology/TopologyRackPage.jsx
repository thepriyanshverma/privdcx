import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { normalizeRuntimeStatus, statusRank } from './topologyModel';

function sortById(a, b) {
  return String(a).localeCompare(String(b));
}

function deviceStateClass(status) {
  const normalized = normalizeRuntimeStatus(status);
  if (normalized === 'FAILED') return 'failed';
  if (normalized === 'DEGRADED' || normalized === 'AT_RISK') return 'warning';
  return 'ok';
}

function highestAlertSeverity(alerts) {
  if (!Array.isArray(alerts) || alerts.length === 0) return '';
  const hasCritical = alerts.some((alert) => String(alert?.severity || '').toUpperCase().includes('CRITICAL'));
  return hasCritical ? 'critical' : 'warning';
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

function resolveDeviceKind(node, live = {}) {
  const kind = String(
    live?.deviceType
    || node?.attributes?.device_type
    || node?.attributes?.deviceType
    || node?.rawType
    || node?.type
    || 'device'
  ).trim().toLowerCase();
  return !kind || kind === 'device' ? 'device' : kind;
}

function formatMetric(value, decimals = 1, unit = '') {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'n/a';
  return `${numeric.toFixed(decimals)}${unit}`;
}

function rackMetrics(model, rackId, entityLiveMap, alertsByEntity) {
  const rackNode = model.nodeById.get(rackId);
  const rackLive = entityLiveMap?.[rackId] || {};
  const rackAlerts = alertsByEntity?.[rackId] || [];
  let rackStatus = normalizeRuntimeStatus(rackLive.status || rackNode?.attributes?.status || 'ACTIVE');
  const deviceIds = (model.devicesByRack.get(rackId) || []).slice().sort(sortById);
  const devices = deviceIds
    .map((id) => {
      const node = model.nodeById.get(id);
      if (!node) return null;
      const live = entityLiveMap?.[id] || {};
      const alerts = alertsByEntity?.[id] || [];
      const status = normalizeRuntimeStatus(live.status || node.attributes?.status || 'ACTIVE');
      return {
        ...node,
        status,
        deviceType: resolveDeviceKind(node, live),
        temperature: firstNumber(
          live.temperature,
          node.metrics?.temperature,
          node.attributes?.temp_c,
          node.attributes?.temperature
        ),
        power: firstNumber(
          live.power,
          node.metrics?.power,
          node.attributes?.default_power_kw,
          node.attributes?.power_kw,
          node.attributes?.powerKw
        ),
        alerts,
        alertCount: alerts.length,
        alertLevel: highestAlertSeverity(alerts),
      };
    })
    .filter(Boolean);

  devices.forEach((device) => {
    if (statusRank(device.status) > statusRank(rackStatus)) rackStatus = device.status;
  });

  const powerKw = devices.reduce((sum, node) => sum + Number(node.power || 0), 0);

  const tempValues = devices
    .map((node) => Number(node.temperature || 0))
    .filter((value) => Number.isFinite(value) && value > 0);

  const avgTemp = tempValues.length > 0
    ? tempValues.reduce((sum, value) => sum + value, 0) / tempValues.length
    : Number(rackNode?.attributes?.temp_c || rackNode?.attributes?.temperature || 0);

  const hasPowerRisk = powerKw > 20;
  const hasThermalRisk = avgTemp > 40;
  const infra = (model.infraByRack.get(rackId) || [])
    .slice()
    .sort(sortById)
    .map((id) => {
      const node = model.nodeById.get(id);
      const live = entityLiveMap?.[id] || {};
      const alerts = alertsByEntity?.[id] || [];
      const status = normalizeRuntimeStatus(live.status || node?.attributes?.status || 'ACTIVE');
      if (statusRank(status) > statusRank(rackStatus)) rackStatus = status;
      return {
        id,
        displayName: node?.displayName || id,
        status,
        alerts,
      };
    });

  if (highestAlertSeverity(rackAlerts) === 'critical' && statusRank(rackStatus) < statusRank('FAILED')) {
    rackStatus = 'FAILED';
  } else if (rackAlerts.length > 0 && statusRank(rackStatus) < statusRank('DEGRADED')) {
    rackStatus = 'DEGRADED';
  }

  const alertCount = rackAlerts.length
    + devices.reduce((sum, device) => sum + Number(device.alertCount || 0), 0)
    + infra.reduce((sum, item) => sum + Number(item.alerts?.length || 0), 0);

  return {
    rackNode,
    devices,
    rackStatus,
    powerKw,
    avgTemp,
    hasPowerRisk,
    hasThermalRisk,
    infra,
    rackAlerts,
    alertCount,
  };
}

function buildHallRows(model) {
  const halls = model.nodes
    .filter((node) => node.type === 'hall')
    .map((node) => node.id)
    .sort(sortById);

  const rows = halls.map((hallId) => ({
    hallId,
    hallNode: model.nodeById.get(hallId),
    rackIds: (model.racksByHall.get(hallId) || []).slice().sort(sortById),
  }));

  const assignedRacks = new Set(rows.flatMap((row) => row.rackIds));
  const unassigned = model.nodes
    .filter((node) => node.type === 'rack' && !assignedRacks.has(node.id))
    .map((node) => node.id)
    .sort(sortById);

  if (unassigned.length > 0) {
    rows.push({
      hallId: '__unassigned__',
      hallNode: { displayName: 'UNASSIGNED HALL', id: '__unassigned__' },
      rackIds: unassigned,
    });
  }

  if (rows.length === 0) {
    rows.push({
      hallId: '__fallback__',
      hallNode: { displayName: 'RACKS', id: '__fallback__' },
      rackIds: model.nodes.filter((node) => node.type === 'rack').map((node) => node.id).sort(sortById),
    });
  }

  return rows;
}

function powerBarClass(metrics) {
  if (metrics.hasPowerRisk) return 'critical';
  if (metrics.powerKw >= 14) return 'warning';
  return 'ok';
}

function coolingBarClass(metrics) {
  if (metrics.hasThermalRisk) return 'critical';
  if (metrics.avgTemp >= 34) return 'warning';
  return 'ok';
}

function rackHeatClass(avgTemp) {
  if (avgTemp >= 40) return 'critical';
  if (avgTemp >= 33) return 'warning';
  return 'ok';
}

export default function TopologyRackPage({
  model,
  selectedEntityId,
  onEntitySelect,
  onEntityInspect,
  entityLiveMap,
  alertsByEntity,
}) {
  const [expandedRackId, setExpandedRackId] = useState('');
  const clickDelayRef = useRef(0);

  const hallRows = useMemo(() => buildHallRows(model), [model]);

  const queueSingleClick = useCallback((handler) => {
    if (clickDelayRef.current) {
      window.clearTimeout(clickDelayRef.current);
      clickDelayRef.current = 0;
    }
    clickDelayRef.current = window.setTimeout(() => {
      clickDelayRef.current = 0;
      handler();
    }, 200);
  }, []);

  const queueDoubleClick = useCallback((handler) => {
    if (clickDelayRef.current) {
      window.clearTimeout(clickDelayRef.current);
      clickDelayRef.current = 0;
    }
    handler();
  }, []);

  useEffect(() => () => {
    if (clickDelayRef.current) {
      window.clearTimeout(clickDelayRef.current);
      clickDelayRef.current = 0;
    }
  }, []);

  return (
    <div className="topology-rack-view">
      {hallRows.map((row) => (
        <section key={row.hallId} className="rack-hall-section">
          <header className="rack-hall-header">
            <h3>{row.hallNode?.displayName || row.hallNode?.id || row.hallId}</h3>
            <span>{row.rackIds.length} racks</span>
          </header>
          <div className="rack-grid">
            {row.rackIds.map((rackId) => {
              const metrics = rackMetrics(model, rackId, entityLiveMap, alertsByEntity);
              const isSelected = selectedEntityId === rackId;
              const isExpanded = expandedRackId === rackId;
              const rackName = metrics.rackNode?.displayName || rackId;
              const heatClass = rackHeatClass(metrics.avgTemp);

              return (
                <article
                  key={rackId}
                  className={`rack-card state-${String(metrics.rackStatus || 'ACTIVE').toLowerCase()} heat-${heatClass} ${isSelected ? 'selected' : ''} ${metrics.hasPowerRisk || metrics.hasThermalRisk ? 'risk' : ''}`}
                  onClick={() => {
                    queueSingleClick(() => {
                      onEntitySelect(rackId);
                      setExpandedRackId((current) => (current === rackId ? '' : rackId));
                    });
                  }}
                  onDoubleClick={() => {
                    queueDoubleClick(() => {
                      if (onEntityInspect) onEntityInspect(rackId);
                    });
                  }}
                  title={`Rack ${rackName} | Power ${metrics.powerKw.toFixed(2)} kW | Temp ${Number(metrics.avgTemp || 0).toFixed(1)} C | Alerts ${metrics.alertCount}`}
                >
                  <div className="rack-card-header">
                    <strong>{rackName}</strong>
                    <span>{metrics.devices.length} devices</span>
                  </div>

                  <div className={`rack-summary-strip ${heatClass}`}>
                    <span>{Number(metrics.avgTemp || 0).toFixed(1)} C</span>
                    <span>{metrics.powerKw.toFixed(2)} kW</span>
                    <span>{metrics.alertCount} alerts</span>
                  </div>

                  <div className="rack-shell">
                    <div className={`rack-indicator power ${powerBarClass(metrics)}`} />
                    <div className="rack-units">
                      {(isExpanded ? metrics.devices : metrics.devices.slice(0, 8)).map((device, index) => {
                        const unitHeight = Math.max(4, Math.min(18, Number(device.attributes?.size_u || 1) * 3));
                        return (
                          <button
                            key={device.id}
                            type="button"
                            className={`rack-device-block ${deviceStateClass(device.status)}${device.alertCount > 0 ? ` has-alert alert-${device.alertLevel}` : ''}`}
                            style={{ height: `${unitHeight}px` }}
                            title={`${device.displayName} (${device.id}) | type ${device.deviceType} | status ${device.status} | temp ${formatMetric(device.temperature, 1, 'C')} | power ${formatMetric(device.power, 2, 'kW')} | alerts ${device.alertCount}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              queueSingleClick(() => {
                                onEntitySelect(device.id);
                              });
                            }}
                            onDoubleClick={(event) => {
                              event.stopPropagation();
                              queueDoubleClick(() => {
                                if (onEntityInspect) onEntityInspect(device.id);
                              });
                            }}
                          >
                            {isExpanded
                              ? `${device.displayName} ${formatMetric(device.temperature, 1, 'C')} ${device.deviceType} A:${device.alertCount}`
                              : `U${index + 1}${device.alertCount > 0 ? ' !' : ''}`}
                          </button>
                        );
                      })}
                      {!isExpanded && metrics.devices.length > 8 && (
                        <div className="rack-device-overflow">+{metrics.devices.length - 8} more</div>
                      )}
                    </div>
                    <div className={`rack-indicator cooling ${coolingBarClass(metrics)}`} />
                  </div>

                  <div className="rack-footer">
                    <span>Power: {metrics.powerKw.toFixed(2)} kW</span>
                    <span>Temp: {Number(metrics.avgTemp || 0).toFixed(1)} C</span>
                  </div>

                  {isExpanded && (
                    <div className="rack-infra-summary">
                      <div>Infra:</div>
                      {(metrics.infra || []).length === 0 && <div>none</div>}
                      {(metrics.infra || []).map((item) => (
                        <span key={item.id} className={`state-chip ${String(item.status).toLowerCase()}`}>
                          {item.displayName} {item.status}
                        </span>
                      ))}
                      <div className="rack-alert-lines">
                        {(metrics.devices || [])
                          .filter((device) => device.alertCount > 0)
                          .slice(0, 8)
                          .map((device) => (
                            <div key={`${rackId}-${device.id}-alerts`}>
                              {device.displayName}: {device.alertCount} alerts ({device.alertLevel || 'warning'})
                            </div>
                          ))}
                        {metrics.alertCount === 0 && <div>No active alerts in rack scope.</div>}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}