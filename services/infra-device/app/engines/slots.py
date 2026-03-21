from typing import List
import uuid
from app.models.domain import Device

class SlotEngine:
    @staticmethod
    def validate_slot_availability(
        rack_id: uuid.UUID,
        start_u: int,
        size_u: int,
        existing_devices: List[Device]
    ) -> bool:
        """
        Validates if a range of U slots in a rack is occupied.
        Logic: A slot is occupied if an existing device's [start_u, start_u + size_u) 
        overlaps with the requested [requested_start, requested_start + requested_size).
        """
        requested_range = set(range(start_u, start_u + size_u))
        
        for device in existing_devices:
            # Note: We use a simple integer range check for U-slots.
            # Racks are typically 42U or 48U.
            device_range = set(range(device.start_u, device.start_u + device.size_u))
            if requested_range.intersection(device_range):
                return False # Collision detected
                
        return True

    @staticmethod
    def find_next_available_slot(
        rack_id: uuid.UUID,
        size_u: int,
        rack_height_u: int,
        existing_devices: List[Device]
    ) -> int:
        """
        Finds the first available contiguous U-slot from bottom to top.
        Returns -1 if no contiguous slot of requested size is found.
        """
        occupied_slots = set()
        for device in existing_devices:
            occupied_slots.update(range(device.start_u, device.start_u + device.size_u))
            
        for u in range(1, rack_height_u - size_u + 2):
            requested_range = set(range(u, u + size_u))
            if not requested_range.intersection(occupied_slots):
                return u
                
        return -1 # No space
