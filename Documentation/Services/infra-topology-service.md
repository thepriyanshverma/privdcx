# Service Documentation: Infra Topology Service (`infra-topology`)

## Purpose
Event-driven graph engine for infrastructure connectivity.

It consumes lifecycle events from Kafka topic `infra.topology.events` and maintains per-workspace topology graphs in-memory (NetworkX) plus persistence in MongoDB.

## Event Types
- `DEVICE_CREATED`
- `DEVICE_DELETED`
- `DEVICE_MOVED`
- `RACK_CREATED`
- `RACK_DELETED`
- `FACILITY_CREATED`

## Graph Model
Node types:
- `device`
- `rack`
- `hall`
- `facility`
- `switch`
- `pdu`
- `cooling_unit`

Edge types:
- `network`
- `power`
- `cooling`
- `structural`

## APIs
- `GET /api/v1/topology/{workspace_id}`
- `GET /api/v1/topology/neighbors/{entity_id}?workspace_id=...`
- `GET /api/v1/topology/path?workspace_id=...&from_id=...&to_id=...&edge_type=...`
- `POST /api/v1/topology/edges`

## Storage
MongoDB collections:
- `topology_nodes`
- `topology_edges`

## Integration
- Producers: `infra-device`, `infra-rack`, `infra-facility` publish topology events to Kafka.
- Runtime consumes the same topology event stream to maintain propagation adjacency without direct topology-service calls.
