import asyncio
import time
from typing import List
from app.clients.prometheus import PrometheusClient
from app.clients.kafka import KafkaProducer

class StreamWorker:
    def __init__(self, interval_s: float = 2.0):
        self.interval_s = interval_s
        self.is_paused = False
        self.running = False
        self.prom_client = PrometheusClient()
        self.kafka_producer = KafkaProducer()
        self.topic = "infra.metrics.stream"
        self.metrics_to_poll = [
            "rack_power_kw",
            "rack_temp_c",
            "device_latency_ms",
            "infra_risk_index",
            "cluster_latency_score"
        ]

    async def start(self):
        self.running = True
        await self.kafka_producer.start()
        asyncio.create_task(self._run())

    async def stop(self):
        self.running = False
        await self.kafka_producer.stop()
        await self.prom_client.close()

    def pause(self):
        self.is_paused = True

    def resume(self):
        self.is_paused = False

    async def _run(self):
        while self.running:
            if not self.is_paused:
                start_time = time.time()
                await self._process_tick()
                elapsed = time.time() - start_time
                await asyncio.sleep(max(0, self.interval_s - elapsed))
            else:
                await asyncio.sleep(1.0) # Check pause state every second

    async def _process_tick(self):
        """
        Single tick: Poll all metrics, normalize, and publish to Kafka.
        """
        for metric_name in self.metrics_to_poll:
            events = await self.prom_client.query_metrics(metric_name)
            
            for event in events:
                # Publish to Kafka partitioned by tenant_id
                await self.kafka_producer.publish_event(
                    topic=self.topic,
                    event=event.model_dump(),
                    partition_key=event.tenant_id
                )
