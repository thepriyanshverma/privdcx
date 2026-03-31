import asyncio

import structlog

from app.clients.kafka_consumer import TopologyEventConsumer
from app.clients.mongo_store import TopologyMongoStore
from app.services.graph_store import TopologyGraphStore


class TopologyEngine:
    def __init__(self):
        self.mongo = TopologyMongoStore()
        self.graph_store = TopologyGraphStore(self.mongo)
        self.consumer = TopologyEventConsumer()
        self.running = False
        self._consume_task: asyncio.Task | None = None
        self.logger = structlog.get_logger("infra-topology.engine")

    async def start(self) -> None:
        await self.graph_store.initialize()
        await self.consumer.start()
        self.running = True
        self._consume_task = asyncio.create_task(self.consumer.consume_loop(self._handle_event), name="topology-consumer-loop")

    async def stop(self) -> None:
        self.running = False
        if self._consume_task:
            self._consume_task.cancel()
            try:
                await self._consume_task
            except asyncio.CancelledError:
                pass
            self._consume_task = None
        await self.consumer.stop()
        await self.mongo.close()

    async def _handle_event(self, payload: dict) -> None:
        await self.graph_store.apply_event(payload)
