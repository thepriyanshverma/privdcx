import os
from typing import List, Dict, Any

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorCollection
import structlog


class MongoSnapshotStore:
    def __init__(self):
        mongo_url = os.getenv("MONGODB_URL") or os.getenv("MONGO_URL") or "mongodb://infraos:infraos_password@mongodb:27017"
        self.db_name = os.getenv("MONGODB_DATABASE", "infraos_telemetry")
        self.collection_name = os.getenv("MONGODB_SNAPSHOTS_COLLECTION", "metrics_snapshots")
        self.client = AsyncIOMotorClient(mongo_url)
        self.collection: AsyncIOMotorCollection = self.client[self.db_name][self.collection_name]
        self.logger = structlog.get_logger("infra-metrics-stream.mongo")

    async def ensure_indexes(self):
        await self.collection.create_index([("workspace_id", 1), ("timestamp", -1)], background=True)
        await self.collection.create_index([("facility_id", 1), ("timestamp", -1)], background=True)
        await self.collection.create_index([("timestamp", -1)], background=True)

    async def write_snapshots(self, docs: List[Dict[str, Any]]):
        if not docs:
            return 0
        try:
            result = await self.collection.insert_many(docs, ordered=False)
            return len(result.inserted_ids)
        except Exception as exc:
            self.logger.error("mongo_snapshot_write_failed", count=len(docs), error=str(exc))
            return 0

    async def close(self):
        self.client.close()
