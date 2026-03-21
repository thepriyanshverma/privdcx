from fastapi import APIRouter, Depends, HTTPException, status
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

router = APIRouter()

# --- Device CRUD ---
@router.post("/devices", response_model=DeviceRead, status_code=status.HTTP_201_CREATED)
async def create_device(dev_in: DeviceCreate, db: AsyncSession = Depends(get_db)):
    service = InventoryService(db)
    try:
        return await service.create_device(dev_in)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

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
async def bulk_deploy(request: BulkDeployRequest, db: AsyncSession = Depends(get_db)):
    service = InventoryService(db)
    try:
        return await service.bulk_deploy(request)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

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
