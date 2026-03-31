import asyncio
import uuid

import structlog
from pydantic import ValidationError

from app.clients.kafka_consumer import KafkaAlertConsumer
from app.clients.mongo import MongoAlertStore
from app.clients.rabbitmq import RabbitMQDispatcher
from app.engines.locks import AlertLockManager
from app.engines.rules import RuleEngine
from app.schemas.alerts import InfraAlertEvent, MetricStreamEvent


class AlertProcessor:
    def __init__(self):
        self.consumer = KafkaAlertConsumer()
        self.dispatcher = RabbitMQDispatcher()
        self.lock_manager = AlertLockManager()
        self.mongo_store = MongoAlertStore()
        self.rule_engine = RuleEngine()
        self.is_paused = False
        self.running = False
        self._task: asyncio.Task | None = None
        self.logger = structlog.get_logger("infra-alert-engine.processor")

        self.metrics_events_seen_total = 0
        self.alerts_evaluated_total = 0
        self.alerts_published_total = 0
        self.alerts_suppressed_total = 0
        self.alerts_persisted_total = 0

    async def start(self) -> None:
        await self.consumer.start()
        await self.dispatcher.connect()
        await self.mongo_store.ensure_indexes()
        self.running = True
        self._task = asyncio.create_task(self._run(), name="infra-alert-engine-loop")

    async def stop(self) -> None:
        self.running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        await self.consumer.stop()
        await self.dispatcher.close()
        await self.lock_manager.close()
        await self.mongo_store.close()

    async def _run(self) -> None:
        await self.consumer.consume_batches(self._handle_metric_event)

    async def _handle_metric_event(self, raw_event: dict) -> None:
        if self.is_paused:
            return

        try:
            metric_event = MetricStreamEvent.model_validate(raw_event)
        except ValidationError as exc:
            self.logger.warning("invalid_metric_event_skipped", error=str(exc), event=raw_event)
            return

        self.metrics_events_seen_total += 1

        matched_rules = self.rule_engine.evaluate_event(metric_event)
        if not matched_rules:
            return

        entity_id, entity_type = self.lock_manager.resolve_entity(metric_event)
        self.alerts_evaluated_total += len(matched_rules)

        for rule in matched_rules:
            is_locked = await self.lock_manager.is_locked(metric_event.tenant_id, entity_id, rule.rule_id)
            if is_locked:
                self.alerts_suppressed_total += 1
                continue

            alert = InfraAlertEvent(
                trace_id=f"trace-{uuid.uuid4().hex}",
                tenant_id=metric_event.tenant_id,
                workspace_id=metric_event.workspace_id,
                facility_id=metric_event.facility_id,
                entity_id=entity_id,
                entity_type=entity_type,
                severity=rule.severity,
                rule_id=rule.rule_id,
                metric_name=metric_event.metric_name,
                metric_value=metric_event.value,
                description=rule.description,
                operator=rule.operator,
                threshold=rule.threshold,
                deviation_pct=((metric_event.value - rule.threshold) / rule.threshold * 100.0) if rule.threshold else None,
                queue_time=metric_event.timestamp,
                raw_metric_event=metric_event.model_dump(),
                rack_id=metric_event.rack_id,
                device_id=metric_event.device_id,
            )

            # Persist history before transient publish so alerts remain visible for UI/audit.
            alert_id = await self.mongo_store.insert_alert(alert)
            alert.alert_id = alert_id
            self.alerts_persisted_total += 1

            await self.dispatcher.publish_alert(alert)
            self.alerts_published_total += 1
            await self.lock_manager.lock(
                tenant_id=metric_event.tenant_id,
                entity_id=entity_id,
                rule_id=rule.rule_id,
                ttl_s=rule.cooldown_sec,
            )

            self.logger.info(
                "alert_published",
                rule_id=rule.rule_id,
                metric_name=metric_event.metric_name,
                metric_value=metric_event.value,
                entity_id=entity_id,
                entity_type=entity_type.value,
                severity=rule.severity.value,
            )
