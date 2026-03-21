# Service Documentation: Rack Lifecycle & Placement (infra-rack-service)

This service manages the physical lifecycle, spatial placement, and deterministic layout generation of racks in the InfraOS platform.

## 1. Folder Structure
```text
services/infra-rack/
├── app/
│   ├── api/v1/         # REST API Routers
│   ├── core/           # Database Config
│   ├── engines/        # Deterministic Layout Logic
│   ├── models/         # SQLAlchemy Rack Models
│   ├── repositories/   # Data Access Layer
│   ├── schemas/        # Pydantic v2 Serialization
│   ├── services/       # Rack Orchestration Logic
│   └── main.py         # Entry Point
├── Dockerfile          # Image Specification
├── requirements.txt    # Python Dependencies
└── alembic.ini        # Migration Config
```

## 2. Rack SQLAlchemy Model
The service implements a high-fidelity physical and operational model:
- **Physical Position:** High-precision `x`, `y`, `z` coordinates and `orientation`.
- **Grid Mapping:** Logical `row_index`, `column_index`, and `floor_unit_index`.
- **Containment:** Links to `aisle_id` and tracks `airflow_direction`.
- **Electrical Baseline:** Tracks `max_power_kw` and `redundancy_zone`.
- **Tenancy:** Maps racks to `logical_space_id` and tracks `allocation_state`.

## 3. Deterministic Layout Engine
The `LayoutEngine` provides algorithmic grid generation to ensure consistent, non-random placement across hyperscale sites.
- **Input:** Density, row spacing, aisle patterns (Hot/Cold).
- **Output:** Structured rack array with calculated spatial positions and grid indices.

## 4. Multi-Tenant rules
Workspace isolation is enforced via the `X-Workspace-Id` header. Operations like movement and tenant allocation are validated against the provided context.

## 5. Docker Integration
### Snippet (`docker-compose.yml`)
```yaml
  infra-rack:
    build: ./services/infra-rack
    ports:
      - "8007:8007"
    environment:
      - DATABASE_URL=postgresql+asyncpg://infraos:infraos_password@postgres:5432/infraos_db
    depends_on:
      - postgres
```

## 6. Example API Usage
### Generate Grid Layout
```bash
curl -X POST http://localhost:8007/api/v1/layouts/grid \
     -H "X-Workspace-Id: <WS_ID>" \
     -d '{
       "zone_id": "<ZONE_ID>",
       "rows": 10,
       "cols": 20,
       "row_pitch_m": 3.2,
       "col_pitch_m": 0.61,
       "workspace_id": "<WS_ID>",
       "facility_id": "<FAC_ID>",
       "hall_id": "<HALL_ID>"
     }'
```

### Move Rack (Spatial Correction)
```bash
curl -X PATCH http://localhost:8007/api/v1/racks/<RACK_ID>/move?x=15.5&y=22.3
```

## 7. Containment Rules Explanation
Racks are automatically assigned to `hot` or `cold` aisles during grid generation based on their row index. This follows the standard data center hot/cold aisle containment strategy, which is critical for future airflow and thermal simulation accuracy.
- **Even Rows:** Cold Aisle (Front-to-Front).
- **Odd Rows:** Hot Aisle (Back-to-Back).
