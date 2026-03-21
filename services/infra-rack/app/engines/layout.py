import uuid
from typing import List, Dict, Any
from app.schemas.domain import GridLayoutParams
from app.models.domain import RackType, AllocationState

class LayoutEngine:
    @staticmethod
    def generate_grid_layout(params: GridLayoutParams) -> List[Dict[str, Any]]:
        """
        Generates a deterministic grid of racks based on density and spacing parameters.
        """
        racks = []
        
        for r in range(params.rows):
            # Calculate Y position (Row axis)
            pos_y = params.start_y_m + (r * params.row_pitch_m)
            
            # Simple alternating hot/cold aisle pattern logic
            is_hot_aisle = (r % 2 == 1) if params.aisle_pattern == "hot_cold" else False
            aisle_type = "hot" if is_hot_aisle else "cold"
            
            for c in range(params.cols):
                # Calculate X position (Column axis)
                pos_x = params.start_x_m + (c * params.col_pitch_m)
                
                rack_data = {
                    "workspace_id": params.workspace_id,
                    "facility_id": params.facility_id,
                    "hall_id": params.hall_id,
                    "zone_id": params.zone_id,
                    "aisle_id": params.aisle_id,
                    "position_x_m": round(pos_x, 3),
                    "position_y_m": round(pos_y, 3),
                    "position_z_m": 0.0,
                    "row_index": r,
                    "column_index": c,
                    "aisle_type": aisle_type,
                    "rack_type": params.rack_type,
                    "allocation_state": AllocationState.FREE
                }
                racks.append(rack_data)
                
        return racks
