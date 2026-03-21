import uuid
from typing import List, Optional, Any
from app.repositories.base import DeviceRepository, TemplateRepository, ClusterRepository
from app.engines.slots import SlotEngine
from app.schemas.domain import DeviceCreate, BulkDeployRequest, ClusterCreate, DeviceTemplateCreate
from app.models.domain import Device, DeviceTemplate, Cluster

class InventoryService:
    def __init__(self, session):
        self.device_repo = DeviceRepository(session)
        self.template_repo = TemplateRepository(session)
        self.cluster_repo = ClusterRepository(session)
        self.slot_engine = SlotEngine()

    async def create_device(self, dev_in: DeviceCreate) -> Device:
        template = await self.template_repo.get(dev_in.template_id)
        if not template: raise ValueError("Template not found")
        
        # 3. Enrich data from template
        dev_data = dev_in.model_dump()
        dev_data.update({
            "device_type": template.device_type,
            "vendor": template.vendor,
            "model": template.model,
            "power_draw_kw": dev_in.power_draw_kw or template.default_power_kw,
            "max_power_kw": dev_in.max_power_kw or (template.default_power_kw * 1.2),
            "heat_output_btu": dev_in.heat_output_btu or template.default_heat_btu
        })
        
        return await self.device_repo.create(dev_data)

    async def bulk_deploy(self, request: BulkDeployRequest) -> List[Device]:
        template = await self.template_repo.get(request.template_id)
        if not template: raise ValueError("Template not found")
        
        deployed_devices = []
        for rack_id in request.rack_ids:
            for i in range(request.count):
                # Simple logic: fill sequentially if count > 1
                # In real scenario, we'd use find_next_available_slot
                occupancy = await self.device_repo.get_rack_occupancy(rack_id)
                start_u = self.slot_engine.find_next_available_slot(rack_id, template.size_u, 42, occupancy)
                
                if start_u == -1: continue # Skip if no space
                
                dev_data = {
                    "workspace_id": request.workspace_id,
                    "rack_id": rack_id,
                    "template_id": request.template_id,
                    "cluster_id": request.cluster_id,
                    "logical_space_id": request.logical_space_id,
                    "device_type": template.device_type,
                    "start_u": start_u,
                    "size_u": template.size_u,
                    "power_draw_kw": template.default_power_kw,
                    "max_power_kw": template.default_power_kw * 1.2,
                    "heat_output_btu": template.default_heat_btu,
                    "vendor": template.vendor,
                    "model": template.model
                }
                dev = await self.device_repo.create(dev_data)
                deployed_devices.append(dev)
                
        return deployed_devices

    async def create_cluster(self, cluster_in: ClusterCreate) -> Cluster:
        return await self.cluster_repo.create(cluster_in.model_dump())

    async def create_template(self, template_in: DeviceTemplateCreate) -> DeviceTemplate:
        return await self.template_repo.create(template_in.model_dump())
