import json
import redis.asyncio as redis
from motor.motor_asyncio import AsyncIOMotorClient
from typing import Optional, List
from app.schemas.runtime import InfraState
import os

class StateManager:
    def __init__(
        self, 
        redis_url: str = "redis://redis:6379",
        mongo_url: str = "mongodb://infraos:infraos_password@mongodb:27017"
    ):
        self.redis = redis.from_url(redis_url)
        self.mongo_client = AsyncIOMotorClient(mongo_url)
        self.db = self.mongo_client.infraos_runtime

    async def get_current_state(self, entity_id: str) -> Optional[InfraState]:
        """
        Retrieves real-time operational state from Redis cache.
        """
        data = await self.redis.get(f"infra_state:{entity_id}")
        if data:
            return InfraState(**json.loads(data))
        return None

    async def update_state(self, state: InfraState):
        """
        Updates Redis cache and persists to MongoDB history timeline.
        """
        state_data = state.model_dump_json()
        
        # 1. Update Redis Cache
        await self.redis.set(f"infra_state:{state.id}", state_data)
        
        # 2. Persist to MongoDB History (Time-series)
        await self.db.infra_state_history.insert_one({
            "entity_id": state.id,
            "timestamp": state.last_updated,
            "state": json.loads(state_data)
        })

    async def record_remediation(self, action: dict):
        """
        Logs a remediation action in MongoDB.
        """
        await self.db.remediation_history.insert_one(action)

    async def close(self):
        await self.redis.close()
        self.mongo_client.close()
