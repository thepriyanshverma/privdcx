import json
import asyncio
from aiokafka import AIOKafkaConsumer
from typing import Callable, Awaitable

class KafkaAlertConsumer:
    def __init__(self, bootstrap_servers: str = "kafka:9092"):
        self.bootstrap_servers = bootstrap_servers
        self.consumer = AIOKafkaConsumer(
            "infra.metrics.stream",
            bootstrap_servers=bootstrap_servers,
            group_id="infra-alert-engine",
            value_deserializer=lambda v: json.loads(v.decode("utf-8")),
            auto_offset_reset="earliest",
            enable_auto_commit=False # Manual commits for safety
        )
        self.running = False

    async def start(self):
        await self.consumer.start()
        self.running = True

    async def stop(self):
        self.running = False
        await self.consumer.stop()

    async def consume(self, callback: Callable[[dict], Awaitable[None]]):
        async for msg in self.consumer:
            if not self.running: break
            
            try:
                await callback(msg.value)
                # Success -> Commit offset
                await self.consumer.commit()
            except Exception as e:
                print(f"Error processing Kafka message: {e}")
                # Poison message or temporary failure - in real app, send to DLQ
