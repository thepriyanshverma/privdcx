# Service Documentation: Infra Simulation & Telemetry Engine (infra-simulation-service)

This service acts as the physics-driven core and Digital Twin runtime for the InfraOS platform, generating real-time telemetry and infrastructure state predictions.

## 1. Folder Structure
```text
services/infra-simulation/
├── app/
│   ├── api/metrics.py   # Prometheus Exporter
│   ├── core/mongo.py    # Time-series Storage
│   ├── engines/         # Physics Models (Power, Thermal, Network)
│   ├── services/loop.py # Background Tick Engine
│   └── main.py          # Entry Point
├── Dockerfile          # Image Specification
└── requirements.txt    # Python Dependencies
```

## 2. Mathematical Models
The service implements multi-domain physics simulation:
- **Power Model:** Uses NumPy for stochastic variance modeling (Normal distribution) and saturation-based risk scoring.
- **Thermal Model:** Implements a simplified Heat Transfer model (Ambient + Load/Cooling delta) to compute inlet/outlet temperatures.
- **Network Model:** Uses NetworkX to simulate topology-aware latency and stochastically distributed congestion.

## 3. Prometheus Integration
Metrics are exposed at `http://infra-simulation:8010/metrics`.
- **Scrape Interval:** 5 seconds (Highly responsive).
- **Metric Types:** Gauges for Power (kW), Temperature (C), Latency (ms), and Risk (0-1 index).

## 4. Background Simulation Loop
A non-blocking async task (`SimulationLoop`) computes the entire infrastructure state every second.
- **Each Tick:** Updates mathematical models, sets Prometheus gauges, and samplings snapshots to MongoDB.
- **MongoDB Collection:** `telemetry` (Stores high-resolution history).

## 5. Docker Orchestration
The service is integrated with a dedicated **Prometheus** container for immediate observability:
```yaml
  infra-simulation:
    ports: ["8010:8010"]
    depends_on: ["mongodb"]

  prometheus:
    image: prom/prometheus:latest
    volumes: ["./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml"]
    ports: ["9090:9090"]
```

## 6. Example Metrics Output
```text
# HELP rack_power_kw Current power draw of a rack in kW
# TYPE rack_power_kw gauge
rack_power_kw{rack_id="RACK-001",workspace_id="default"} 4.523
rack_temp_c{rack_id="RACK-001"} 25.4
infra_risk_index{facility_id="DC-ALPHA"} 0.12
```

## 7. Future Capability Readiness
- **CFD Integration:** Thermal models are ready for higher-order spatial zoning from `facility-service`.
- **Failure State Machine:** Failure engines can inject "PSU Blown" or "ToR Congested" events into the live stream.
