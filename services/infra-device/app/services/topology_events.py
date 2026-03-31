import asyncio
import json
import os
import time
from typing import Any

import structlog
from aiokafka import AIOKafkaProducer


class TopologyEventPublisher:
    def __init__(self):
        self.bootstrap_servers = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
        self.topic = os.getenv("TOPOLOGY_EVENTS_TOPIC", "infra.topology.events")
        self.enabled = os.getenv("TOPOLOGY_EVENTS_ENABLED", "true").lower() == "true"
        self.logger = structlog.get_logger("infra-device.topology-events")
        self.producer: AIOKafkaProducer | None = None

    async def start(self) -> None:
        if not self.enabled:
            return
        retries = 20
        while retries > 0:
            producer: AIOKafkaProducer | None = None
            try:
                producer = AIOKafkaProducer(
                    bootstrap_servers=self.bootstrap_servers,
                    value_serializer=lambda value: json.dumps(value).encode("utf-8"),
                )
                await producer.start()
                self.producer = producer
                return
            except Exception as exc:
                retries -= 1
                if producer:
                    try:
                        await producer.stop()
                    except Exception:
                        pass
                self.logger.warning("topology_event_publisher_connect_retry", retries_remaining=retries, error=str(exc))
                await asyncio.sleep(2)

        self.producer = None
        self.enabled = False
        self.logger.warning("topology_event_publisher_disabled_after_startup_failures")

    async def stop(self) -> None:
        if self.producer:
            await self.producer.stop()
            self.producer = None

    async def publish(self, payload: dict[str, Any]) -> None:
        if not self.enabled or not self.producer:
            return
        event = dict(payload)
        event.setdefault("timestamp", time.time())
        event.setdefault("version", "v1")
        workspace_id = str(event.get("workspace_id") or "")
        key = workspace_id.encode("utf-8") if workspace_id else None
        await self.producer.send_and_wait(self.topic, event, key=key)


publisher = TopologyEventPublisher()


async def start_topology_events() -> None:
    await publisher.start()


async def stop_topology_events() -> None:
    await publisher.stop()


async def publish_topology_event(payload: dict[str, Any]) -> None:
    publish_timeout_s = float(os.getenv("TOPOLOGY_EVENTS_PUBLISH_TIMEOUT_S", "0.75"))
    try:
        await asyncio.wait_for(publisher.publish(payload), timeout=publish_timeout_s)
    except asyncio.TimeoutError:
        publisher.logger.warning("topology_event_publish_timeout", timeout_s=publish_timeout_s, payload=payload)
    except Exception as exc:
        publisher.logger.warning("topology_event_publish_failed", error=str(exc), payload=payload)

