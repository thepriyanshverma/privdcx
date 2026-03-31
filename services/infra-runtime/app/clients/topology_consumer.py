import asyncio
import json
import os
from typing import Awaitable, Callable

import structlog
from aiokafka import AIOKafkaConsumer


class TopologyEventConsumer:
    def __init__(self):
        self.topic = os.getenv("TOPOLOGY_EVENTS_TOPIC", "infra.topology.events")
        self.group_id = os.getenv("RUNTIME_TOPOLOGY_CONSUMER_GROUP", "infra-runtime-topology")
        self.bootstrap_servers = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
        self.consumer: AIOKafkaConsumer | None = None
        self.logger = structlog.get_logger("infra-runtime.topology-consumer")

    async def start(self) -> None:
        retries = 30
        while retries > 0:
            try:
                self.consumer = AIOKafkaConsumer(
                    self.topic,
                    bootstrap_servers=self.bootstrap_servers,
                    group_id=self.group_id,
                    value_deserializer=lambda v: json.loads(v.decode("utf-8")),
                    auto_offset_reset="earliest",
                    enable_auto_commit=True,
                )
                await self.consumer.start()
                return
            except Exception as exc:
                retries -= 1
                self.logger.warning("runtime_topology_connect_retry", retries_remaining=retries, error=str(exc))
                await asyncio.sleep(2)
        raise RuntimeError("Unable to connect runtime topology consumer")

    async def consume_loop(self, callback: Callable[[dict], Awaitable[None]]) -> None:
        if not self.consumer:
            raise RuntimeError("Runtime topology consumer not started")
        async for message in self.consumer:
            try:
                await callback(message.value)
            except Exception as exc:
                self.logger.exception("runtime_topology_event_failed", error=str(exc), payload=message.value)

    async def stop(self) -> None:
        if self.consumer:
            await self.consumer.stop()
            self.consumer = None
