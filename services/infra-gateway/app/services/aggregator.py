import httpx
import asyncio
from datetime import datetime
from typing import Dict, Any, List, Optional
from urllib.parse import urlencode

class DataAggregator:
    def __init__(self, proxy_client: httpx.AsyncClient):
        self.client = proxy_client

    async def get_dashboard_summary(self, headers: Dict[str, str]) -> Dict[str, Any]:
        """
        Composite endpoint to aggregate data from multiple services.
        """
        # Parallel sub-requests with correct canonical paths
        tasks = [
            self._fetch("http://infra-facility:8006/api/v1/facilities", headers, method="GET"),
            self._fetch("http://infra-rack:8007/api/v1/racks", headers, method="GET"),
            self._fetch("http://infra-metrics-stream:8011/metrics/summary", headers, method="GET"),
            self._fetch("http://infra-alert-engine:8012/engine/status", headers, method="GET"),
            self._fetch("http://infra-runtime:8013/api/v1/state/snapshot", headers, method="POST")
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        return {
            "facilities": results[0] if isinstance(results[0], list) else [],
            "racks": results[1] if isinstance(results[1], list) else [],
            "metrics": results[2] if isinstance(results[2], dict) else {},
            "alert_status": results[3] if isinstance(results[3], dict) else {},
            "runtime_snapshot": results[4] if isinstance(results[4], dict) else {}
        }

    async def get_timeline(
        self,
        *,
        headers: Dict[str, str],
        workspace_id: str,
        facility_id: Optional[str] = None,
        entity_id: Optional[str] = None,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        alert_qs = {"workspace_id": workspace_id, "limit": limit}
        if entity_id:
            alert_qs["entity_id"] = entity_id

        runtime_qs = {"workspace_id": workspace_id, "limit": limit}
        if entity_id:
            runtime_qs["entity_id"] = entity_id

        state_qs = {"workspace_id": workspace_id, "limit": min(max(limit, 100), 1000)}
        if entity_id:
            state_qs["entity_id"] = entity_id

        alerts_url = f"http://infra-alert-engine:8012/api/v1/alerts?{urlencode(alert_qs)}"
        actions_url = f"http://infra-runtime:8013/api/v1/remediation/actions?{urlencode(runtime_qs)}"
        verifications_url = f"http://infra-runtime:8013/api/v1/remediation/verifications?{urlencode(runtime_qs)}"
        states_url = f"http://infra-runtime:8013/api/v1/state?{urlencode(state_qs)}"
        topology_url = f"http://infra-topology:8015/api/v1/topology/{workspace_id}"

        alerts_raw, actions_raw, verifications_raw, states_raw, topology_raw = await asyncio.gather(
            self._fetch(alerts_url, headers, method="GET"),
            self._fetch(actions_url, headers, method="GET"),
            self._fetch(verifications_url, headers, method="GET"),
            self._fetch(states_url, headers, method="GET"),
            self._fetch(topology_url, headers, method="GET"),
            return_exceptions=True,
        )

        alerts = alerts_raw if isinstance(alerts_raw, list) else []
        actions = actions_raw if isinstance(actions_raw, list) else []
        verifications = verifications_raw if isinstance(verifications_raw, list) else []
        states = states_raw if isinstance(states_raw, list) else []
        topology = topology_raw if isinstance(topology_raw, dict) else {"nodes": [], "edges": []}
        topology_edges = topology.get("edges") if isinstance(topology.get("edges"), list) else []

        if facility_id:
            alerts = [a for a in alerts if str(a.get("facility_id", "")) == str(facility_id)]

        actions_by_alert: Dict[str, Dict[str, Any]] = {}
        actions_by_entity_rule: Dict[str, Dict[str, Any]] = {}
        for item in sorted(actions, key=lambda x: self._timestamp(x.get("timestamp")), reverse=True):
            alert_id = item.get("alert_id")
            entity_key = self._entity_rule_key(item.get("entity_id"), item.get("rule_id"))
            if alert_id and alert_id not in actions_by_alert:
                actions_by_alert[alert_id] = item
            if entity_key and entity_key not in actions_by_entity_rule:
                actions_by_entity_rule[entity_key] = item

        verifications_by_alert: Dict[str, Dict[str, Any]] = {}
        verifications_by_entity_rule: Dict[str, Dict[str, Any]] = {}
        for item in sorted(verifications, key=lambda x: self._timestamp(x.get("timestamp")), reverse=True):
            alert_id = item.get("alert_id")
            entity_key = self._entity_rule_key(item.get("entity_id"), item.get("rule_id"))
            if alert_id and alert_id not in verifications_by_alert:
                verifications_by_alert[alert_id] = item
            if entity_key and entity_key not in verifications_by_entity_rule:
                verifications_by_entity_rule[entity_key] = item

        state_by_entity: Dict[str, Dict[str, Any]] = {}
        for state in states:
            entity = str(state.get("id") or "")
            if entity:
                state_by_entity[entity] = state

        adjacency: Dict[str, set[str]] = {}
        for edge in topology_edges:
            source = str(edge.get("from_id") or "")
            target = str(edge.get("to_id") or "")
            if not source or not target:
                continue
            adjacency.setdefault(source, set()).add(target)
            adjacency.setdefault(target, set()).add(source)

        timeline: List[Dict[str, Any]] = []
        for alert in alerts:
            alert_id = str(alert.get("id") or alert.get("alert_id") or "")
            entity = str(alert.get("entity_id") or "")
            rule_id = str(alert.get("rule_id") or "")
            entity_key = self._entity_rule_key(entity, rule_id)

            action = actions_by_alert.get(alert_id) if alert_id else None
            if not action and entity_key:
                action = actions_by_entity_rule.get(entity_key)

            verification = verifications_by_alert.get(alert_id) if alert_id else None
            if not verification and entity_key:
                verification = verifications_by_entity_rule.get(entity_key)

            verification_result = "PENDING"
            if verification:
                verification_result = "SUCCESS" if bool(verification.get("success")) else "FAILED"

            resolved = str(alert.get("status", "")).upper() == "RESOLVED"
            if not resolved and verification_result == "SUCCESS":
                resolved = True

            action_details = action.get("details") if isinstance(action, dict) else {}
            action_details = action_details if isinstance(action_details, dict) else {}
            verification_details = verification.get("details") if isinstance(verification, dict) else {}
            verification_details = verification_details if isinstance(verification_details, dict) else {}

            metric_time = self._timestamp(alert.get("timestamp"))
            alert_time = self._timestamp(alert.get("created_at")) or metric_time
            queue_time = self._timestamp(alert.get("queue_time")) or alert_time
            runtime_start = self._timestamp(action_details.get("runtime_start")) or self._timestamp((action or {}).get("timestamp"))
            runtime_end = self._timestamp(action_details.get("runtime_end")) or self._timestamp((verification or {}).get("timestamp"))
            verification_time = self._timestamp((verification or {}).get("timestamp"))
            resolved_time = self._timestamp(alert.get("updated_at")) if resolved else 0.0

            threshold = self._safe_number(alert.get("threshold"))
            actual_value = self._safe_number(alert.get("metric_value"))
            deviation_pct = self._safe_number(alert.get("deviation_pct"))
            if deviation_pct is None and threshold not in (None, 0.0) and actual_value is not None:
                deviation_pct = ((actual_value - threshold) / threshold) * 100.0

            retry_count = int(action_details.get("retry_count", 0) or 0)
            last_retry_result = action_details.get("last_retry_result")

            runtime_status = "IN_PROGRESS"
            if resolved:
                runtime_status = "RESOLVED"
            elif verification_result == "FAILED":
                runtime_status = "FAILED_REMEDIATION"

            severity = str(alert.get("severity") or "WARNING").upper()
            state_snapshot = state_by_entity.get(entity) or {}
            health_score = self._safe_number(state_snapshot.get("health_score")) or 1.0
            neighbor_count = len(adjacency.get(entity, set()))
            independent_paths = neighbor_count
            single_point_of_failure = independent_paths <= 1
            base_risk = 20.0 if severity == "CRITICAL" else 10.0
            load_factor = min(abs(actual_value or 0.0), 100.0) * 0.15
            thermal_factor = min(abs(deviation_pct or 0.0), 100.0) * 0.2
            health_factor = (1.0 - max(0.0, min(1.0, health_score))) * 30.0
            redundancy_factor = 20.0 if single_point_of_failure else 0.0
            remediation_factor = 25.0 if runtime_status == "FAILED_REMEDIATION" else 0.0
            risk_score = min(100.0, base_risk + load_factor + thermal_factor + health_factor + redundancy_factor + remediation_factor)

            timeline.append(
                {
                    "trace_id": alert.get("trace_id") or f"trace-{alert_id}",
                    "entity_id": entity,
                    "entity_type": alert.get("entity_type"),
                    "workspace_id": alert.get("workspace_id"),
                    "facility_id": alert.get("facility_id"),
                    "timestamp": alert.get("timestamp"),
                    "metric_name": alert.get("metric_name"),
                    "metric_value": alert.get("metric_value"),
                    "status": runtime_status,
                    "timestamps": {
                        "metric_time": metric_time or None,
                        "alert_time": alert_time or None,
                        "queue_time": queue_time or None,
                        "runtime_start": runtime_start or None,
                        "runtime_end": runtime_end or None,
                        "verification_time": verification_time or None,
                        "resolved_time": resolved_time or None,
                    },
                    "latency_breakdown": {
                        "alert_delay": self._duration(alert_time, metric_time),
                        "queue_delay": self._duration(queue_time, alert_time),
                        "runtime_duration": self._duration(runtime_end, runtime_start),
                        "verification_duration": self._safe_number(verification_details.get("wait_s")) or self._duration(verification_time, runtime_end),
                    },
                    "root_cause": {
                        "threshold": threshold,
                        "actual_value": actual_value,
                        "deviation_pct": deviation_pct,
                        "operator": alert.get("operator"),
                    },
                    "alert": {
                        "id": alert_id or None,
                        "rule_id": alert.get("rule_id"),
                        "severity": alert.get("severity"),
                        "status": alert.get("status"),
                        "description": alert.get("description"),
                    },
                    "queue": {
                        "status": "ENQUEUED",
                        "exchange": "infra.alerts",
                    },
                    "runtime": {
                        "action": action.get("action_type") if action else None,
                        "action_status": action.get("status") if action else "PENDING",
                        "verification": verification_result,
                        "verification_result": verification_result,
                        "resolved": resolved,
                        "decision": {
                            "policy_selected": action_details.get("policy_selected") or (action.get("action_type") if action else None),
                            "reason": action_details.get("policy_reason"),
                            "fallback_policy": action_details.get("fallback_policy") or action_details.get("secondary_action"),
                        },
                        "verification_detail": {
                            "before_value": action_details.get("before_value") or verification_details.get("before_value"),
                            "after_value": action_details.get("after_value") or verification_details.get("after_value"),
                            "expected_threshold": action_details.get("expected_threshold") or verification_details.get("expected_threshold"),
                            "result": action_details.get("verification_result") or verification_details.get("result") or verification_result,
                        },
                        "retry": {
                            "retry_count": retry_count,
                            "last_retry_result": last_retry_result,
                        },
                    },
                    "state": {
                        "operational_status": (state_by_entity.get(entity) or {}).get("operational_status"),
                        "health_score": (state_by_entity.get(entity) or {}).get("health_score"),
                        "sub_states": (state_by_entity.get(entity) or {}).get("sub_states") or {},
                        "last_reason": (state_by_entity.get(entity) or {}).get("last_reason"),
                    },
                    "topology_intelligence": {
                        "neighbor_count": neighbor_count,
                        "independent_paths": independent_paths,
                        "single_point_of_failure": single_point_of_failure,
                        "risk_score": round(risk_score, 2),
                    },
                    "stage_progress": {
                        "metric": True,
                        "alert": True,
                        "queue": True,
                        "runtime": bool(action),
                        "verify": verification is not None,
                        "resolved": resolved,
                    },
                    "raw": {
                        "alert_json": alert,
                        "kafka_event": alert.get("raw_metric_event") or {},
                        "runtime_decision": action or {},
                        "verification": verification or {},
                    },
                }
            )

        timeline.sort(key=lambda item: self._timestamp(item.get("timestamp")), reverse=True)
        return timeline[:limit]

    async def _fetch(self, url: str, headers: Dict[str, str], method: str = "GET") -> Any:
        try:
            if method == "POST":
                resp = await self.client.post(url, headers=headers)
            else:
                resp = await self.client.get(url, headers=headers)
                
            if resp.status_code in [200, 201]:
                return resp.json()
            return None
        except Exception:
            return None

    @staticmethod
    def _entity_rule_key(entity_id: Any, rule_id: Any) -> str:
        if not entity_id or not rule_id:
            return ""
        return f"{entity_id}::{rule_id}"

    @staticmethod
    def _timestamp(value: Any) -> float:
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            try:
                return float(value)
            except ValueError:
                try:
                    return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
                except ValueError:
                    return 0.0
        return 0.0

    @staticmethod
    def _duration(end_value: Optional[float], start_value: Optional[float]) -> Optional[float]:
        if end_value is None or start_value is None:
            return None
        if end_value == 0.0 or start_value == 0.0:
            return None
        return max(0.0, float(end_value) - float(start_value))

    @staticmethod
    def _safe_number(value: Any) -> Optional[float]:
        if value is None:
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None
