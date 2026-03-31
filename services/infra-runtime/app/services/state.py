import json
import os
import time
from datetime import datetime
from typing import Optional

import redis.asyncio as redis
from motor.motor_asyncio import AsyncIOMotorClient

from app.schemas.runtime import InfraState, RemediationAction, VerificationResult


class StateManager:
    def __init__(self):
        redis_url = os.getenv("REDIS_URL", "redis://redis:6379")
        mongo_url = os.getenv("MONGODB_URL", "mongodb://infraos:infraos_password@mongodb:27017")
        mongo_db = os.getenv("RUNTIME_MONGODB_DATABASE", "infraos_runtime")

        self.redis = redis.from_url(redis_url, decode_responses=True)
        self.mongo_client = AsyncIOMotorClient(mongo_url)
        self.db = self.mongo_client[mongo_db]

    async def ensure_indexes(self) -> None:
        await self.db.infra_state_history.create_index([("workspace_id", 1), ("timestamp", -1)], background=True)
        await self.db.remediation_history.create_index([("workspace_id", 1), ("timestamp", -1)], background=True)
        await self.db.remediation_history.create_index([("entity_id", 1), ("timestamp", -1)], background=True)
        await self.db.remediation_history.create_index([("alert_id", 1)], background=True)
        await self.db.verification_history.create_index([("workspace_id", 1), ("timestamp", -1)], background=True)
        await self.db.verification_history.create_index([("entity_id", 1), ("timestamp", -1)], background=True)
        await self.db.verification_history.create_index([("alert_id", 1)], background=True)
        await self.db.state_snapshots.create_index([("timestamp", -1)], background=True)

    async def get_current_state(self, entity_id: str) -> Optional[InfraState]:
        data = await self.redis.get(f"infra_state:{entity_id}")
        if not data:
            return None
        return InfraState(**json.loads(data))

    async def update_state(self, state: InfraState):
        state.last_updated = datetime.utcnow()
        state_data = state.model_dump(mode="json")
        await self.redis.set(f"infra_state:{state.id}", json.dumps(state_data))
        await self.db.infra_state_history.insert_one(
            {
                "entity_id": state.id,
                "workspace_id": state.workspace_id,
                "tenant_id": state.tenant_id,
                "timestamp": state.last_updated.timestamp(),
                "state": state_data,
            }
        )

    async def record_remediation(self, action: RemediationAction):
        await self.db.remediation_history.insert_one(action.model_dump(mode="json"))

    async def record_verification(self, verification: VerificationResult):
        await self.db.verification_history.insert_one(verification.model_dump(mode="json"))

    async def list_remediations(
        self,
        *,
        workspace_id: str,
        entity_id: Optional[str] = None,
        limit: int = 100,
    ) -> list[dict]:
        query: dict = {"workspace_id": workspace_id}
        if entity_id:
            query["entity_id"] = entity_id
        cursor = self.db.remediation_history.find(query).sort("timestamp", -1).limit(limit)
        docs = await cursor.to_list(length=limit)
        return [self._serialize_doc(doc) for doc in docs]

    async def list_verifications(
        self,
        *,
        workspace_id: str,
        entity_id: Optional[str] = None,
        limit: int = 100,
    ) -> list[dict]:
        query: dict = {"workspace_id": workspace_id}
        if entity_id:
            query["entity_id"] = entity_id
        cursor = self.db.verification_history.find(query).sort("timestamp", -1).limit(limit)
        docs = await cursor.to_list(length=limit)
        return [self._serialize_doc(doc) for doc in docs]

    async def list_states(
        self,
        *,
        workspace_id: str,
        entity_id: Optional[str] = None,
        limit: int = 500,
    ) -> list[dict]:
        items: list[dict] = []
        if entity_id:
            payload = await self.redis.get(f"infra_state:{entity_id}")
            if not payload:
                return []
            state = json.loads(payload)
            if state.get("workspace_id") != workspace_id:
                return []
            return [state]

        cursor = self.redis.scan_iter(match="infra_state:*")
        async for key in cursor:
            payload = await self.redis.get(key)
            if not payload:
                continue
            state = json.loads(payload)
            if state.get("workspace_id") != workspace_id:
                continue
            items.append(state)
            if len(items) >= limit:
                break

        items.sort(key=lambda x: self._timestamp_from_maybe_datetime(x.get("last_updated")), reverse=True)
        return items[:limit]

    async def snapshot_states(self) -> dict:
        cursor = self.redis.scan_iter(match="infra_state:*")
        states = []
        async for key in cursor:
            payload = await self.redis.get(key)
            if not payload:
                continue
            states.append(json.loads(payload))

        snapshot_doc = {
            "timestamp": time.time(),
            "state_count": len(states),
            "states": states,
        }
        await self.db.state_snapshots.insert_one(snapshot_doc)
        return snapshot_doc

    async def close(self):
        await self.redis.aclose()
        self.mongo_client.close()

    @staticmethod
    def _serialize_doc(doc: dict) -> dict:
        payload = dict(doc)
        object_id = payload.pop("_id", None)
        if object_id is not None:
            payload["id"] = str(object_id)
        return payload

    @staticmethod
    def _timestamp_from_maybe_datetime(value) -> float:
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, datetime):
            return value.timestamp()
        if isinstance(value, str):
            try:
                return float(value)
            except ValueError:
                try:
                    return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
                except ValueError:
                    return 0.0
        return 0.0
