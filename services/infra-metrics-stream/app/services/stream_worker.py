import asyncio
import os
import time
from collections import defaultdict
from typing import Dict, Any, List, Tuple

import structlog

from app.clients.kafka import KafkaProducer
from app.clients.mongo import MongoSnapshotStore
from app.clients.prometheus import PrometheusClient
from app.schemas.events import InfraMetricEvent


class StreamWorker:
    def __init__(self, interval_s: float = 2.0):
        self.interval_s = interval_s
        self.snapshot_flush_interval_s = float(os.getenv("SNAPSHOT_FLUSH_INTERVAL_S", "5"))
        self.max_device_samples_per_rack = int(os.getenv("DEVICE_SAMPLE_MAX_PER_RACK", "3"))
        self.is_paused = False
        self.running = False

        self.prom_client = PrometheusClient()
        self.kafka_producer = KafkaProducer()
        self.mongo_store = MongoSnapshotStore()
        self.logger = structlog.get_logger("infra-metrics-stream.worker")

        self.topic = os.getenv("KAFKA_TOPIC", "infra.metrics.stream")
        self.metrics_to_poll = [
            "rack_power_kw",
            "rack_temp_c",
            "device_power_kw",
            "device_temp_c",
            "facility_power_mw",
            "infra_risk_index",
        ]

        self._task: asyncio.Task | None = None
        self._mongo_writer_task: asyncio.Task | None = None
        self._mongo_queue: asyncio.Queue[list[dict[str, Any]]] = asyncio.Queue(maxsize=100)
        self._last_snapshot_flush = 0.0
        self.last_tick_ts: float = 0.0
        self.last_tick_event_count: int = 0
        self.prometheus_samples_seen_total: int = 0
        self.samples_skipped_missing_labels_total: int = 0
        self.kafka_events_published_total: int = 0
        self.mongo_snapshots_written_total: int = 0
        self.mongo_docs_written_total: int = 0

        # workspace_id -> facility_id -> snapshot bundle
        self.snapshot_buffer: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)

    async def start(self):
        self.running = True
        await self.kafka_producer.start()
        await self.mongo_store.ensure_indexes()
        self._mongo_writer_task = asyncio.create_task(self._mongo_writer_loop(), name="metrics-stream-mongo-writer")
        self._task = asyncio.create_task(self._run(), name="metrics-stream-worker")

    async def stop(self):
        self.running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

        # Flush any remaining aggregated snapshots before shutdown.
        pending_docs = self._build_snapshot_docs(reset=True)
        if pending_docs:
            inserted = await self.mongo_store.write_snapshots(pending_docs)
            self.mongo_snapshots_written_total += len(pending_docs)
            self.mongo_docs_written_total += inserted

        if self._mongo_writer_task:
            self._mongo_writer_task.cancel()
            try:
                await self._mongo_writer_task
            except asyncio.CancelledError:
                pass
            self._mongo_writer_task = None

        await self.kafka_producer.stop()
        await self.prom_client.close()
        await self.mongo_store.close()

    def pause(self):
        self.is_paused = True

    def resume(self):
        self.is_paused = False

    async def _run(self):
        self._last_snapshot_flush = time.monotonic()
        while self.running:
            if self.is_paused:
                await asyncio.sleep(1.0)
                continue

            start_time = time.monotonic()
            try:
                await self._process_tick()
            except Exception as exc:
                self.logger.error("stream_tick_failed", error=str(exc))

            elapsed = time.monotonic() - start_time
            await asyncio.sleep(max(0.0, self.interval_s - elapsed))

    async def _process_tick(self):
        metric_results = await asyncio.gather(
            *[self.prom_client.query_vector(metric_name) for metric_name in self.metrics_to_poll]
        )

        normalized_events: list[dict[str, Any]] = []
        skipped = 0
        seen = 0
        for metric_name, rows in zip(self.metrics_to_poll, metric_results):
            for row in rows:
                seen += 1
                event = self._normalize_sample(metric_name, row)
                if event is None:
                    skipped += 1
                    continue
                payload = event.model_dump()
                normalized_events.append(payload)
                self._accumulate_snapshot(payload)

        if normalized_events:
            # Kafka publish is the real-time path and should proceed regardless of Mongo status.
            published = await self.kafka_producer.publish_batch(
                topic=self.topic,
                events=normalized_events,
                partition_key_field="tenant_id",
            )
            self.kafka_events_published_total += published

        now = time.monotonic()
        self.last_tick_ts = time.time()
        self.last_tick_event_count = len(normalized_events)
        self.prometheus_samples_seen_total += seen
        self.samples_skipped_missing_labels_total += skipped
        if (now - self._last_snapshot_flush) >= self.snapshot_flush_interval_s:
            docs = self._build_snapshot_docs(reset=True)
            self._last_snapshot_flush = now
            if docs:
                await self._enqueue_mongo_docs(docs)

    def _normalize_sample(self, metric_name: str, row: dict[str, Any]) -> InfraMetricEvent | None:
        metric = row.get("metric", {})
        value_entry = row.get("value", [])
        if len(value_entry) != 2:
            return None

        try:
            timestamp = float(value_entry[0])
            value = float(value_entry[1])
        except Exception:
            return None

        workspace_id = metric.get("workspace_id")
        facility_id = metric.get("facility_id")
        rack_id = metric.get("rack_id")
        device_id = metric.get("device_id")
        device_type = metric.get("device_type")
        # tenant_id semantics: org_id (with legacy tenant_id fallback).
        tenant_id = metric.get("org_id") or metric.get("tenant_id") or workspace_id

        if not workspace_id or not facility_id or not tenant_id:
            return None

        if metric_name in {"rack_power_kw", "rack_temp_c"} and not rack_id:
            return None
        if metric_name in {"device_power_kw", "device_temp_c"} and (not rack_id or not device_id):
            return None

        labels = {
            k: v
            for k, v in metric.items()
            if k
            not in {
                "__name__",
                "tenant_id",
                "workspace_id",
                "facility_id",
                "rack_id",
                "device_id",
                "device_type",
            }
        }

        return InfraMetricEvent(
            version="v1",
            timestamp=timestamp,
            metric_name=metric_name,
            value=value,
            tenant_id=str(tenant_id),
            workspace_id=str(workspace_id),
            facility_id=str(facility_id),
            rack_id=str(rack_id) if rack_id else None,
            device_id=str(device_id) if device_id else None,
            device_type=str(device_type) if device_type else None,
            labels=labels,
        )

    def _ensure_snapshot_slot(self, tenant_id: str, workspace_id: str, facility_id: str) -> dict[str, Any]:
        workspace_slot = self.snapshot_buffer.setdefault(workspace_id, {})
        if facility_id not in workspace_slot:
            workspace_slot[facility_id] = {
                "tenant_id": tenant_id,
                "workspace_id": workspace_id,
                "facility_id": facility_id,
                "facility_metrics": {},
                "rack_metrics": {},
                "device_metrics_sample_by_rack": defaultdict(dict),
            }
        return workspace_slot[facility_id]

    def _accumulate_snapshot(self, event: dict[str, Any]):
        tenant_id = event["tenant_id"]
        workspace_id = event["workspace_id"]
        facility_id = event["facility_id"]
        slot = self._ensure_snapshot_slot(tenant_id, workspace_id, facility_id)
        metric_name = event["metric_name"]
        value = float(event["value"])

        if metric_name == "facility_power_mw":
            slot["facility_metrics"]["power_mw"] = value
            return
        if metric_name == "infra_risk_index":
            slot["facility_metrics"]["risk_index"] = value
            return
        if metric_name in {"rack_power_kw", "rack_temp_c"}:
            rack_id = event.get("rack_id")
            if not rack_id:
                return
            rack_slot = slot["rack_metrics"].setdefault(rack_id, {"rack_id": rack_id})
            if metric_name == "rack_power_kw":
                rack_slot["power_kw"] = value
            else:
                rack_slot["temp_c"] = value
            return
        if metric_name in {"device_power_kw", "device_temp_c"}:
            rack_id = event.get("rack_id")
            device_id = event.get("device_id")
            if not rack_id or not device_id:
                return
            device_bucket = slot["device_metrics_sample_by_rack"][rack_id]
            if device_id not in device_bucket and len(device_bucket) >= self.max_device_samples_per_rack:
                return
            device_slot = device_bucket.setdefault(
                device_id,
                {
                    "device_id": device_id,
                    "device_type": event.get("device_type"),
                },
            )
            if metric_name == "device_power_kw":
                device_slot["power_kw"] = value
            else:
                device_slot["temp_c"] = value

    def _build_snapshot_docs(self, reset: bool) -> list[dict[str, Any]]:
        docs: list[dict[str, Any]] = []
        ts = time.time()

        for workspace_id, facility_map in self.snapshot_buffer.items():
            for facility_id, slot in facility_map.items():
                rack_metrics = list(slot["rack_metrics"].values())
                sampled_devices: list[dict[str, Any]] = []
                for rack_samples in slot["device_metrics_sample_by_rack"].values():
                    sampled_devices.extend(rack_samples.values())

                docs.append(
                    {
                        "timestamp": ts,
                        "tenant_id": slot["tenant_id"],
                        "workspace_id": workspace_id,
                        "facility_id": facility_id,
                        "facility_metrics": {
                            "power_mw": slot["facility_metrics"].get("power_mw", 0.0),
                            "risk_index": slot["facility_metrics"].get("risk_index", 0.0),
                        },
                        "rack_metrics": rack_metrics,
                        "device_metrics_sample": sampled_devices,
                    }
                )

        if reset:
            self.snapshot_buffer = defaultdict(dict)
        return docs

    async def _enqueue_mongo_docs(self, docs: list[dict[str, Any]]):
        try:
            self._mongo_queue.put_nowait(docs)
        except asyncio.QueueFull:
            self.logger.warning("mongo_queue_full_dropping_snapshot_batch", dropped_docs=len(docs))

    async def _mongo_writer_loop(self):
        while self.running:
            try:
                docs = await self._mongo_queue.get()
            except asyncio.CancelledError:
                raise
            except Exception:
                continue
            try:
                inserted = await self.mongo_store.write_snapshots(docs)
                self.mongo_snapshots_written_total += len(docs)
                self.mongo_docs_written_total += inserted
            except Exception as exc:
                self.logger.error("mongo_write_async_failed", error=str(exc), docs=len(docs))
            finally:
                self._mongo_queue.task_done()
