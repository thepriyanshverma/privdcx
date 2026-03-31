# DesignDC (InfraOS) - Comprehensive Technical Documentation

## 1. Project Overview

**DesignDC** (also known internally as the **InfraOS Platform**) is an advanced digital twin and operational control plane application designed to simulate and manage physical infrastructure, primarily data centers. It provides operators with a sophisticated structural hierarchy ranging from high-level Organizational Workspaces down to individual physical servers within Data Hall racks.

The platform provides:
- **3D Digital Twin capabilities**: Real-time rendering of physical spaces using WebGL/React-Three.
- **A Data-Driven Control Plane**: Telemetry processing, infrastructure topology visualization using force-directed graphs, and simulated load testing.
- **Live Observability**: Real-time streaming metrics, automated alerting algorithms, and persistent architectural modeling.

---

## 2. Platform Architecture

The system enforces a strict distributed **edge-gateway microservices architecture** supported by comprehensive data-persistence layers.

### 2.1 The Unified Gateway (`infra-gateway`)
All client interactions communicate first with the centralized API Gateway (FastAPI). 
- **Reverse Proxy**: Standard requests route through `/api/v1/{service_key}/*` and proxy asynchronously to individual microservices.
- **Aggregation Layer**: Endpoints like `/api/v1/dashboard/overview` and `/api/v1/timeline` orchestrate data from multiple downstream services (such as pulling alert metrics and live telemetry streams independently) to achieve sub-second latency for UI dashboard clients.
- **WebSocket Hub**: The gateway provides a central persistent route (`/ws/infra-state`) bridging the user interface with asynchronous internal RabbitMQ streams for immediate browser broadcasts.
- **Auth Filtering**: Global JWT injection (`X-Tenant-Id`, `X-Workspace-Id`) prevents individual services from executing direct auth processing, locking off unverified traffic. 

### 2.2 Microservices ecosystem
The core application comprises highly decoupled Python-based FastAPI services, typically exposing standard HTTP endpoints and acting on asynchronous event-buses.

1. **`infra-tenant`**: Manages Organizations, Subscriptions, Logical Space, Workspaces, and user identities.
2. **`infra-facility`**: Contains logical rules for physical buildings, Data Halls, Zones, and Aisles. 
3. **`infra-rack`**: Manages rack enclosure attributes (U-space limitations, power budgets).
4. **`infra-device`**: Manages granular IT assets (Servers, Switches, Smart PDUs). 
5. **`infra-simulation`**: Controls digital twin data-center load simulation, persisting states to MongoDB.
6. **`infra-metrics-stream`**: An aggregation service polling raw datasets from Prometheus and rebroadcasting operational metrics onto Kafka.
7. **`infra-alert-engine`**: Analyzes incoming topology telemetry to produce alerts; relies heavily on RabbitMQ and Redis. 
8. **`infra-runtime`**: Standard coordination runtime synchronizing simulation environments.
9. **`infra-topology`**: Constructs and streams topological graphs, mapping relationships between infrastructure networks continuously into MongoDB.
10. **`infra-invitation`**: Specific flow management for handling multi-tenant user access invites. 
11. **`infra-testingflow`**: Integrates and validates test flows primarily oriented around browser-facing simulations.

---

## 3. Technology Stack

### Frontend Control Plane
Located in the `frontend-control-plane/` directory:
- **Framework**: React 19 + TypeScript / Vite (ESModules).
- **3D Visualization**: `three.js`, `@react-three/fiber`, `@react-three/drei` for real-time WebGL rendering of aisles and facilities.
- **Network Mapping**: `d3` utilities and `react-force-graph-2d` for interactive topological data maps.

### Backend Microservices
Located across the `services/` directory:
- **Framework**: Python 3.9+ with FastAPI (with high-performance asynchronous `asyncpg` bindings).
- **Security Check**: Enforces global 401 handling where unauthenticated UI requests are dynamically caught by global reducers avoiding "Zombie Sessions."

### Persistence and Brokers
Fully containerized via `docker-compose` dependencies:
- **PostgreSQL**: The primary relational store (Auth, Workspaces, Facility blueprints). 
- **MongoDB**: Used specifically for high-speed flexible documents (Topology relations, Live simulation models, Alert history telemetry).
- **Redis**: Low-latency caching engine and microservice state orchestration.
- **RabbitMQ**: AMQP-based message broker for WebSockets and specific inter-service triggers.
- **Kafka & Zookeeper**: Distributed event streaming platform. All topological topology changes (via topic `infra.topology.events`) and metrics stream flows through Kafka.
- **Prometheus & Grafana**: Time-series observability tools deployed locally to visualize hardware scraping output.

---

## 4. Tenant and Spatial Hierarchy

The platform relies on a normalized taxonomy ensuring clear resource management without overlap. 

1. **Organization** (`infra-tenant`): The primary billing and administrative unit.
    - **Subscription**: Financial billing profiles tracking infrastructure consumption.
    - **Workspace**: A logical application group (e.g. "US-West Region"). Workspaces feature persistent session states (UI stickiness logic ensures returning operators default to their previous view).
        - **Logical Space**: A partitioned, virtual chunk of limits inside a workspace.
        - **Facility** (`infra-facility`): Real-world physical buildings.
            - **Data Hall**: Dedicated rooms inside the facility containing active capacity.
                - **Zone**: Groupings (like a specific "Cold Aisle Containment").
                    - **Aisle**: Physical rack rows.
                        - **Rack** (`infra-rack`): IT enclosures calculating dimensional U-space.
                            - **Device** (`infra-device`): Core IT hardware implementations.

---

## 5. Typical Operational Data Flow

1. **Authentication**: Client hits `infra-gateway`, logging into `infra-tenant`. A JWT returns embedding the user's `last_workspace_id`.
2. **Context Resolution**: The React UI decodes the token, sets global state context, and connects to the `/ws/infra-state` WebSocket stream for live feedback. 
3. **Control Flow**: Operator changes an infrastructure setting (e.g., adding a new Server to a Rack). The React frontend hits the Gateway Proxy passing the JWT; the Gateway assigns headers and directs the HTTP context to `infra-device`.
4. **Event Trigger**: `infra-device` updates PostgreSQL and simultaneously propagates a high-speed event to Kafka's `infra.topology.events` topic. 
5. **Observability Sync**: 
   - `infra-topology` processes the Kafka event and redraws the relationships. 
   - `infra-metrics-stream` evaluates capacity load limits via Prometheus. 
   - Output events get routed through RabbitMQ back into the WebSocket stream. The dashboard visually highlights the real-time simulation metrics within milliseconds.
   
---

## 6. Developing Locally

- Initial monolithic dependencies live in `backend/` for rapid prototyping using standard `uvicorn`.
- The production replica lies within `docker-compose.yml`, which auto-builds **14+ bespoke containers** and handles networking routes through Docker internals.
- When running locally, the unified gateway points heavily toward `localhost:8000` while React runs under port `3000` via its specific Docker instance. 
