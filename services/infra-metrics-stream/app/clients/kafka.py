from aiokafka import AIOKafkaProducer
import json
import os
from typing import Optional

class KafkaProducer:
    def __init__(self, bootstrap_servers: str = "kafka:9092"):
        self.bootstrap_servers = bootstrap_servers
        self.producer = AIOKafkaProducer(
            bootstrap_servers=bootstrap_servers,
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            key_serializer=lambda k: k.encode("utf-8") if k else None,
            acks="all",
            retry_backoff_ms=500
        )

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
            print(f"Error publishing to Kafka: {e}")
