# Service Documentation: Invitation & Team Governance Service (infra-invitation-service)

This service is the enterprise-grade control plane for collaborative workspace access in InfraOS.
It manages the complete lifecycle of invitations and permanent workspace memberships.

---

## 1. Folder Structure
```text
services/infra-invitation-service/
├── app/
│   ├── api/v1/
│   │   └── router.py        # All REST endpoints (workspace-scoped)
│   ├── core/
│   │   └── database.py      # PostgreSQL async engine
│   ├── models/
│   │   └── domain.py        # SQLAlchemy: Invitation, WorkspaceMembership
│   ├── repositories/
│   │   └── base.py          # InvitationRepository, MembershipRepository
│   ├── schemas/
│   │   └── domain.py        # Pydantic v2 schemas (token never exposed after creation)
│   ├── services/
│   │   └── invitation.py    # RBAC-aware business logic
│   └── main.py              # FastAPI entrypoint
├── Dockerfile
└── requirements.txt
```

---

## 2. RBAC Propagation Architecture

Roles cascade **downward** — they never grant upward permissions.

```
org_owner
 └── workspace_owner  (can see all invitations, change all roles)
      └── infra_architect  (can create + see OWN invitations only)
           └── infra_operator  (can see members only, NOT invitations)
                └── infra_viewer  (read-only telemetry access)
```

**Enforcement Points:**
| Rule | Enforced At |
|---|---|
| Only MANAGEMENT_ROLES can create invitations | `InvitationService.create_invitation()` |
| Only OWNER_ROLES see all invitations | `InvitationRepository.list_for_workspace()` |
| Only creator or owner can revoke | `InvitationService.revoke_invitation()` |
| Email must match invitee on accept | `InvitationService.accept_invitation()` |
| Operator/Viewer → 403 on /invites | `router.py` + service layer |

---

## 3. Org Bootstrap Flow

```mermaid
graph TD
    A[User Registers] --> B[POST /tenants/auth/register]
    B --> C[Login → Receive JWT]
    C --> D[POST /bootstrap/org]
    D --> E[Organization Created]
    E --> F[Default Workspace Created]
    F --> G[org_owner Role Assigned]
    G --> H[Default LogicalSpace Created]
    H --> I[Landing in Control Plane]
```

Bootstrap is idempotent — re-running it will not create duplicate org/workspace.

---

## 4. SSO Schema & Future Flow

```python
class IdentityProvider(Base):
    id: UUID
    org_id: UUID
    type: str            # "saml" | "oidc" | "azure_ad" | "okta" | "google"
    metadata_url: str
    client_id: str
    client_secret: str   # hashed
    status: str          # "active" | "draft"
```

**Future SSO JWT flow:**
1. User hits `/sso/callback?provider=<id>&code=<code>`
2. Service exchanges code for claims
3. `external_id` + `identity_provider_id` written to User
4. Regular JWT issued with SSO claims embedded

---

## 5. Concurrency Versioning Design

```python
# Added to Facility, Rack, Device models
version_number:    int     # Monotonically incrementing
last_modified_by:  UUID    # Actor ID
last_modified_at:  datetime
```

**Optimistic locking flow:**
1. Client sends `If-Match: "<version>"` header
2. Gateway middleware checks header vs current DB version
3. **Match** → proceed, increment `version_number`
4. **Mismatch** → `409 Conflict` returned
5. Client must re-fetch and re-apply changes

---

## 6. Infra Change Event Schema

```python
InfraChangeEvent = {
    "id":          UUID,
    "entity_type": str,      # "facility" | "rack" | "device"
    "entity_id":   UUID,
    "change_type": str,      # "created" | "updated" | "deleted"
    "actor":       UUID,
    "version":     int,
    "timestamp":   datetime,
    "payload":     dict      # JSON diff of changed fields
}
```

Published to RabbitMQ topic: **`infra.change.events`**

---

## 7. Redis RBAC Cache Strategy

```
Key format:  rbac_cache:{user_id}:{workspace_id}
Value:       JSON { "role": "infra_architect", "computed_at": "2026-03-21T..." }
TTL:         900 seconds (15 minutes)
Invalidation: on role change, membership revoke, or invite accept
```

**Flow:**
1. Gateway middleware checks Redis for `rbac_cache:{user_id}:{workspace_id}`
2. **Cache hit** → embed role into JWT and pass via `X-User-Role` header
3. **Cache miss** → query `workspace_memberships` table, populate cache
4. On role change → `DEL rbac_cache:{user_id}:{workspace_id}`

---

## 8. Dockerfile

```dockerfile
FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y build-essential libpq-dev && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8014"]
```

---

## 9. docker-compose Snippet

```yaml
infra-invitation:
  build: ./services/infra-invitation-service
  container_name: infraos-invitation
  ports:
    - "8014:8014"
  environment:
    - DATABASE_URL=postgresql+asyncpg://infraos:infraos_password@postgres:5432/infraos_db
    - TENANT_SERVICE_URL=http://infra-tenant:8005/api/v1
  depends_on:
    - postgres
    - infra-tenant
  restart: unless-stopped
```

---

## 10. Example Invitation Lifecycle

```
1. workspace_owner creates invite for alice@company.com (role: infra_architect, 7 days)
   → token generated (raw), hash stored in DB, raw token shown ONCE in UI

2. alice@company.com receives the code (via Slack/email/etc.)

3. Alice registers → logs in → opens Workspace Selector → enters invite code

4. System:
   a. Hash token → lookup in DB
   b. Validate status == "pending", email match, not expired
   c. Create WorkspaceMembership { user_id, workspace_id, role="infra_architect", joined_at }
   d. Set invitation.status = "accepted"

5. Alice lands in the workspace with infra_architect role applied
   → Team → Members shows alice@company.com with Architect badge
   → Team → Invitations (alice can see only her own future invitations)
```

---

## 11. Example JWT Payload

```json
{
  "sub": "b2ddbbde-b16e-487f-bdee-ebdd669a3827",
  "email": "alice@company.com",
  "full_name": "Alice Chen",
  "org": {
    "id": "7f3a2d1e-...",
    "role": "infra_architect"
  },
  "workspaces": [
    {
      "id": "0fb3fab3-...",
      "role": "infra_architect",
      "joined_at": "2026-03-21T02:00:00Z"
    }
  ],
  "identity_provider_id": null,
  "external_subject": null,
  "iat": 1742518200,
  "exp": 1742604600
}
```

---

## 12. Collaboration Conflict Example

**Scenario:** Two architects edit the same Facility simultaneously.

```
Time  | User A                          | User B
------|-------------------------------|-------------------------------
T+0   | GET /facility/42 → { v: 5 }   | GET /facility/42 → { v: 5 }
T+5   | PATCH (If-Match: "5") → OK     | (still editing locally)
      | Server: version → 6           |
T+10  |                               | PATCH (If-Match: "5") → 409 Conflict
      |                               | { "error": "Version conflict",
      |                               |   "current_version": 6 }
T+12  |                               | User B re-fetches → sees A's changes
T+15  |                               | PATCH (If-Match: "6") → OK → version 7
```

**Event published to `infra.change.events`:**
```json
{
  "entity_type": "facility",
  "entity_id": "42",
  "change_type": "updated",
  "actor": "alice@company.com",
  "version": 6,
  "payload": { "power_capacity_kw": 2400 }
}
```
