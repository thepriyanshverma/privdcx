import asyncio
from typing import List
from app.clients.kafka_consumer import KafkaAlertConsumer
from app.clients.rabbitmq import RabbitMQDispatcher
from app.engines.rules import RuleEngine
from app.engines.locks import AlertLockManager
from app.schemas.alerts import AlertRule

class AlertProcessor:
    def __init__(self):
        self.consumer = KafkaAlertConsumer()
        self.dispatcher = RabbitMQDispatcher()
        self.lock_manager = AlertLockManager()
        self.rule_engine = RuleEngine([]) # Initially empty, filled by manager
        self.is_paused = False
        self.running = False

    async def start(self):
        self.running = True
        await self.consumer.start()
        await self.dispatcher.connect()
        asyncio.create_task(self._run())

    async def stop(self):
        self.running = False
        await self.consumer.stop()
        await self.dispatcher.close()
        await self.lock_manager.close()

    async def _run(self):
        await self.consumer.consume(self._handle_metric)

    async def _handle_metric(self, metric_event: dict):
        """
        Main pipeline: Kafka -> Rule Engine -> Redis Lock -> RabbitMQ Publish
        """
        if self.is_paused:
            return

        # 1. Evaluate rules
        alerts = self.rule_engine.evaluate(metric_event)
        
        for alert in alerts:
            # 2. Check Redis Lock (Suppression/Deduplication)
            entity_id = self.lock_manager.get_entity_id(metric_event)
            if await self.lock_manager.is_locked(alert.tenant_id, entity_id, alert.rule_id):
                continue # Suppressed
                
            # 3. Publish to RabbitMQ
            await self.dispatcher.publish_alert(alert)
            
            # 4. Apply Lock (TTL suppression)
            await self.lock_manager.lock(alert.tenant_id, entity_id, alert.rule_id, ttl_s=60)
