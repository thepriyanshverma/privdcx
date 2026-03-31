import asyncio
import json
import os
from collections.abc import Awaitable, Callable

import structlog
from aiokafka import AIOKafkaConsumer
from aiokafka.structs import OffsetAndMetadata


class KafkaAlertConsumer:
    def __init__(self, bootstrap_servers: str | None = None):
        self.bootstrap_servers = bootstrap_servers or os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
        self.topic = os.getenv("KAFKA_TOPIC", "infra.metrics.stream")
        self.group_id = os.getenv("KAFKA_CONSUMER_GROUP", "infra-alert-engine")
        self.batch_size = int(os.getenv("KAFKA_BATCH_SIZE", "250"))
        self.poll_timeout_ms = int(os.getenv("KAFKA_POLL_TIMEOUT_MS", "1000"))
        self.failure_backoff_s = float(os.getenv("KAFKA_FAILURE_BACKOFF_S", "1"))
        self.logger = structlog.get_logger("infra-alert-engine.kafka")
        self.running = False

        self.consumer = AIOKafkaConsumer(
            self.topic,
            bootstrap_servers=self.bootstrap_servers,
            group_id=self.group_id,
            value_deserializer=lambda value: json.loads(value.decode("utf-8")),
            auto_offset_reset="earliest",
            enable_auto_commit=False,
            max_poll_records=self.batch_size,
        )

    async def start(self) -> None:
        await self.consumer.start()
        self.running = True

    async def stop(self) -> None:
        self.running = False
        await self.consumer.stop()

    async def consume_batches(self, callback: Callable[[dict], Awaitable[None]]) -> None:
        while self.running:
            try:
                records_by_partition = await self.consumer.getmany(
                    timeout_ms=self.poll_timeout_ms,
                    max_records=self.batch_size,
                )
                if not records_by_partition:
                    continue

                offsets_to_commit: dict = {}
                batch_failed = False

                for topic_partition, messages in records_by_partition.items():
                    for message in messages:
                        try:
                            await callback(message.value)
                            offsets_to_commit[topic_partition] = OffsetAndMetadata(message.offset + 1, "")
                        except Exception as exc:
                            batch_failed = True
                            self.logger.error(
                                "kafka_message_process_failed",
                                topic=topic_partition.topic,
                                partition=topic_partition.partition,
                                offset=message.offset,
                                error=str(exc),
                            )
                            break
                    if batch_failed:
                        break

                if batch_failed:
                    await asyncio.sleep(self.failure_backoff_s)
                    continue

                if offsets_to_commit:
                    await self.consumer.commit(offsets_to_commit)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                self.logger.error("kafka_consume_loop_failed", error=str(exc))
                await asyncio.sleep(self.failure_backoff_s)
