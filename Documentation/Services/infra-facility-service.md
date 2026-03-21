# Service Documentation: Facility Physical Topology (infra-facility-service)

This service manages the physical datacenter structural hierarchy, geometry, and spatial zoning for the InfraOS platform.

## 1. Folder Structure
```text
services/infra-facility/
├── app/
│   ├── api/v1/         # REST API Routers
│   ├── core/           # Database Config
│   ├── middleware/     # Workspace Context
│   ├── models/         # SQLAlchemy Spatial Models
│   ├── repositories/   # Data Access Layer
│   ├── schemas/        # Pydantic v2 Spatial Validation
│   ├── services/       # Topology Orchestration Logic
│   └── main.py         # Entry Point
├── Dockerfile          # Image Specification
├── requirements.txt    # Python Dependencies
└── alembic.ini        # Migration Config
```

## 2. SQLAlchemy Models (Spatial Hierarchy)
The service implements a high-fidelity physical model:
- **Facility:** Root structural container (Width x Length x Height).
- **Hall:** Large-scale planning area within a facility.
- **Zone:** Functional segments (Cooling, Power, Containment).
- **Aisle:** Hot/Cold corridor modeling foundation.

## 3. Spatial Modeling Design Decisions
- **CAD Geometry:** All entities capture exact `width_m`, `length_m`, and `height_m` to allow for future CFD (Computational Fluid Dynamics) simulation integration.
- **Orientation:** Aisles support `NORTH_SOUTH` and `EAST_WEST` orientation to determine incident airflow vectors.
- **Zoning:** `ZoneType` allows for overlapping logical, power, and thermal domains without breaking the spatial tree.

## 4. Multi-Tenant Isolation
The service enforces workspace-based isolation via the `X-Workspace-Id` header. All spatial queries and updates are constrained by this context.

## 5. Docker Integration
### Snippet (`docker-compose.yml`)
```yaml
  infra-facility:
    build: ./services/infra-facility
    ports:
      - "8006:8006"
    environment:
      - DATABASE_URL=postgresql+asyncpg://infraos:infraos_password@postgres:5432/infraos_db
    depends_on:
      - postgres
```

## 6. Example API Usage
### Create Facility
```bash
curl -X POST http://localhost:8006/api/v1/facilities \
     -H "X-Workspace-Id: <WS_ID>" \
     -d '{
       "name": "DC-ALPHA-01",
       "width_m": 120.5,
       "length_m": 80.0,
       "height_m": 4.5,
       "cooling_type": "liquid",
       "workspace_id": "<WS_ID>"
     }'
```

### Create Hall in Facility
```bash
curl -X POST http://localhost:8006/api/v1/facilities/<FAC_ID>/halls \
     -H "X-Workspace-Id: <WS_ID>" \
     -d '{
       "name": "Hall-A",
       "width_m": 40.0,
       "length_m": 60.0,
       "height_m": 4.0,
       "power_capacity_mw": 5.5
     }'
```

## 7. Future Capability Readiness
- **CFD Ready:** Spatial coordinates are prepared for airflow corridor scoring.
- **Soft Delete:** Facilities support `deleted_at` timestamps for safe decommissioning.
