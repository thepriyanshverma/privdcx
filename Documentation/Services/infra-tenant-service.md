# Service Documentation: Tenant & Identity Control Plane (infra-tenant-service)

This service is the foundational control plane for the InfraOS platform, managing multi-tenancy, identity, and RBAC (Role-Based Access Control).

## 1. Folder Structure
```text
services/infra-tenant/
├── app/
│   ├── api/v1/         # REST API Routers
│   ├── core/           # Security, Database Config
│   ├── middleware/     # Tenant Context & RBAC
│   ├── models/         # SQLAlchemy Domain Models
│   ├── repositories/   # Data Access Layer
│   ├── schemas/        # Pydantic v2 Serialization
│   ├── services/       # Business Logic Orchestration
│   └── main.py         # Entry Point
├── alembic/            # Database Migrations
├── Dockerfile          # Image Specification
├── alembic.ini        # Migration Config
└── requirements.txt    # Python Dependencies
```

## 2. DB Models (SQLAlchemy)
- **User:** Extended with `last_workspace_id` for session persistence across devices.
- **Organization:** Enterprise entity owning infrastructure.
- **Workspace:** Collaborative environment for DC planning.
- **Subscription:** Commercial entitlement tracking limits.
- **LogicalSpace:** Virtual "slices" of infrastructure (Tenant isolation).
- **RoleAssignment:** Polymorphic mapping of Users to Roles within specific Scopes.

## 3. RBAC Permission Mapping
| Role | Scope | Key Capabilities |
| :--- | :--- | :--- |
| `org_owner` | Org | Create Workspaces, Manage Subscriptions |
| `workspace_owner`| Workspace | Manage Users, Create Logical Spaces |
| `infra_architect`| Workspace | Design Layouts, Run Simulations |
| `infra_operator` | Workspace | Access Runtime Telemetry,Remediation |
| `tenant_owner`   | LogicalSpace| Manage Cloud-style asset allocation |

## 4. Multi-Tenant Isolation Middleware
The service uses a global dependency to inject `TenantContext` into every request based on headers:
- `X-Org-Id`
- `X-Workspace-Id`
- `X-Logical-Space-Id`

## 5. Docker Integration
### Snippet (`docker-compose.yml`)
```yaml
  infra-tenant:
    build: ./services/infra-tenant
    ports:
      - "8005:8005"
    environment:
      - DATABASE_URL=postgresql+asyncpg://infraos:infraos_password@postgres:5432/infraos_db
    depends_on:
      - postgres
```

## 6. Example API Usage
### Create Organization (Admin Only)
```bash
curl -X POST http://localhost:8005/api/v1/organizations \
     -H "Authorization: Bearer <TOKEN>" \
     -d '{"name": "Hyperscale-One", "billing_email": "billing@h1.com"}'

### Update Active Context (Persistent Workspace)
```bash
curl -X PATCH http://localhost:8005/api/v1/auth/me \
     -H "Authorization: Bearer <TOKEN>" \
     -d '{"last_workspace_id": "<UUID>"}'
```
```

### Assign Workspace Role
```bash
curl -X POST http://localhost:8005/api/v1/roles/assign \
     -H "Authorization: Bearer <TOKEN>" \
     -d '{"user_id": "<UID>", "role": "infra_architect", "scope_type": "workspace", "scope_id": "<WS_ID>"}'
```

## 7. Security Considerations
- **JWT Lifespan:** Default set to 24 hours. Use refresh tokens for production.
- **Password Hashing:** Uses `bcrypt` for secure credential storage.
- **Scoped RBAC:** Permission checks verify both the `Role` and the `Target ID` in the request context.
