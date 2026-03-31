import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import useSharedFilters from '../../hooks/useSharedFilters';
import './WarRoomPage.css';

const STAGES = [
  { key: 'metric', label: 'Metric' },
  { key: 'alert', label: 'Alert' },
  { key: 'queue', label: 'Queue' },
  { key: 'runtime', label: 'Runtime' },
  { key: 'verify', label: 'Verify' },
  { key: 'resolved', label: 'Resolved' },
];

function formatTimestamp(value) {
  if (!value) return 'n/a';
  const numeric = Number(value);
  const date = Number.isFinite(numeric) ? new Date(numeric * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return 'n/a';
  return date.toLocaleString();
}

function formatDuration(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'n/a';
  return `${Number(value).toFixed(2)}s`;
}

function asText(value, fallback = 'n/a') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function cloneSnapshot(value) {
  if (value === null || value === undefined) return value;
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      // Fall through to JSON clone.
    }
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function toneForEvent(item) {
  if (String(item.status).toUpperCase() === 'FAILED_REMEDIATION') return 'CRITICAL';
  const sev = String(item?.alert?.severity || '').toUpperCase();
  if (sev === 'CRITICAL') return 'CRITICAL';
  if (sev === 'WARNING') return 'WARNING';
  if (String(item.status).toUpperCase() === 'RESOLVED') return 'RESOLVED';
  return 'IN_PROGRESS';
}

function stageState(stageKey, event) {
  const progress = event.stage_progress || {};
  const done = Boolean(progress[stageKey]);
  if (stageKey === 'resolved' && String(event.status).toUpperCase() === 'FAILED_REMEDIATION') return 'failed';
  return done ? 'done' : 'pending';
}

function summarize(events) {
  const active = events.filter((e) => String(e.status).toUpperCase() !== 'RESOLVED');
  const resolving = active.filter((e) => String(e.status).toUpperCase() === 'IN_PROGRESS');
  const failed = events.filter((e) => String(e.status).toUpperCase() === 'FAILED_REMEDIATION');

  const resolvedDurations = events
    .filter((e) => String(e.status).toUpperCase() === 'RESOLVED')
    .map((e) => Number(e?.latency_breakdown?.runtime_duration || 0) + Number(e?.latency_breakdown?.verification_duration || 0))
    .filter((v) => Number.isFinite(v) && v > 0);

  const avgResolutionTime = resolvedDurations.length
    ? resolvedDurations.reduce((sum, value) => sum + value, 0) / resolvedDurations.length
    : 0;

  const highRiskEntities = new Set(
    events
      .filter((e) => Number(e?.topology_intelligence?.risk_score || 0) >= 70)
      .map((e) => e.entity_id)
      .filter(Boolean)
  );

  return {
    activeIncidents: active.length,
    resolvingIncidents: resolving.length,
    failedRemediations: failed.length,
    avgResolutionTime,
    highRiskEntities: highRiskEntities.size,
  };
}

export default function WarRoomPage() {
  const navigate = useNavigate();
  const { filters, setFilter, setFilters } = useSharedFilters();

  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [focusedCard, setFocusedCard] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(true);
  const [limit, setLimit] = useState(120);

  const fetchTimeline = useCallback(async () => {
    if (!filters.workspace_id) {
      setTimeline([]);
      setLoading(false);
      return;
    }
    try {
      const params = new URLSearchParams({
        workspace_id: filters.workspace_id,
        limit: String(limit),
      });
      if (filters.facility_id) params.set('facility_id', filters.facility_id);
      if (filters.entity_id) params.set('entity_id', filters.entity_id);
      const result = await api.get(`/v1/timeline?${params.toString()}`);
      const normalized = Array.isArray(result) ? result : [];
      const filtered = filters.severity
        ? normalized.filter((item) => String(item?.alert?.severity || '').toUpperCase() === filters.severity)
        : normalized;
      setTimeline(filtered);
      setError('');
      setLastUpdated(Date.now());
    } catch (err) {
      setError(err.message || 'Failed to load timeline');
    } finally {
      setLoading(false);
    }
  }, [filters.workspace_id, filters.facility_id, filters.entity_id, filters.severity, limit]);

  useEffect(() => {
    let active = true;
    let timer = null;
    let inFlight = false;

    const run = async () => {
      if (!active) return;
      if (!isRefreshing) {
        timer = setTimeout(run, 2000);
        return;
      }
      if (inFlight) {
        timer = setTimeout(run, 2000);
        return;
      }
      inFlight = true;
      await fetchTimeline();
      inFlight = false;
      timer = setTimeout(run, 2000);
    };

    run();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [fetchTimeline, isRefreshing]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const item of timeline) {
      const key = item.entity_id || 'unknown-entity';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    }
    return Array.from(map.entries()).map(([entity, events]) => ({
      entity,
      events: [...events].sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0)),
    }));
  }, [timeline]);

  const summary = useMemo(() => summarize(timeline), [timeline]);

  const toggleExpanded = (traceId) => {
    setExpanded((prev) => ({ ...prev, [traceId]: !prev[traceId] }));
  };

  const openCard = (item) => {
    setFocusedCard({ snapshot: cloneSnapshot(item), openedAt: Date.now() });
  };

  const closeCard = () => {
    setFocusedCard(null);
  };

  const openTopology = (entityId) => {
    const params = new URLSearchParams();
    if (filters.workspace_id) params.set('workspace_id', filters.workspace_id);
    if (filters.facility_id) params.set('facility_id', filters.facility_id);
    if (filters.severity) params.set('severity', filters.severity);
    if (entityId) params.set('entity_id', entityId);
    navigate(`/topology?${params.toString()}`);
  };

  const focusedSnapshot = focusedCard?.snapshot || null;
  const focusedRuntime = focusedSnapshot?.runtime || {};
  const focusedRoot = focusedSnapshot?.root_cause || {};
  const focusedTimes = focusedSnapshot?.timestamps || {};
  const focusedLatency = focusedSnapshot?.latency_breakdown || {};
  const focusedVerification = focusedRuntime?.verification_detail || {};
  const focusedDecision = focusedRuntime?.decision || {};
  const focusedRetry = focusedRuntime?.retry || {};

  return (
    <div className="page-content war-room-page">
      <div className="war-room-header">
        <div>
          <h1>War Room Timeline</h1>
          <p className="war-subtitle">
            {'Lifecycle debugger: Metric -> Alert -> Queue -> Runtime -> Verification -> Resolution'}
          </p>
        </div>
        <div className="war-room-live">
          LIVE {isRefreshing ? 'ON' : 'PAUSED'} · {lastUpdated ? `Updated ${new Date(lastUpdated).toLocaleTimeString()}` : 'No updates yet'}
        </div>
      </div>

      <div className="war-summary-bar">
        <div className="war-summary-cell"><span>Active Incidents</span><strong>{summary.activeIncidents}</strong></div>
        <div className="war-summary-cell"><span>Resolving</span><strong>{summary.resolvingIncidents}</strong></div>
        <div className="war-summary-cell"><span>Failed Remediations</span><strong>{summary.failedRemediations}</strong></div>
        <div className="war-summary-cell"><span>Avg Resolution Time</span><strong>{formatDuration(summary.avgResolutionTime)}</strong></div>
        <div className="war-summary-cell"><span>High Risk Entities</span><strong>{summary.highRiskEntities}</strong></div>
      </div>

      <div className="war-room-filters">
        <div className="war-filter">
          <label>Workspace ID</label>
          <input value={filters.workspace_id} onChange={(event) => setFilter('workspace_id', event.target.value)} placeholder="workspace_id" />
        </div>
        <div className="war-filter">
          <label>Facility ID</label>
          <input value={filters.facility_id} onChange={(event) => setFilter('facility_id', event.target.value)} placeholder="optional" />
        </div>
        <div className="war-filter">
          <label>Entity ID</label>
          <input value={filters.entity_id} onChange={(event) => setFilter('entity_id', event.target.value)} placeholder="optional" />
        </div>
        <div className="war-filter war-filter-small">
          <label>Severity</label>
          <select value={filters.severity} onChange={(event) => setFilter('severity', event.target.value)}>
            <option value="">ALL</option>
            <option value="CRITICAL">CRITICAL</option>
            <option value="WARNING">WARNING</option>
          </select>
        </div>
        <div className="war-filter war-filter-small">
          <label>Limit</label>
          <input
            type="number"
            min={20}
            max={500}
            value={limit}
            onChange={(event) => setLimit(Math.max(20, Math.min(500, Number(event.target.value) || 120)))}
          />
        </div>
        <div className="war-filter-actions">
          <button type="button" className="primary" onClick={() => fetchTimeline()}>Refresh</button>
          <button type="button" onClick={() => setIsRefreshing((prev) => !prev)}>{isRefreshing ? 'Pause Live' : 'Resume Live'}</button>
          <button type="button" onClick={() => setFilters({ facility_id: '', entity_id: '', severity: '' })}>Clear Filters</button>
        </div>
      </div>

      {error && <div className="war-room-error">{error}</div>}

      {loading && <div className="war-empty">Loading timeline...</div>}
      {!loading && grouped.length === 0 && <div className="war-empty">No timeline events found for current filters.</div>}

      <div className="war-room-feed">
        {grouped.map((group) => (
          <div key={group.entity} className="war-entity-group">
            <div className="war-entity-head">
              <div>
                <div className="war-entity-title">{group.entity}</div>
                <div className="war-card-subtitle">{group.events.length} events</div>
              </div>
              <button
                type="button"
                className="war-link-btn"
                onClick={(event) => {
                  event.stopPropagation();
                  openTopology(group.entity);
                }}
              >
                Inspect Topology
              </button>
            </div>

            {group.events.map((item) => {
              const traceId = item.trace_id || `${item.entity_id}-${item.timestamp}`;
              const runtime = item.runtime || {};
              const rootCause = item.root_cause || {};
              const timestamps = item.timestamps || {};
              const latency = item.latency_breakdown || {};
              const retry = runtime.retry || {};
              const verificationDetail = runtime.verification_detail || {};
              const decision = runtime.decision || {};
              const tone = toneForEvent(item);

              return (
                <div
                  key={traceId}
                  className="war-card war-card-clickable"
                  id={`entity-${item.entity_id}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => openCard(item)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openCard(item);
                    }
                  }}
                >
                  <div className="war-card-header">
                    <div>
                      <div className="war-card-title">{asText(item.alert?.rule_id, 'Unknown rule')} · {asText(item.metric_name)}</div>
                      <div className="war-card-subtitle">trace_id: {asText(item.trace_id)} · metric: {asText(item.metric_value)}</div>
                    </div>
                    <div className="war-card-tags">
                      <span className={`legend-pill tone-${tone}`}>{asText(item.alert?.severity, 'INFO')}</span>
                      <span className={`legend-pill tone-${String(item.status).toUpperCase() === 'FAILED_REMEDIATION' ? 'CRITICAL' : 'IN_PROGRESS'}`}>{asText(item.status)}</span>
                    </div>
                  </div>

                  <div className="war-stage-bar">
                    {STAGES.map((stage) => (
                      <div key={stage.key} className={`war-stage-pill ${stageState(stage.key, item)}`}>{stage.label}</div>
                    ))}
                  </div>

                  <div className="war-flow">
                    <div className="war-flow-row"><div className="war-step">Timestamps</div><div className="war-step-value">metric={formatTimestamp(timestamps.metric_time)} | alert={formatTimestamp(timestamps.alert_time)} | queue={formatTimestamp(timestamps.queue_time)} | runtime_start={formatTimestamp(timestamps.runtime_start)} | runtime_end={formatTimestamp(timestamps.runtime_end)} | verify={formatTimestamp(timestamps.verification_time)} | resolved={formatTimestamp(timestamps.resolved_time)}</div></div>
                    <div className="war-flow-row"><div className="war-step">Latency</div><div className="war-step-value">alert_delay={formatDuration(latency.alert_delay)} | queue_delay={formatDuration(latency.queue_delay)} | runtime_duration={formatDuration(latency.runtime_duration)} | verification_duration={formatDuration(latency.verification_duration)}</div></div>
                    <div className="war-flow-row"><div className="war-step">Root Cause</div><div className="war-step-value">threshold={asText(rootCause.threshold)} | actual={asText(rootCause.actual_value)} | deviation={asText(rootCause.deviation_pct)}% | operator={asText(rootCause.operator)}</div></div>
                    <div className="war-flow-row"><div className="war-step">Runtime Decision</div><div className="war-step-value">policy={asText(decision.policy_selected)} | reason={asText(decision.reason)} | fallback={asText(decision.fallback_policy)}</div></div>
                    <div className="war-flow-row"><div className="war-step">Verification</div><div className="war-step-value">before={asText(verificationDetail.before_value)} | after={asText(verificationDetail.after_value)} | expected={asText(verificationDetail.expected_threshold)} | result={asText(verificationDetail.result, asText(runtime.verification_result))}</div></div>
                    <div className="war-flow-row"><div className="war-step">Retry</div><div className="war-step-value">retry_count={asText(retry.retry_count, '0')} | last_retry_result={asText(retry.last_retry_result, 'none')}</div></div>
                  </div>

                  <button
                    type="button"
                    className="war-link-btn"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleExpanded(traceId);
                    }}
                  >
                    {expanded[traceId] ? 'Hide Debug JSON' : 'Show Debug JSON'}
                  </button>

                  {expanded[traceId] && (
                    <div className="war-debug-grid">
                      <div><div className="war-debug-title">Alert JSON</div><pre>{JSON.stringify(item.raw?.alert_json || {}, null, 2)}</pre></div>
                      <div><div className="war-debug-title">Kafka Metric Event</div><pre>{JSON.stringify(item.raw?.kafka_event || {}, null, 2)}</pre></div>
                      <div><div className="war-debug-title">Runtime Decision</div><pre>{JSON.stringify(item.raw?.runtime_decision || {}, null, 2)}</pre></div>
                      <div><div className="war-debug-title">Verification</div><pre>{JSON.stringify(item.raw?.verification || {}, null, 2)}</pre></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {focusedSnapshot && (
        <div className="war-modal-backdrop" onClick={closeCard}>
          <div className="war-modal" onClick={(event) => event.stopPropagation()}>
            <div className="war-modal-header">
              <div>
                <div className="war-card-title">{asText(focusedSnapshot.alert?.rule_id, 'Unknown rule')} · {asText(focusedSnapshot.metric_name)}</div>
                <div className="war-card-subtitle">trace_id: {asText(focusedSnapshot.trace_id)} · entity: {asText(focusedSnapshot.entity_id)}</div>
              </div>
              <button type="button" onClick={closeCard}>Close</button>
            </div>

            <div className="war-stage-bar">
              {STAGES.map((stage) => (
                <div key={stage.key} className={`war-stage-pill ${stageState(stage.key, focusedSnapshot)}`}>{stage.label}</div>
              ))}
            </div>

            <div className="war-flow">
              <div className="war-flow-row"><div className="war-step">Timestamps</div><div className="war-step-value">metric={formatTimestamp(focusedTimes.metric_time)} | alert={formatTimestamp(focusedTimes.alert_time)} | queue={formatTimestamp(focusedTimes.queue_time)} | runtime_start={formatTimestamp(focusedTimes.runtime_start)} | runtime_end={formatTimestamp(focusedTimes.runtime_end)} | verify={formatTimestamp(focusedTimes.verification_time)} | resolved={formatTimestamp(focusedTimes.resolved_time)}</div></div>
              <div className="war-flow-row"><div className="war-step">Latency</div><div className="war-step-value">alert_delay={formatDuration(focusedLatency.alert_delay)} | queue_delay={formatDuration(focusedLatency.queue_delay)} | runtime_duration={formatDuration(focusedLatency.runtime_duration)} | verification_duration={formatDuration(focusedLatency.verification_duration)}</div></div>
              <div className="war-flow-row"><div className="war-step">Root Cause</div><div className="war-step-value">threshold={asText(focusedRoot.threshold)} | actual={asText(focusedRoot.actual_value)} | deviation={asText(focusedRoot.deviation_pct)}% | operator={asText(focusedRoot.operator)}</div></div>
              <div className="war-flow-row"><div className="war-step">Runtime Decision</div><div className="war-step-value">policy={asText(focusedDecision.policy_selected)} | reason={asText(focusedDecision.reason)} | fallback={asText(focusedDecision.fallback_policy)}</div></div>
              <div className="war-flow-row"><div className="war-step">Verification</div><div className="war-step-value">before={asText(focusedVerification.before_value)} | after={asText(focusedVerification.after_value)} | expected={asText(focusedVerification.expected_threshold)} | result={asText(focusedVerification.result, asText(focusedRuntime.verification_result))}</div></div>
              <div className="war-flow-row"><div className="war-step">Retry</div><div className="war-step-value">retry_count={asText(focusedRetry.retry_count, '0')} | last_retry_result={asText(focusedRetry.last_retry_result, 'none')}</div></div>
            </div>

            <div className="war-debug-grid">
              <div><div className="war-debug-title">Alert JSON</div><pre>{JSON.stringify(focusedSnapshot.raw?.alert_json || {}, null, 2)}</pre></div>
              <div><div className="war-debug-title">Kafka Metric Event</div><pre>{JSON.stringify(focusedSnapshot.raw?.kafka_event || {}, null, 2)}</pre></div>
              <div><div className="war-debug-title">Runtime Decision</div><pre>{JSON.stringify(focusedSnapshot.raw?.runtime_decision || {}, null, 2)}</pre></div>
              <div><div className="war-debug-title">Verification</div><pre>{JSON.stringify(focusedSnapshot.raw?.verification || {}, null, 2)}</pre></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
