import os
import time
from typing import Any, Optional

from motor.motor_asyncio import AsyncIOMotorClient


class TopologyMongoStore:
    def __init__(self):
        mongo_url = os.getenv("MONGODB_URL", "mongodb://infraos:infraos_password@mongodb:27017")
        database = os.getenv("TOPOLOGY_MONGODB_DATABASE", "infraos_topology")
        self.client = AsyncIOMotorClient(mongo_url)
        self.db = self.client[database]
        self.nodes = self.db.topology_nodes
        self.edges = self.db.topology_edges

    async def ensure_indexes(self) -> None:
        await self.nodes.create_index([("workspace_id", 1), ("node_id", 1)], unique=True, background=True)
        await self.nodes.create_index([("workspace_id", 1), ("node_type", 1)], background=True)
        await self.edges.create_index(
            [("workspace_id", 1), ("from_id", 1), ("to_id", 1), ("edge_type", 1)],
            unique=True,
            background=True,
        )
        await self.edges.create_index([("workspace_id", 1), ("edge_type", 1)], background=True)

    async def upsert_node(self, *, workspace_id: str, node_id: str, node_type: str, attributes: Optional[dict[str, Any]] = None) -> None:
        now = time.time()
        doc = {
            "workspace_id": workspace_id,
            "node_id": node_id,
            "node_type": node_type,
            "attributes": attributes or {},
            "updated_at": now,
        }
        await self.nodes.update_one(
            {"workspace_id": workspace_id, "node_id": node_id},
            {"$set": doc},
            upsert=True,
        )

    async def delete_node(self, *, workspace_id: str, node_id: str) -> None:
        await self.nodes.delete_one({"workspace_id": workspace_id, "node_id": node_id})
        await self.edges.delete_many(
            {
                "workspace_id": workspace_id,
                "$or": [{"from_id": node_id}, {"to_id": node_id}],
            }
        )

    async def upsert_edge(
        self,
        *,
        workspace_id: str,
        from_id: str,
        to_id: str,
        edge_type: str,
        capacity: Optional[float] = None,
        latency: Optional[float] = None,
        status: str = "active",
        attributes: Optional[dict[str, Any]] = None,
    ) -> None:
        now = time.time()
        doc = {
            "workspace_id": workspace_id,
            "from_id": from_id,
            "to_id": to_id,
            "edge_type": edge_type,
            "capacity": capacity,
            "latency": latency,
            "status": status,
            "attributes": attributes or {},
            "updated_at": now,
        }
        await self.edges.update_one(
            {
                "workspace_id": workspace_id,
                "from_id": from_id,
                "to_id": to_id,
                "edge_type": edge_type,
            },
            {"$set": doc},
            upsert=True,
        )

    async def delete_edge(self, *, workspace_id: str, from_id: str, to_id: str, edge_type: str) -> None:
        await self.edges.delete_one(
            {
                "workspace_id": workspace_id,
                "from_id": from_id,
                "to_id": to_id,
                "edge_type": edge_type,
            }
        )

    async def list_nodes(self, workspace_id: str) -> list[dict[str, Any]]:
        docs = await self.nodes.find({"workspace_id": workspace_id}).to_list(length=None)
        return [self._normalize_node_doc(doc) for doc in docs]

    async def list_edges(self, workspace_id: str) -> list[dict[str, Any]]:
        docs = await self.edges.find({"workspace_id": workspace_id}).to_list(length=None)
        return [self._normalize_edge_doc(doc) for doc in docs]

    async def list_workspaces(self) -> list[str]:
        return await self.nodes.distinct("workspace_id")

    async def close(self) -> None:
        self.client.close()

    @staticmethod
    def _normalize_node_doc(doc: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": str(doc.get("node_id")),
            "node_type": doc.get("node_type"),
            "attributes": doc.get("attributes") or {},
        }

    @staticmethod
    def _normalize_edge_doc(doc: dict[str, Any]) -> dict[str, Any]:
        return {
            "from_id": str(doc.get("from_id")),
            "to_id": str(doc.get("to_id")),
            "type": doc.get("edge_type"),
            "capacity": doc.get("capacity"),
            "latency": doc.get("latency"),
            "status": doc.get("status", "active"),
            "attributes": doc.get("attributes") or {},
        }
