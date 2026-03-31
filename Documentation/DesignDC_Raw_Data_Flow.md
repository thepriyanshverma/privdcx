# DesignDC: Raw Data Travel & Lifecycle

This document tracks the technical "Life of a Packet" across the InfraOS microservices. It details exactly how raw data is structured, where it is stored, and how it travels over the wire.

---

## 1. Summary of Protocols & Ports

| Link | Protocol | Format | Description |
| :--- | :--- | :--- | :--- |
| **Frontend ↔ Gateway** | HTTP/HTTPS | JSON | Primary API & Command interface. |
| **Frontend ↔ Gateway** | WebSockets | JSON | Real-time Alert & Metric broadcasts. |
| **Gateway ↔ Services** | HTTP | JSON | Internal proxying and data aggregation. |
| **Services ↔ Postgres** | TCP (5432) | Binary | Relational persistence (SQL). |
| **Metrics ↔ Prometheus** | HTTP (9090) | JSON | Polling raw time-series snapshots. |
| **Metrics ↔ Kafka** | TCP (9092) | Protobuf/JSON | High-throughput event streaming. |
| **Alerts ↔ RabbitMQ** | AMQP (5672) | JSON | Fan-out messaging for UI push. |
| **Topology ↔ MongoDB** | TCP (27017) | BSON | Unstructured graph/document storage. |

---

## 2. The Metric Lifecycle (Real-time Telemetry)

### Step A: Scrape (Prometheus JSON)
The `infra-metrics-stream` worker polls Prometheus. 
**Raw Input snippet:**
```json
{
  "metric": {
    "__name__": "rack_power_kw",
    "facility_id": "fac-001",
    "rack_id": "rack-alpha",
    "workspace_id": "ws-west-1"
  },
  "value": [1679812345.67, "12.45"]
}
```

### Step B: Normalize (Kafka Event)
The worker converts the scan into a standard `InfraMetricEvent` and publishes to Kafka topic `infra.metrics.stream`.
**Raw Kafka Payload:**
```json
{
  "version": "v1",
  "timestamp": 1679812345.67,
  "metric_name": "rack_power_kw",
  "value": 12.45,
  "tenant_id": "org-prime",
  "workspace_id": "ws-west-1",
  "facility_id": "fac-001",
  "rack_id": "rack-alpha",
  "labels": {}
}
```

---

## 3. The Topology Lifecycle (Network Graphs)

### Step A: Update Event
When a device is added/moved in `infra-device`, it emits a topology change event.
**Topic:** `infra.topology.events`
```json
{
  "event": "node_upsert",
  "workspace_id": "ws-west-1",
  "device_id": "srv-99",
  "device_type": "server",
  "metadata": {
    "u_position": 12,
    "model": "PowerEdge-R740"
  },
  "timestamp": 1679812400.0
}
```

### Step B: Graph Representation
`infra-topology` consumes the event and updates the graph in MongoDB. When the UI requests the map, it receives a D3-compatible format.
**Endpoint:** `GET /api/v1/topology/{workspace_id}`
```json
{
  "nodes": [
    { "id": "srv-99", "node_type": "device", "attributes": { "model": "..." } }
  ],
  "edges": [
    { "from_id": "srv-99", "to_id": "sw-core-01", "type": "network", "latency": 0.2 }
  ]
}
```

---

## 4. The Alert Lifecycle (Reactive Path)

1. **Detection**: `infra-alert-engine` consumes from Kafka. 
2. **Persistence**: The alert is saved to MongoDB (history) and Redis (current state).
3. **Dispatch**: A message is pushed to RabbitMQ exchange `infra.alerts`.
   ```json
   {
     "id": "alert-abc-123",
     "severity": "CRITICAL",
     "entity_id": "rack-alpha",
     "description": "Temperature exceeded 35°C threshold",
     "metric_value": 38.2
   }
   ```
4. **WebSocket Push**: `infra-gateway` picks up the RabbitMQ message and relays it to the connected frontend client via WebSocket on `/ws/infra-state`.

---

## 5. Aggregated Dashboard Data

To minimize Frontend load, the Gateway's `DataAggregator` creates a composite view by hitting 5+ internal APIs in parallel.
**Endpoint:** `GET /api/v1/dashboard/overview`
**Aggregated Schema:**
```json
{
  "facilities": [...],
  "racks": [...],
  "metrics": {
    "grid_load_mw": 4.5,
    "avg_inlet_temp_c": 22.1,
    "avg_risk_index": 0.08
  },
  "alert_status": {
    "active_critical": 2,
    "active_warning": 5
  },
  "runtime_snapshot": { ... }
}
```
