# Service Documentation: Device Inventory & Slot Mapping (infra-device-service)

This service manages the physical hardware inventory, U-level slot mapping, device templates, and workload clustering for the InfraOS platform.

## 1. Folder Structure
```text
services/infra-device/
├── app/
│   ├── api/v1/         # REST API Routers
│   ├── core/           # Database Config
│   ├── engines/        # Slot Validation Logic (U-level)
│   ├── models/         # SQLAlchemy Device/Cluster Models
│   ├── repositories/   # Data Access Layer
│   ├── schemas/        # Pydantic v2 Serialization
│   ├── services/       # Inventory Orchestration Logic
│   └── main.py         # Entry Point
├── Dockerfile          # Image Specification
├── requirements.txt    # Python Dependencies
└── alembic.ini        # Migration Config
```

## 2. Device SQLAlchemy Model
The service implements a high-fidelity hardware model:
- **Slot Placement:** Precise `start_u` and `size_u` tracking with collision guards.
- **Power Model:** Tracks `power_draw_kw`, `max_power_kw`, and redundancy groups.
- **Thermal Model:** Tracks `heat_output_btu` and `airflow_cfm` for environmental simulation.
- **Network Baseline:** Maps uplink ports and ToR (Top of Rack) switch links.
- **Operational Data:** Full lifecycle tracking (Serial numbers, Firmware, Procurement dates).

## 3. Slot Validation Algorithm Design
The `SlotEngine` prevents hardware overlapping through a bitset-like validation strategy:
- **Collision Detection:** Checks if the requested U-range `[start_u, start_u + size_u)` intersects with any existing device in the same rack.
- **Contiguous Allocation:** Scans the rack from bottom-to-top to find the first available contiguous gap of size `N`.

## 4. Device Template Model
Templates decouple hardware specifications from individual instances:
- Supports standardized rollout of AI clusters (e.g., "NVIDIA-H100-NODE").
- Pre-defines power, thermal, and space requirements to ensure consistent planning.

## 5. Cluster Grouping Strategy
Clusters allow for logical grouping of devices across racks and facilities:
- **AI Clusters:** Grouping by High-Speed Network Fabric.
- **Compute Pools:** Grouping by Tenant/Logical Space.
- **Failure Domains:** Grouping for Redundancy modeling.

## 6. Docker Integration
### Snippet (`docker-compose.yml`)
```yaml
  infra-device:
    build: ./services/infra-device
    ports:
      - "8008:8008"
    environment:
      - DATABASE_URL=postgresql+asyncpg://infraos:infraos_password@postgres:5432/infraos_db
    depends_on:
      - postgres
```

## 7. Example API Usage
### Create Device Template
```bash
curl -X POST http://localhost:8008/api/v1/device-templates \
     -d '{
       "name": "GEN-SVR-2U",
       "device_type": "server",
       "size_u": 2,
       "default_power_kw": 0.8,
       "vendor": "Dell",
       "model": "R750"
     }'
```

### Bulk Deploy AI Cluster
```bash
curl -X POST http://localhost:8008/api/v1/devices/bulk-deploy \
     -H "X-Workspace-Id: <WS_ID>" \
     -d '{
       "template_id": "<TEMP_ID>",
       "rack_ids": ["<RACK_1>", "<RACK_2>"],
       "count": 4,
       "workspace_id": "<WS_ID>",
       "cluster_id": "<CLUSTER_ID>"
     }'
```
