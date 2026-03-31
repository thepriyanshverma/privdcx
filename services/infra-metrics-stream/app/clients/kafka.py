from aiokafka import AIOKafkaProducer
import json
import os
from typing import Optional, List
import asyncio
import structlog

class KafkaProducer:
    def __init__(self, bootstrap_servers: str | None = None):
        self.bootstrap_servers = bootstrap_servers or os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
        self.producer = AIOKafkaProducer(
            bootstrap_servers=self.bootstrap_servers,
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            key_serializer=lambda k: k.encode("utf-8") if k else None,
            acks="all",
            retry_backoff_ms=500
        )
        self.logger = structlog.get_logger("infra-metrics-stream.kafka")

    async def start(self):
        await self.producer.start()

    async def stop(self):
        await self.producer.stop()

    async def publish_event(self, topic: str, event: dict, partition_key: Optional[str] = None):
        """
        Publishes an event to Kafka with strict partitioning by key.
        """
        try:
            await self.producer.send_and_wait(
                topic, 
                value=event, 
                key=partition_key
            )
        except Exception as e:
            self.logger.error("kafka_publish_failed", topic=topic, error=str(e))

    async def publish_batch(self, topic: str, events: List[dict], partition_key_field: str = "tenant_id"):
        if not events:
            return 0
        try:
            futures = []
            for event in events:
                partition_key = event.get(partition_key_field)
                futures.append(self.producer.send(topic, value=event, key=partition_key))
            await asyncio.gather(*futures)
            await self.producer.flush()
            return len(events)
        except Exception as e:
            self.logger.error("kafka_batch_publish_failed", topic=topic, count=len(events), error=str(e))
            return 0
