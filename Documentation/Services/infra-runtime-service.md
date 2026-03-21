# Service Documentation: Infra Runtime Orchestrator (infra-runtime-service)

The Runtime Orchestrator is the operational core of InfraOS, responsible for maintaining live infrastructure state, executing autonomous remediation workflows, and modeling the cascading effects of degradation.

## 1. Folder Structure
```text
services/infra-runtime/
├── app/
│   ├── api/v1/         # State inspection APIs
│   ├── clients/        # RabbitMQ Consumer & Publisher
│   ├── engines/        # Remediation & Propagation logic
│   ├── schemas/        # Operational state models
│   ├── services/       # State manager & Orchestrator loop
│   └── main.py         # Entry Point
├── Dockerfile          # Image Specification
└── requirements.txt    # Python Dependencies
```

## 2. Runtime State Model
The service maintains a high-fidelity model of infrastructure health:
- **Operational Status:** `ACTIVE`, `DEGRADED`, `FAILED`, `RECOVERING`, `MAINTENANCE`, `ISOLATED`.
- **Health Score:** A float from 0.0 to 1.0 representing overall entity integrity.
- **Sub-states:** Tracks `power`, `thermal`, and `network` conditions independently within the state object.

## 3. Remediation Engine Architecture
The engine uses a pluggable policy system to map incoming alerts to specific operational actions:
- **Rule-to-Action Mapping:** e.g., `THERMAL_CRITICAL` -> `throttle_cluster`.
- **Idempotency:** Actions are recorded and tracked to prevent redundant executions for the same failure window.
- **Workflow Logging:** All remediation attempts are persisted in MongoDB for auditing.

## 4. Degradation Propagation (Graph Model)
Built using **NetworkX**, the service maintains a physical topology graph:
- **Adjacency Logic:** When a rack fails, the orchestrator identifies "affected neighbors" (e.g., adjacent racks sharing a cooling zone).
- **Cascade Simulation:** Allows the system to preemptively flag risk for neighbors even if their individual telemetry is still within thresholds.

## 5. RabbitMQ Consumption & Publishing
- **Ingestion:** Consumes `alert.warning.*` and `alert.critical.*` keys from the `infra.alerts` exchange.
- **Egress:** Broadcasts `state.updated.*` events to the `infra.state` exchange.
- **Consistency:** Uses a "Consumer Group" pattern to ensure state updates for a single entity remain ordered.

## 6. Hybrid Storage Strategy
- **Redis (Real-time Cache):** Sub-millisecond access to current state for API requests and propagation math.
- **MongoDB (Timeline History):** Stores every state change and remediation action as a time-indexed document, enabling temporal "playback" of failures.

## 7. Control API Design
- `GET /state/{id}`: Live operational status retrieval.
- `POST /remediation/pause`: Suspends autonomous actions for manual override.
- `POST /state/snapshot`: Generates a point-in-time state of the entire facility.

## 8. Example Remediation Flow
1. **Trigger:** `Alert Engine` publishes `alert.critical.thermal_critical` for `Rack_A`.
2. **Evaluate:** `Runtime` consumes alert, checks policy: Action = `migrate_workload`.
3. **Execute:** Calls workload migration (Log-only in MVP), updates `Rack_A` state to `DEGRADED`.
4. **Propagate:** `NetworkX` flags `Rack_B` (neighbor) as "at risk".
5. **Publish:** Emits `state.updated.rack.rack_a` to the event bus.
