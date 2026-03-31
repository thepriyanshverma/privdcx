import asyncio
import os
import random
from datetime import datetime
from typing import Optional

import structlog
from pydantic import ValidationError

from app.clients.alert_service import AlertServiceClient
from app.clients.metrics_source import MetricsSourceClient
from app.clients.rabbitmq import RabbitMQClient
from app.clients.topology_consumer import TopologyEventConsumer
from app.engines.propagation import PropagationModel
from app.engines.remediation import RemediationEngine
from app.schemas.runtime import (
    IncomingAlert,
    InfraState,
    OperationalStatus,
    RemediationAction,
    StateUpdateEvent,
    VerificationResult,
)
from app.services.state import StateManager


class RuntimeOrchestrator:
    def __init__(self):
        self.rabbitmq = RabbitMQClient()
        self.state_manager = StateManager()
        self.remediation_engine = RemediationEngine()
        self.propagation_model = PropagationModel()
        self.alert_service = AlertServiceClient()
        self.metrics_source = MetricsSourceClient()
        self.topology_consumer = TopologyEventConsumer()
        self.is_paused = False
        self.running = False
        self._consumer_task: asyncio.Task | None = None
        self._topology_task: asyncio.Task | None = None
        self._rng = random.Random()
        self._zone_members: dict[str, set[str]] = {}
        self.verify_wait_min_s = float(os.getenv("RUNTIME_VERIFY_WAIT_MIN_S", "5"))
        self.verify_wait_max_s = float(os.getenv("RUNTIME_VERIFY_WAIT_MAX_S", "10"))
        self.max_verification_retries = int(os.getenv("RUNTIME_MAX_VERIFICATION_RETRIES", "1"))
        self.action_exec_delay_s = float(os.getenv("RUNTIME_ACTION_EXEC_DELAY_S", "0.4"))
        self.logger = structlog.get_logger("infra-runtime.orchestrator")

    async def start(self):
        self.running = True
        await self.state_manager.ensure_indexes()
        await self.rabbitmq.connect()
        await self.topology_consumer.start()
        self._consumer_task = asyncio.create_task(self.rabbitmq.consume_alerts(self._process_alert), name="runtime-alert-consumer")
        self._topology_task = asyncio.create_task(
            self.topology_consumer.consume_loop(self._process_topology_event),
            name="runtime-topology-consumer",
        )

    async def stop(self):
        self.running = False
        if self._consumer_task:
            self._consumer_task.cancel()
            try:
                await self._consumer_task
            except asyncio.CancelledError:
                pass
            self._consumer_task = None
        if self._topology_task:
            self._topology_task.cancel()
            try:
                await self._topology_task
            except asyncio.CancelledError:
                pass
            self._topology_task = None
        await self.rabbitmq.close()
        await self.topology_consumer.stop()
        await self.state_manager.close()
        await self.alert_service.close()
        await self.metrics_source.close()

    async def _process_alert(self, raw_alert: dict):
        if self.is_paused:
            return

        try:
            alert = IncomingAlert.model_validate(raw_alert)
        except ValidationError as exc:
            self.logger.warning("invalid_alert_payload", error=str(exc), payload=raw_alert)
            return

        self.propagation_model.ensure_node(alert.entity_id)
        alert_id = alert.alert_id
        if not alert_id and alert.workspace_id:
            alert_id = await self.alert_service.find_latest_active_alert_id(
                workspace_id=alert.workspace_id,
                entity_id=alert.entity_id,
                rule_id=alert.rule_id,
            )

        # Step 1: acknowledge immediately when possible.
        if alert_id:
            await self.alert_service.acknowledge_alert(alert_id)

        policy = await self.remediation_engine.evaluate_remediation(alert)
        if not policy:
            self.logger.info("no_remediation_policy", rule_id=alert.rule_id, entity_id=alert.entity_id)
            return

        action_record = RemediationAction(
            tenant_id=alert.tenant_id,
            workspace_id=alert.workspace_id,
            alert_id=alert_id,
            entity_id=alert.entity_id,
            entity_type=alert.entity_type,
            rule_id=alert.rule_id,
            action_type=policy["action"],
            status="PENDING",
            details={
                "step": "INITIAL_ACTION",
                "trace_id": alert.trace_id,
                "metric_time": float(alert.timestamp),
                "alert_time": float(alert.timestamp),
                "queue_time": float(alert.queue_time or alert.timestamp),
                "policy_selected": policy["action"],
                "policy_reason": policy.get("reason"),
                "fallback_policy": policy.get("fallback_policy"),
                "retry_count": 0,
                "last_retry_result": None,
            },
        )

        entity_state = await self._get_or_init_state(alert)
        previous_status = entity_state.operational_status

        try:
            runtime_start_dt = datetime.utcnow()
            await self._execute_action(policy["action"], alert)
            action_record.status = "EXECUTED"
            action_record.details["runtime_start"] = runtime_start_dt.timestamp()
            self._apply_policy_to_state(entity_state, policy, reason=alert.rule_id)
            await self.state_manager.update_state(entity_state)
            await self._publish_state_update(entity_state, previous_status, reason=alert.rule_id)
            await self._propagate_at_risk(alert)

            verification = await self._run_verification(alert, alert_id=alert_id, before_value=alert.metric_value)
            await self.state_manager.record_verification(verification)

            retry_count = 0
            last_retry_result = "SUCCESS" if verification.success else "FAILED"
            while (not verification.success) and retry_count < self.max_verification_retries:
                retry_count += 1
                await self._execute_action(policy["action"], alert)
                verification = await self._run_verification(
                    alert,
                    alert_id=alert_id,
                    before_value=alert.metric_value,
                )
                await self.state_manager.record_verification(verification)
                last_retry_result = "SUCCESS" if verification.success else "FAILED"
            action_record.details["retry_count"] = retry_count
            action_record.details["last_retry_result"] = last_retry_result
            action_record.details["verification_time"] = verification.timestamp.timestamp()
            action_record.details["before_value"] = float(alert.metric_value)
            action_record.details["after_value"] = float(verification.observed_value)
            action_record.details["expected_threshold"] = float(verification.safe_threshold)
            action_record.details["verification_result"] = "SUCCESS" if verification.success else "FAILED"

            if verification.success:
                await self._mark_recovered(entity_state, reason=f"VERIFIED:{alert.rule_id}")
                action_record.status = "VERIFIED_SUCCESS"
                action_record.details["verification_id"] = verification.id
                action_record.details["verification_success"] = True
                if alert_id:
                    await self.alert_service.resolve_alert(alert_id)
                    action_record.details["resolved_time"] = datetime.utcnow().timestamp()
                action_record.details["runtime_end"] = datetime.utcnow().timestamp()
            else:
                secondary = await self.remediation_engine.evaluate_secondary_action(alert)
                await self._execute_action(secondary["action"], alert)
                self._apply_policy_to_state(entity_state, secondary, reason=f"ESCALATED:{alert.rule_id}")
                await self.state_manager.update_state(entity_state)
                await self._publish_state_update(
                    entity_state,
                    previous_state=OperationalStatus.DEGRADED,
                    reason=f"ESCALATED:{alert.rule_id}",
                )
                action_record.status = "FAILED_REMEDIATION"
                action_record.details["verification_id"] = verification.id
                action_record.details["verification_success"] = False
                action_record.details["secondary_action"] = secondary["action"]
                action_record.details["secondary_reason"] = secondary.get("reason")
                action_record.details["runtime_end"] = datetime.utcnow().timestamp()

        except Exception as exc:
            action_record.status = "FAILED"
            action_record.details["error"] = str(exc)
            self.logger.exception("runtime_alert_processing_failed", alert_id=alert_id, entity_id=alert.entity_id)
        finally:
            await self.state_manager.record_remediation(action_record)

    async def _execute_action(self, action_type: str, alert: IncomingAlert) -> None:
        self.logger.info(
            "remediation_action_execute",
            action=action_type,
            entity_id=alert.entity_id,
            rule_id=alert.rule_id,
            metric_name=alert.metric_name,
        )
        # MVP execution: simulated action delay + log.
        await asyncio.sleep(self.action_exec_delay_s)

    async def _run_verification(
        self,
        alert: IncomingAlert,
        *,
        alert_id: Optional[str],
        before_value: float,
    ) -> VerificationResult:
        wait_s = self._rng.uniform(self.verify_wait_min_s, self.verify_wait_max_s)
        await asyncio.sleep(wait_s)

        rule = await self.alert_service.get_rule(alert.rule_id)
        operator = str(rule.get("operator")) if rule else ">"
        threshold = float(rule.get("threshold")) if rule else float(alert.metric_value)

        observed = await self.metrics_source.query_current_metric(
            metric_name=alert.metric_name,
            entity_type=alert.entity_type,
            entity_id=alert.entity_id,
            workspace_id=alert.workspace_id,
            facility_id=alert.facility_id,
        )
        if observed is None:
            return VerificationResult(
                alert_id=alert_id,
                tenant_id=alert.tenant_id,
                workspace_id=alert.workspace_id,
                entity_id=alert.entity_id,
                rule_id=alert.rule_id,
                metric_name=alert.metric_name,
                observed_value=-1.0,
                threshold=threshold,
                operator=operator,
                safe_threshold=threshold,
                success=False,
                details={
                    "reason": "metric_unavailable",
                    "wait_s": wait_s,
                    "before_value": before_value,
                    "after_value": None,
                    "expected_threshold": threshold,
                    "result": "FAILED",
                },
            )

        success, safe_threshold = self.metrics_source.verify_success(
            observed_value=observed,
            operator=operator,
            threshold=threshold,
            metric_name=alert.metric_name,
        )
        still_violating = self.metrics_source.still_violating(
            observed_value=observed,
            operator=operator,
            threshold=threshold,
        )

        self.logger.info(
            "remediation_verification",
            alert_id=alert_id,
            entity_id=alert.entity_id,
            metric_name=alert.metric_name,
            observed_value=observed,
            operator=operator,
            threshold=threshold,
            safe_threshold=safe_threshold,
            success=success,
            still_violating=still_violating,
        )

        return VerificationResult(
            alert_id=alert_id,
            tenant_id=alert.tenant_id,
            workspace_id=alert.workspace_id,
            entity_id=alert.entity_id,
            rule_id=alert.rule_id,
            metric_name=alert.metric_name,
            observed_value=observed,
            threshold=threshold,
            operator=operator,
            safe_threshold=safe_threshold,
            success=success,
            details={
                "wait_s": wait_s,
                "still_violating": still_violating,
                "before_value": before_value,
                "after_value": observed,
                "expected_threshold": safe_threshold,
                "result": "SUCCESS" if success else "FAILED",
            },
        )

    async def _get_or_init_state(self, alert: IncomingAlert) -> InfraState:
        state = await self.state_manager.get_current_state(alert.entity_id)
        if state:
            return state
        return InfraState(
            id=alert.entity_id,
            entity_type=alert.entity_type,
            tenant_id=alert.tenant_id,
            workspace_id=alert.workspace_id,
            operational_status=OperationalStatus.ACTIVE,
            health_score=1.0,
        )

    def _apply_policy_to_state(self, state: InfraState, policy: dict, *, reason: str) -> None:
        state.operational_status = policy["target_status"]
        state.health_score = float(policy.get("health_score", state.health_score))
        sub_states = policy.get("sub_states") or {}
        state.sub_states = {
            "thermal": sub_states.get("thermal", state.sub_states.get("thermal", "NORMAL")),
            "power": sub_states.get("power", state.sub_states.get("power", "NORMAL")),
            "network": sub_states.get("network", state.sub_states.get("network", "NORMAL")),
        }
        state.thermal_state = state.sub_states["thermal"]
        state.power_state = state.sub_states["power"]
        state.network_state = state.sub_states["network"]
        state.last_reason = reason
        state.last_updated = datetime.utcnow()

    async def _propagate_at_risk(self, alert: IncomingAlert):
        affected_ids = self.propagation_model.get_affected_nodes(alert.entity_id)
        for neighbor_id in affected_ids:
            if neighbor_id == alert.entity_id:
                continue
            neighbor = await self.state_manager.get_current_state(neighbor_id)
            if not neighbor:
                neighbor = InfraState(
                    id=neighbor_id,
                    entity_type=alert.entity_type,
                    tenant_id=alert.tenant_id,
                    workspace_id=alert.workspace_id,
                )
            previous = neighbor.operational_status
            neighbor.operational_status = OperationalStatus.AT_RISK
            neighbor.health_score = min(neighbor.health_score, 0.8)
            neighbor.sub_states["thermal"] = "AT_RISK" if "temp" in alert.metric_name.lower() else neighbor.sub_states.get("thermal", "NORMAL")
            neighbor.sub_states["power"] = "AT_RISK" if "power" in alert.metric_name.lower() else neighbor.sub_states.get("power", "NORMAL")
            neighbor.sub_states["network"] = "AT_RISK" if "network" in alert.metric_name.lower() else neighbor.sub_states.get("network", "NORMAL")
            neighbor.thermal_state = neighbor.sub_states["thermal"]
            neighbor.power_state = neighbor.sub_states["power"]
            neighbor.network_state = neighbor.sub_states["network"]
            neighbor.last_reason = f"PROPAGATED_FROM:{alert.entity_id}"
            neighbor.last_updated = datetime.utcnow()
            await self.state_manager.update_state(neighbor)
            await self._publish_state_update(neighbor, previous, reason=neighbor.last_reason or "PROPAGATION")

    async def _mark_recovered(self, state: InfraState, *, reason: str):
        previous = state.operational_status
        state.operational_status = OperationalStatus.ACTIVE
        state.health_score = 1.0
        state.sub_states = {"thermal": "NORMAL", "power": "NORMAL", "network": "NORMAL"}
        state.thermal_state = "NORMAL"
        state.power_state = "NORMAL"
        state.network_state = "NORMAL"
        state.last_reason = reason
        state.last_updated = datetime.utcnow()
        await self.state_manager.update_state(state)
        await self._publish_state_update(state, previous, reason=reason)

    async def _publish_state_update(self, state: InfraState, previous_state: OperationalStatus, *, reason: str):
        event = StateUpdateEvent(
            tenant_id=state.tenant_id,
            workspace_id=state.workspace_id,
            entity_type=state.entity_type,
            entity_id=state.id,
            previous_state=previous_state,
            current_state=state.operational_status,
            health_score=state.health_score,
            reason=reason,
        )
        await self.rabbitmq.publish_state_update(event)

    async def _process_topology_event(self, payload: dict):
        event_type = str(payload.get("event", "")).upper()
        rack_id = payload.get("rack_id")
        zone_id = payload.get("zone_id")
        device_id = payload.get("device_id")

        if event_type == "RACK_CREATED" and rack_id:
            self.propagation_model.ensure_node(rack_id)
            if zone_id:
                zone_key = f"zone:{zone_id}"
                self.propagation_model.ensure_node(zone_key)
                self.propagation_model.add_connection(rack_id, zone_key)
                members = self._zone_members.setdefault(zone_key, set())
                for existing_rack in members:
                    self.propagation_model.add_connection(rack_id, existing_rack)
                members.add(rack_id)
            return

        if event_type == "RACK_DELETED" and rack_id:
            self.propagation_model.remove_node(rack_id)
            for members in self._zone_members.values():
                members.discard(rack_id)
            return

        if event_type == "DEVICE_CREATED" and device_id and rack_id:
            self.propagation_model.ensure_node(device_id)
            self.propagation_model.ensure_node(rack_id)
            self.propagation_model.add_connection(device_id, rack_id)
            return

        if event_type == "DEVICE_MOVED" and device_id and rack_id:
            self.propagation_model.remove_node(device_id)
            self.propagation_model.ensure_node(device_id)
            self.propagation_model.ensure_node(rack_id)
            self.propagation_model.add_connection(device_id, rack_id)
            return

        if event_type == "DEVICE_DELETED" and device_id:
            self.propagation_model.remove_node(device_id)
