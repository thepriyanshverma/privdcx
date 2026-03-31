from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.services.inventory import InventoryService
from app.schemas.domain import (
    DeviceCreate, DeviceRead, 
    DeviceTemplateCreate, DeviceTemplateRead,
    ClusterCreate, ClusterRead,
    BulkDeployRequest
)
import uuid
from typing import Optional
from app.services.topology_events import publish_topology_event

router = APIRouter()

# --- Device CRUD ---
@router.post("/devices", response_model=DeviceRead, status_code=status.HTTP_201_CREATED)
async def create_device(dev_in: DeviceCreate, request: Request, db: AsyncSession = Depends(get_db)):
    service = InventoryService(db)
    try:
        device = await service.create_device(dev_in)
        await publish_topology_event(
            {
                "event": "DEVICE_CREATED",
                "workspace_id": str(device.workspace_id),
                "org_id": request.headers.get("X-Org-Id"),
                "device_id": str(device.id),
                "rack_id": str(device.rack_id),
                "device_type": str(device.device_type.value if hasattr(device.device_type, "value") else device.device_type),
                "metadata": {
                    "template_id": str(device.template_id),
                    "rack_template": "AUTO",
                },
            }
        )
        return device
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/devices", response_model=list[DeviceRead])
async def list_devices(
    workspace_id: Optional[uuid.UUID] = None,
    rack_id: Optional[uuid.UUID] = None,
    skip: int = 0,
    limit: int = 1000,
    db: AsyncSession = Depends(get_db),
):
    service = InventoryService(db)
    return await service.list_devices(
        workspace_id=workspace_id,
        rack_id=rack_id,
        skip=skip,
        limit=limit,
    )

@router.get("/devices/{id}", response_model=DeviceRead)
async def get_device(id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    service = InventoryService(db)
    device = await service.device_repo.get(id)
    if not device: raise HTTPException(status_code=404)
    return device

# --- Template APIs ---
@router.post("/device-templates", response_model=DeviceTemplateRead, status_code=status.HTTP_201_CREATED)
async def create_template(temp_in: DeviceTemplateCreate, db: AsyncSession = Depends(get_db)):
    service = InventoryService(db)
    return await service.create_template(temp_in)

@router.get("/device-templates/{id}", response_model=DeviceTemplateRead)
async def get_template(id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    service = InventoryService(db)
    temp = await service.template_repo.get(id)
    if not temp: raise HTTPException(status_code=404)
    return temp

# --- Bulk Deployment ---
@router.post("/devices/bulk-deploy", response_model=list[DeviceRead], status_code=status.HTTP_201_CREATED)
async def bulk_deploy(request: BulkDeployRequest, req: Request, db: AsyncSession = Depends(get_db)):
    service = InventoryService(db)
    try:
        devices = await service.bulk_deploy(request)
        for device in devices:
            await publish_topology_event(
                {
                    "event": "DEVICE_CREATED",
                    "workspace_id": str(device.workspace_id),
                    "org_id": req.headers.get("X-Org-Id"),
                    "device_id": str(device.id),
                    "rack_id": str(device.rack_id),
                    "device_type": str(device.device_type.value if hasattr(device.device_type, "value") else device.device_type),
                    "metadata": {
                        "template_id": str(device.template_id),
                        "rack_template": "AUTO",
                    },
                }
            )
        return devices
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/devices/{id}/move", response_model=DeviceRead)
async def move_device(
    id: uuid.UUID,
    rack_id: uuid.UUID,
    request: Request,
    start_u: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
):
    service = InventoryService(db)
    current = await service.get_device(id)
    if not current:
        raise HTTPException(status_code=404)
    moved = await service.move_device(id=id, rack_id=rack_id, start_u=start_u)
    if not moved:
        raise HTTPException(status_code=404)
    await publish_topology_event(
        {
            "event": "DEVICE_MOVED",
            "workspace_id": str(moved.workspace_id),
            "org_id": request.headers.get("X-Org-Id"),
            "device_id": str(moved.id),
            "rack_id": str(moved.rack_id),
            "device_type": str(moved.device_type.value if hasattr(moved.device_type, "value") else moved.device_type),
            "metadata": {
                "previous_rack_id": str(current.rack_id),
                "start_u": moved.start_u,
            },
        }
    )
    return moved


@router.delete("/devices/{id}")
async def delete_device(id: uuid.UUID, request: Request, db: AsyncSession = Depends(get_db)):
    service = InventoryService(db)
    existing = await service.get_device(id)
    if not existing:
        raise HTTPException(status_code=404)
    success = await service.delete_device(id)
    if not success:
        raise HTTPException(status_code=404)
    await publish_topology_event(
        {
            "event": "DEVICE_DELETED",
            "workspace_id": str(existing.workspace_id),
            "org_id": request.headers.get("X-Org-Id"),
            "device_id": str(existing.id),
            "rack_id": str(existing.rack_id),
            "device_type": str(existing.device_type.value if hasattr(existing.device_type, "value") else existing.device_type),
        }
    )
    return {"status": "deleted"}

# --- Cluster APIs ---
@router.post("/clusters", response_model=ClusterRead, status_code=status.HTTP_201_CREATED)
async def create_cluster(cluster_in: ClusterCreate, db: AsyncSession = Depends(get_db)):
    service = InventoryService(db)
    return await service.create_cluster(cluster_in)

@router.get("/clusters/{id}", response_model=ClusterRead)
async def get_cluster(id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    service = InventoryService(db)
    cluster = await service.cluster_repo.get(id)
    if not cluster: raise HTTPException(status_code=404)
    return cluster
