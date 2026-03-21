import uuid
from typing import List, Optional
from app.repositories.base import FacilityRepository, HallRepository, ZoneRepository, AisleRepository
from app.schemas.domain import FacilityCreate, HallCreate, ZoneCreate, AisleCreate
from app.models.domain import Facility, Hall, Zone, Aisle

class TopologyService:
    def __init__(self, session):
        self.fac_repo = FacilityRepository(session)
        self.hall_repo = HallRepository(session)
        self.zone_repo = ZoneRepository(session)
        self.aisle_repo = AisleRepository(session)

    # --- Facility ---
    async def create_facility(self, fac_in: FacilityCreate) -> Facility:
        return await self.fac_repo.create(fac_in.model_dump())

    async def get_facility(self, id: uuid.UUID) -> Optional[Facility]:
        return await self.fac_repo.get(id)

    async def list_facilities(self, workspace_id: Optional[uuid.UUID] = None) -> List[Facility]:
        if workspace_id:
            return await self.fac_repo.list_by_workspace(workspace_id)
        return await self.fac_repo.list()

    async def delete_facility(self, id: uuid.UUID) -> bool:
        return await self.fac_repo.delete_soft(id)

    # --- Hall ---
    async def create_hall(self, hall_in: HallCreate) -> Hall:
        return await self.hall_repo.create(hall_in.model_dump())

    async def get_hall(self, id: uuid.UUID) -> Optional[Hall]:
        return await self.hall_repo.get(id)

    # --- Zone ---
    async def create_zone(self, zone_in: ZoneCreate) -> Zone:
        return await self.zone_repo.create(zone_in.model_dump())

    async def get_zone(self, id: uuid.UUID) -> Optional[Zone]:
        return await self.zone_repo.get(id)

    # --- Aisle ---
    async def create_aisle(self, aisle_in: AisleCreate) -> Aisle:
        return await self.aisle_repo.create(aisle_in.model_dump())

    async def get_aisle(self, id: uuid.UUID) -> Optional[Aisle]:
        return await self.aisle_repo.get(id)
