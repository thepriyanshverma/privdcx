import asyncio
from datetime import datetime
from typing import Any, Optional

import networkx as nx

from app.clients.mongo_store import TopologyMongoStore
from app.schemas.topology import EdgeUpsertRequest, TopologyEvent


class TopologyGraphStore:
    def __init__(self, mongo_store: TopologyMongoStore):
        self.mongo = mongo_store
        self.graphs: dict[str, nx.MultiDiGraph] = {}
        self._lock = asyncio.Lock()

    async def initialize(self) -> None:
        await self.mongo.ensure_indexes()
        for workspace_id in await self.mongo.list_workspaces():
            await self._load_workspace_graph(workspace_id)

    async def _get_graph(self, workspace_id: str) -> nx.MultiDiGraph:
        if workspace_id not in self.graphs:
            await self._load_workspace_graph(workspace_id)
        return self.graphs[workspace_id]

    async def _load_workspace_graph(self, workspace_id: str) -> None:
        graph = nx.MultiDiGraph()
        for node in await self.mongo.list_nodes(workspace_id):
            graph.add_node(node["id"], node_type=node.get("node_type"), **(node.get("attributes") or {}))
        for edge in await self.mongo.list_edges(workspace_id):
            graph.add_edge(
                edge["from_id"],
                edge["to_id"],
                key=edge["type"],
                type=edge["type"],
                capacity=edge.get("capacity"),
                latency=edge.get("latency"),
                status=edge.get("status", "active"),
                **(edge.get("attributes") or {}),
            )
        self.graphs[workspace_id] = graph

    async def apply_event(self, raw_event: dict[str, Any]) -> None:
        event = TopologyEvent.model_validate(raw_event)
        async with self._lock:
            graph = await self._get_graph(event.workspace_id)
            await self._apply_event_locked(graph, event)

    async def _apply_event_locked(self, graph: nx.MultiDiGraph, event: TopologyEvent) -> None:
        event_type = event.event.upper()
        workspace_id = event.workspace_id
        metadata = event.metadata or {}

        if event_type == "FACILITY_CREATED":
            if event.facility_id:
                await self._upsert_node(
                    graph,
                    workspace_id=workspace_id,
                    node_id=event.facility_id,
                    node_type="facility",
                    attributes={"org_id": event.org_id},
                )
            return

        if event_type == "RACK_CREATED":
            if not event.rack_id:
                return
            await self._upsert_node(
                graph,
                workspace_id=workspace_id,
                node_id=event.rack_id,
                node_type="rack",
                attributes={
                    "facility_id": event.facility_id,
                    "hall_id": event.hall_id,
                    "zone_id": event.zone_id,
                    "org_id": event.org_id,
                },
            )
            if event.hall_id:
                await self._upsert_node(graph, workspace_id=workspace_id, node_id=event.hall_id, node_type="hall")
                await self._upsert_edge(
                    graph,
                    workspace_id=workspace_id,
                    from_id=event.rack_id,
                    to_id=event.hall_id,
                    edge_type="structural",
                )
            if event.facility_id:
                await self._upsert_node(graph, workspace_id=workspace_id, node_id=event.facility_id, node_type="facility")
                await self._upsert_edge(
                    graph,
                    workspace_id=workspace_id,
                    from_id=event.rack_id,
                    to_id=event.facility_id,
                    edge_type="structural",
                )
            return

        if event_type == "RACK_DELETED":
            if event.rack_id:
                await self._delete_node(graph, workspace_id=workspace_id, node_id=event.rack_id)
            return

        if event_type == "DEVICE_CREATED":
            if not event.device_id:
                return
            await self._upsert_node(
                graph,
                workspace_id=workspace_id,
                node_id=event.device_id,
                node_type="device",
                attributes={
                    "device_type": event.device_type,
                    "org_id": event.org_id,
                },
            )
            if event.rack_id:
                await self._upsert_node(graph, workspace_id=workspace_id, node_id=event.rack_id, node_type="rack")
                await self._upsert_edge(
                    graph,
                    workspace_id=workspace_id,
                    from_id=event.device_id,
                    to_id=event.rack_id,
                    edge_type="structural",
                )
                await self._apply_rack_cable_template(graph, event=event)
            return

        if event_type == "DEVICE_MOVED":
            if not event.device_id:
                return
            await self._upsert_node(
                graph,
                workspace_id=workspace_id,
                node_id=event.device_id,
                node_type="device",
                attributes={"device_type": event.device_type, "org_id": event.org_id},
            )
            await self._clear_device_structural_rack_edges(graph, workspace_id=workspace_id, device_id=event.device_id)
            if event.rack_id:
                await self._upsert_node(graph, workspace_id=workspace_id, node_id=event.rack_id, node_type="rack")
                await self._upsert_edge(
                    graph,
                    workspace_id=workspace_id,
                    from_id=event.device_id,
                    to_id=event.rack_id,
                    edge_type="structural",
                )
                await self._apply_rack_cable_template(graph, event=event)
            return

        if event_type == "DEVICE_DELETED":
            if event.device_id:
                await self._delete_node(graph, workspace_id=workspace_id, node_id=event.device_id)
            return

    async def _apply_rack_cable_template(self, graph: nx.MultiDiGraph, *, event: TopologyEvent) -> None:
        if not event.rack_id:
            return
        metadata = event.metadata or {}
        workspace_id = event.workspace_id

        tor_id = str(metadata.get("tor_switch_id") or f"TOR::{event.rack_id}")
        spine_id = str(metadata.get("spine_switch_id") or f"SPINE::{workspace_id}")
        pdu_id = str(metadata.get("pdu_id") or f"PDU::{event.rack_id}")
        cooling_id = str(metadata.get("cooling_unit_id") or metadata.get("cooling_zone_id") or f"COOLING::{event.rack_id}")

        await self._upsert_node(graph, workspace_id=workspace_id, node_id=tor_id, node_type="switch")
        await self._upsert_node(graph, workspace_id=workspace_id, node_id=spine_id, node_type="switch")
        await self._upsert_node(graph, workspace_id=workspace_id, node_id=pdu_id, node_type="pdu")
        await self._upsert_node(graph, workspace_id=workspace_id, node_id=cooling_id, node_type="cooling_unit")

        if event.device_id:
            await self._upsert_edge(
                graph,
                workspace_id=workspace_id,
                from_id=event.device_id,
                to_id=tor_id,
                edge_type="network",
                capacity=float(metadata.get("device_link_gbps", 100.0)),
                latency=float(metadata.get("device_link_latency_ms", 0.1)),
            )
        await self._upsert_edge(
            graph,
            workspace_id=workspace_id,
            from_id=tor_id,
            to_id=spine_id,
            edge_type="network",
            capacity=float(metadata.get("tor_uplink_gbps", 400.0)),
            latency=float(metadata.get("tor_uplink_latency_ms", 0.2)),
        )
        await self._upsert_edge(
            graph,
            workspace_id=workspace_id,
            from_id=event.rack_id,
            to_id=pdu_id,
            edge_type="power",
            capacity=float(metadata.get("rack_power_kw", 20.0)),
        )
        await self._upsert_edge(
            graph,
            workspace_id=workspace_id,
            from_id=event.rack_id,
            to_id=cooling_id,
            edge_type="cooling",
            capacity=float(metadata.get("cooling_capacity_kw", 25.0)),
        )

    async def upsert_manual_edge(self, req: EdgeUpsertRequest) -> None:
        async with self._lock:
            graph = await self._get_graph(req.workspace_id)
            if req.from_node_type:
                await self._upsert_node(
                    graph,
                    workspace_id=req.workspace_id,
                    node_id=req.from_id,
                    node_type=req.from_node_type,
                )
            if req.to_node_type:
                await self._upsert_node(
                    graph,
                    workspace_id=req.workspace_id,
                    node_id=req.to_id,
                    node_type=req.to_node_type,
                )
            await self._upsert_edge(
                graph,
                workspace_id=req.workspace_id,
                from_id=req.from_id,
                to_id=req.to_id,
                edge_type=req.type,
                capacity=req.capacity,
                latency=req.latency,
                status=req.status,
                attributes=req.metadata,
            )

    async def get_topology(self, workspace_id: str) -> dict[str, Any]:
        graph = await self._get_graph(workspace_id)
        nodes = [
            {
                "id": str(node_id),
                "node_type": data.get("node_type"),
                "attributes": {k: v for k, v in data.items() if k != "node_type"},
            }
            for node_id, data in graph.nodes(data=True)
        ]
        edges = []
        for from_id, to_id, key, data in graph.edges(keys=True, data=True):
            attrs = {k: v for k, v in data.items() if k not in {"type", "capacity", "latency", "status"}}
            edges.append(
                {
                    "from_id": str(from_id),
                    "to_id": str(to_id),
                    "type": str(data.get("type", key)),
                    "capacity": data.get("capacity"),
                    "latency": data.get("latency"),
                    "status": data.get("status", "active"),
                    "attributes": attrs,
                }
            )
        return {
            "workspace_id": workspace_id,
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "node_count": len(nodes),
            "edge_count": len(edges),
            "nodes": nodes,
            "edges": edges,
        }

    async def get_neighbors(self, *, workspace_id: str, entity_id: str) -> list[dict[str, Any]]:
        graph = await self._get_graph(workspace_id)
        if entity_id not in graph:
            return []
        neighbor_ids = set(graph.predecessors(entity_id)) | set(graph.neighbors(entity_id))
        items = []
        for neighbor_id in neighbor_ids:
            node_data = graph.nodes.get(neighbor_id, {})
            items.append(
                {
                    "id": str(neighbor_id),
                    "node_type": node_data.get("node_type"),
                    "attributes": {k: v for k, v in node_data.items() if k != "node_type"},
                }
            )
        return items

    async def get_path(
        self,
        *,
        workspace_id: str,
        from_id: str,
        to_id: str,
        edge_type: Optional[str] = None,
    ) -> dict[str, Any]:
        graph = await self._get_graph(workspace_id)
        if from_id not in graph or to_id not in graph:
            return {"path": [], "hop_count": 0}

        projection = nx.DiGraph()
        for node_id, data in graph.nodes(data=True):
            projection.add_node(node_id, **data)

        for source, target, _, data in graph.edges(keys=True, data=True):
            if edge_type and data.get("type") != edge_type:
                continue
            weight = float(data.get("latency") or 1.0)
            if projection.has_edge(source, target):
                projection[source][target]["weight"] = min(projection[source][target]["weight"], weight)
            else:
                projection.add_edge(source, target, weight=weight)

        try:
            path = nx.shortest_path(projection, source=from_id, target=to_id, weight="weight")
            total_latency = 0.0
            for idx in range(len(path) - 1):
                src = path[idx]
                dst = path[idx + 1]
                total_latency += float(projection[src][dst].get("weight", 1.0))
            return {
                "path": [str(node) for node in path],
                "hop_count": max(len(path) - 1, 0),
                "total_latency": round(total_latency, 4),
            }
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return {"path": [], "hop_count": 0, "total_latency": 0.0}

    async def get_blast_radius(self, *, workspace_id: str, entity_id: str, depth: int = 2) -> dict[str, Any]:
        graph = await self._get_graph(workspace_id)
        if entity_id not in graph:
            return {
                "workspace_id": workspace_id,
                "entity_id": entity_id,
                "depth": depth,
                "directly_connected": [],
                "indirectly_affected": [],
                "propagation_paths": [],
            }

        undirected = graph.to_undirected()
        direct_nodes = set(nx.single_source_shortest_path_length(undirected, entity_id, cutoff=1).keys())
        direct_nodes.discard(entity_id)

        expanded_nodes = set(nx.single_source_shortest_path_length(undirected, entity_id, cutoff=max(depth, 1)).keys())
        expanded_nodes.discard(entity_id)
        indirect_nodes = expanded_nodes - direct_nodes

        propagation_paths: list[dict[str, Any]] = []
        for target in sorted(expanded_nodes):
            try:
                path = nx.shortest_path(undirected, source=entity_id, target=target)
                propagation_paths.append({"target_id": target, "path": path, "hop_count": max(len(path) - 1, 0)})
            except (nx.NetworkXNoPath, nx.NodeNotFound):
                continue

        def build_node_payload(node_id: str) -> dict[str, Any]:
            node_data = graph.nodes.get(node_id, {})
            return {
                "id": str(node_id),
                "node_type": node_data.get("node_type"),
                "attributes": {k: v for k, v in node_data.items() if k != "node_type"},
            }

        return {
            "workspace_id": workspace_id,
            "entity_id": entity_id,
            "depth": depth,
            "directly_connected": [build_node_payload(node_id) for node_id in sorted(direct_nodes)],
            "indirectly_affected": [build_node_payload(node_id) for node_id in sorted(indirect_nodes)],
            "propagation_paths": propagation_paths,
        }

    async def _upsert_node(
        self,
        graph: nx.MultiDiGraph,
        *,
        workspace_id: str,
        node_id: str,
        node_type: str,
        attributes: Optional[dict[str, Any]] = None,
    ) -> None:
        graph.add_node(node_id, node_type=node_type, **(attributes or {}))
        await self.mongo.upsert_node(
            workspace_id=workspace_id,
            node_id=node_id,
            node_type=node_type,
            attributes=attributes or {},
        )

    async def _upsert_edge(
        self,
        graph: nx.MultiDiGraph,
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
        graph.add_edge(
            from_id,
            to_id,
            key=edge_type,
            type=edge_type,
            capacity=capacity,
            latency=latency,
            status=status,
            **(attributes or {}),
        )
        await self.mongo.upsert_edge(
            workspace_id=workspace_id,
            from_id=from_id,
            to_id=to_id,
            edge_type=edge_type,
            capacity=capacity,
            latency=latency,
            status=status,
            attributes=attributes or {},
        )

    async def _delete_node(self, graph: nx.MultiDiGraph, *, workspace_id: str, node_id: str) -> None:
        if node_id in graph:
            graph.remove_node(node_id)
        await self.mongo.delete_node(workspace_id=workspace_id, node_id=node_id)

    async def _clear_device_structural_rack_edges(self, graph: nx.MultiDiGraph, *, workspace_id: str, device_id: str) -> None:
        if device_id not in graph:
            return
        removable: list[tuple[str, str, str]] = []
        for source, target, key, data in graph.out_edges(device_id, keys=True, data=True):
            if data.get("type") != "structural":
                continue
            target_type = graph.nodes.get(target, {}).get("node_type")
            if target_type == "rack":
                removable.append((source, target, key))
        for source, target, key in removable:
            graph.remove_edge(source, target, key=key)
            await self.mongo.delete_edge(
                workspace_id=workspace_id,
                from_id=source,
                to_id=target,
                edge_type=key,
            )
