import os
import time
from typing import Any, Optional

import structlog
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorCollection

from app.schemas.alerts import AlertSeverity, InfraAlertEvent


class MongoAlertStore:
    def __init__(self):
        mongo_url = os.getenv("MONGODB_URL") or os.getenv("MONGO_URL") or "mongodb://infraos:infraos_password@mongodb:27017"
        self.db_name = os.getenv("MONGODB_DATABASE", "infraos_telemetry")
        self.collection_name = os.getenv("MONGODB_ALERTS_COLLECTION", "alerts")
        self.max_limit = int(os.getenv("ALERTS_QUERY_MAX_LIMIT", "500"))
        self.client = AsyncIOMotorClient(mongo_url)
        self.collection: AsyncIOMotorCollection = self.client[self.db_name][self.collection_name]
        self.logger = structlog.get_logger("infra-alert-engine.mongo")

    async def ensure_indexes(self) -> None:
        await self.collection.create_index([("timestamp", -1)], background=True)
        await self.collection.create_index([("workspace_id", 1)], background=True)
        await self.collection.create_index([("entity_id", 1)], background=True)
        await self.collection.create_index([("severity", 1)], background=True)

    async def insert_alert(self, alert: InfraAlertEvent) -> str:
        now = time.time()
        doc = {
            "timestamp": float(alert.timestamp),
            "tenant_id": alert.tenant_id,
            "workspace_id": alert.workspace_id,
            "facility_id": alert.facility_id,
            "entity_id": alert.entity_id,
            "entity_type": alert.entity_type.value,
            "severity": alert.severity.value,
            "rule_id": alert.rule_id,
            "metric_name": alert.metric_name,
            "metric_value": float(alert.metric_value),
            "description": alert.description,
            "trace_id": alert.trace_id,
            "operator": alert.operator,
            "threshold": alert.threshold,
            "deviation_pct": alert.deviation_pct,
            "queue_time": alert.queue_time,
            "raw_metric_event": alert.raw_metric_event or {},
            "status": "ACTIVE",
            "acknowledged": False,
            "created_at": now,
            "updated_at": now,
        }
        result = await self.collection.insert_one(doc)
        return str(result.inserted_id)

    async def list_alerts(
        self,
        *,
        workspace_id: str,
        severity: Optional[AlertSeverity],
        entity_id: Optional[str],
        limit: int,
    ) -> list[dict[str, Any]]:
        filters: dict[str, Any] = {"workspace_id": workspace_id}
        if severity:
            filters["severity"] = severity.value
        if entity_id:
            filters["entity_id"] = entity_id

        safe_limit = max(1, min(limit, self.max_limit))
        cursor = self.collection.find(filters).sort("timestamp", -1).limit(safe_limit)
        docs = await cursor.to_list(length=safe_limit)
        return [self._serialize_doc(doc) for doc in docs]

    async def acknowledge_alert(self, alert_id: str) -> bool:
        object_id = self._to_object_id(alert_id)
        if object_id is None:
            return False
        result = await self.collection.update_one(
            {"_id": object_id},
            {"$set": {"acknowledged": True, "updated_at": time.time()}},
        )
        return result.matched_count > 0

    async def resolve_alert(self, alert_id: str) -> bool:
        object_id = self._to_object_id(alert_id)
        if object_id is None:
            return False
        result = await self.collection.update_one(
            {"_id": object_id},
            {"$set": {"acknowledged": True, "status": "RESOLVED", "updated_at": time.time()}},
        )
        return result.matched_count > 0

    async def close(self) -> None:
        self.client.close()

    @staticmethod
    def _to_object_id(alert_id: str) -> Optional[ObjectId]:
        try:
            return ObjectId(alert_id)
        except Exception:
            return None

    @staticmethod
    def _serialize_doc(doc: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": str(doc.get("_id")),
            "timestamp": float(doc.get("timestamp", 0.0)),
            "created_at": doc.get("created_at"),
            "updated_at": doc.get("updated_at"),
            "tenant_id": doc.get("tenant_id"),
            "workspace_id": doc.get("workspace_id"),
            "facility_id": doc.get("facility_id"),
            "entity_id": doc.get("entity_id"),
            "entity_type": doc.get("entity_type"),
            "severity": doc.get("severity"),
            "rule_id": doc.get("rule_id"),
            "metric_name": doc.get("metric_name"),
            "metric_value": doc.get("metric_value"),
            "description": doc.get("description"),
            "trace_id": doc.get("trace_id"),
            "operator": doc.get("operator"),
            "threshold": doc.get("threshold"),
            "deviation_pct": doc.get("deviation_pct"),
            "queue_time": doc.get("queue_time"),
            "raw_metric_event": doc.get("raw_metric_event") or {},
            "status": doc.get("status", "ACTIVE"),
            "acknowledged": bool(doc.get("acknowledged", False)),
        }
