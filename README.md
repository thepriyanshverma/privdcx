<img width="1919" height="935" alt="Screenshot 2026-03-31 160550" src="https://github.com/user-attachments/assets/b38d62d3-5f4b-4af3-9a09-d982c0c78868" /># 🌐 DesignDC (InfraOS) - Advanced Digital Twin & Infrastructure Control Plane

**DesignDC** is a production-grade, distributed "Operating System" for large-scale physical infrastructure. Architected as a high-concurrency 14-service ecosystem, it provides a 10-tier spatial hierarchy mapping, real-time telemetry aggregation, and asynchronous simulation engines for Power, Thermal, and Network dynamics.

---

## 🏛️ The 10-Tier Infrastructure Hierarchy
The platform enforces a strict, nested taxonomy to manage massive-scale infrastructure without resource overlap or data collisions.

| Level | Unit | Scope | Service |
| :--- | :--- | :--- | :--- |
| **L1** | **Organization** | Primary administrative & billing entity | `infra-tenant` |
| **L2** | **Subscription** | Resource quotas and financial profiles | `infra-tenant` |
| **L3** | **Workspace** | Logical environment (e.g., "EU-Central Cluster") | `infra-tenant` |
| **L4** | **Logical Space** | Virtual capacity "slice" assigned to users | `infra-tenant` |
| **L5** | **Facility** | Physical building/campus blueprint | `infra-facility` |
| **L6** | **Data Hall** | Dedicated room with isolated power/cooling | `infra-facility` |
| **L7** | **Zone** | Partitions (e.g., Cold Aisle Containment) | `infra-facility` |
| **L8** | **Aisle** | Physical row of server enclosures | `infra-facility` |
| **L9** | **Rack** | IT enclosure tracking U-space & Power Budget | `infra-rack` |
| **L10** | **Device** | Individual IT assets (Servers, Switches, Smart PDUs) | `infra-device` |

---

## 🏗️ Distributed Microservices Ecosystem
Architected with **FastAPI** and **AsyncIO**, the platform consists of 14+ bespoke services communicating via a hybrid of REST, WebSockets, and Event-Driven streams.

### Core Control Plane Services:
- **`infra-gateway`**: The unified entry point. Implements the **Aggregator Pattern** to merge real-time metrics from `infra-metrics-stream`, alert states from `infra-alert-engine`, and session context from `infra-tenant` into a single sub-second dashboard payload.
- **`infra-simulation`**: Houses the asynchronous simulation loops. Driven by three core engines:
    - **Power Engine**: Real-time load calculations and phase balancing.
    - **Thermal Engine**: CFD-lite modeling for inlet/exhaust temperature gradients.
    - **Network Engine**: Topology-aware connectivity and latency simulation.
- **`infra-topology`**: Reconstructs infrastructure relationships continuously, streaming topological changes via **Kafka** (`infra.topology.events`).
- **`infra-metrics-stream`**: An aggregation layer that scrapes **Prometheus** exporters and rebroadcasts normalized telemetry onto the Kafka bus.
- **`infra-alert-engine`**: A high-performance analyzer that uses **Redis Distributed Locking** to prevent alert-storms and ensure deduplicated event reporting.

---

## ⚙️ Advanced Engineering Patterns

### 1. Persistent Workspace Context ("Stickiness")
The platform implements "State Stickiness" for operational continuity. User profiles track the `last_workspace_id`. On session restoration, the UI automatically resolves the operational context, bypassing the workspace selector for a seamless "Resume" experience.

### 2. Real-Time Telemetry Pipeline (Prometheus to UI)
`Prometheus Exporters -> Metrics-Stream -> Kafka (Event Bus) -> Alert Engine -> RabbitMQ -> WebSocket Hub -> UI (Live)`
This high-performance pipeline ensures that hardware failures and metrics spikes are reflected in the global control plane in under **100ms**.

### 3. Non-Blocking Database Architecture
Leveraging **`asyncpg`** for non-blocking PostgreSQL interactions and **MongoDB** for flexible relationship modeling. This allows the platform to handle state updates for thousands of devices simultaneously without I/O blocking.

### 4. Global Security Interceptors
Implements an "Anti-Zombie" session handler. A global interceptor monitors for `401 Unauthorized` responses at the network layer, instantly clearing local state and redirecting to login to prevent stale-token vulnerabilities.

---

## 🛠️ The Technical Stack (Deep)

- **Backend**: Python 3.10+ (FastAPI), Pydantic v2, `asyncpg`.
- **Event Mesh**: Apache Kafka & Zookeeper (Event Streaming), RabbitMQ (WebSockets).
- **Persistence**: PostgreSQL (Relational), MongoDB (Document/Topology), Redis (State Cache/Locking).
- **Observability**: Prometheus (Exporters), Grafana (Visualization).
- **Frontend**: React 19, Vite, Three.js (Digital Twin Rendering), D3.js (Topology Graphs).

---

## 🚀 Execution & Deployment
The platform is fully containerized with **Docker Compose**, managing 14+ bespoke containers and 5 storage/broker backends. It supports rapid local prototyping and production-ready horizontal scaling.

```bash
docker-compose up --build

## 🚀 Screenshots
<img width="1771" height="841" alt="Screenshot 2026-03-31 221339" src="https://github.com/user-attachments/assets/b95f213d-e5d9-402f-b009-0ac0fcc68a2d" />
<img width="1919" height="935" alt="Screenshot 2026-03-31 160550" src="https://github.com/user-attachments/assets/58ca7459-2683-4237-8057-fcd112938c98" />
<img width="1010" height="671" alt="Screenshot 2026-03-31 171003" src="https://github.com/user-attachments/assets/0bf9d85f-11b4-43ec-8974-9faad9402e15" />
<img width="1919" height="946" alt="Screenshot 2026-03-31 172309" src="https://github.com/user-attachments/assets/a48e12a6-7d9a-4832-86bb-91fdec73080b" />
<img width="1409" height="905" alt="Screenshot 2026-03-31 220838" src="https://github.com/user-attachments/assets/e8fb8bcd-7647-4811-b677-942462d1aeee" />
<img width="438" height="560" alt="Screenshot 2026-03-31 220852" src="https://github.com/user-attachments/assets/3ed7dbc1-96ee-47e0-9ed7-ca421fdfdeed" />
<img width="1427" height="631" alt="Screenshot 2026-03-31 221007" src="https://github.com/user-attachments/assets/75c61c32-5f86-4c49-80de-d8bc6a41a4df" />
<img width="1906" height="943" alt="Screenshot 2026-03-31 221020" src="https://github.com/user-attachments/assets/24533fdb-f4d9-4bf3-9d8c-783d8131169c" />
<img width="1036" height="635" alt="Screenshot 2026-03-31 221049" src="https://github.com/user-attachments/assets/5f885b8b-069a-43e1-bb6a-187960aae3ba" />
<img width="1919" height="950" alt="Screenshot 2026-03-30 212447" src="https://github.com/user-attachments/assets/faaf9fe7-3a58-4607-a6d6-56bb9b0d6fb2" />
<img width="1919" height="941" alt="image" src="https://github.com/user-attachments/assets/74063b17-468a-48a6-bd26-5d3f04a64b68" />
<img width="806" height="575" alt="Screenshot 2026-03-31 163139" src="https://github.com/user-attachments/assets/c9eda2c3-9176-4fd8-a078-3891f24e5435" />
