import uuid
from typing import List, Optional, Any
from app.repositories.base import RackRepository
from app.engines.layout import LayoutEngine
from app.schemas.domain import RackCreate, RackUpdate, GridLayoutParams
from app.models.domain import Rack, AllocationState

class RackService:
    def __init__(self, session):
        self.repo = RackRepository(session)
        self.layout_engine = LayoutEngine()

    @staticmethod
    def _normalize_dimensions(rack: Rack) -> Rack:
        """
        Backfill legacy null width_mm/depth_mm values to keep API responses valid.
        """
        if rack.width_mm is None:
            rack.width_mm = int(round((rack.width_m or 0.6) * 1000))
        if rack.depth_mm is None:
            rack.depth_mm = int(round((rack.depth_m or 1.1) * 1000))
        return rack

    async def create_rack(self, rack_in: RackCreate) -> Rack:
        rack = await self.repo.create(rack_in.model_dump())
        return self._normalize_dimensions(rack)

    async def get_rack(self, id: uuid.UUID) -> Optional[Rack]:
        rack = await self.repo.get(id)
        if not rack:
            return None
        return self._normalize_dimensions(rack)

    async def list_racks(self, workspace_id: Optional[uuid.UUID] = None) -> List[Rack]:
        if workspace_id:
            racks = await self.repo.list_by_workspace(workspace_id)
        else:
            racks = await self.repo.list()
        return [self._normalize_dimensions(rack) for rack in racks]

    async def delete_rack(self, id: uuid.UUID) -> bool:
        return await self.repo.delete(id)

    async def generate_grid(self, params: GridLayoutParams) -> List[Rack]:
        """
        Orchestrates deterministic grid generation and bulk persistence.
        """
        racks_data = self.layout_engine.generate_grid_layout(params)
        racks = await self.repo.bulk_create(racks_data)
        return [self._normalize_dimensions(rack) for rack in racks]

    async def move_rack(self, id: uuid.UUID, x: float, y: float, orientation: float) -> Optional[Rack]:
        """
        Updates rack position with logical snapping (logic to be enhanced).
        """
        update_data = {
            "position_x_m": round(x, 3),
            "position_y_m": round(y, 3),
            "orientation": round(orientation, 1)
        }
        rack = await self.repo.update(id, update_data)
        if not rack:
            return None
        return self._normalize_dimensions(rack)

    async def assign_logical_space(self, id: uuid.UUID, logical_space_id: uuid.UUID) -> Optional[Rack]:
        """
        Maps a rack to a specific tenant/logical space.
        """
        update_data = {
            "logical_space_id": logical_space_id,
            "allocation_state": AllocationState.ALLOCATED
        }
        rack = await self.repo.update(id, update_data)
        if not rack:
            return None
        return self._normalize_dimensions(rack)
