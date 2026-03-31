import logging
import os
import time
import asyncio
from dataclasses import dataclass, field
from typing import Any

import httpx

logger = logging.getLogger("infra-simulation.infra-client")


@dataclass
class InfraGraphSnapshot:
    fetched_at: float
    devices: list[dict[str, Any]] = field(default_factory=list)
    racks: dict[str, dict[str, Any]] = field(default_factory=dict)
    halls: dict[str, dict[str, Any]] = field(default_factory=dict)
    facilities: dict[str, dict[str, Any]] = field(default_factory=dict)
    facility_capacity_mw: dict[str, float] = field(default_factory=dict)
    workspace_ids: set[str] = field(default_factory=set)


class InfraGraphClient:
    def __init__(self) -> None:
        self.device_base_url = os.getenv("DEVICE_SERVICE_URL", "http://infra-device:8008/api/v1")
        self.rack_base_url = os.getenv("RACK_SERVICE_URL", "http://infra-rack:8007/api/v1")
        self.facility_base_url = os.getenv("FACILITY_SERVICE_URL", "http://infra-facility:8006/api/v1")
        self.request_timeout_s = float(os.getenv("SIM_INFRA_REQUEST_TIMEOUT_S", "10"))
        self.max_devices_fetch = int(os.getenv("SIM_MAX_DEVICES_FETCH", "100000"))
        workspace_ids = os.getenv("SIM_WORKSPACE_IDS", "").strip()
        self.workspace_filter = {w.strip() for w in workspace_ids.split(",") if w.strip()} or None
        self._client: httpx.AsyncClient | None = None

    async def start(self) -> None:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self.request_timeout_s)

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def fetch_graph(self) -> InfraGraphSnapshot:
        if self._client is None:
            raise RuntimeError("InfraGraphClient is not started")

        devices_url = f"{self.device_base_url}/devices"
        racks_url = f"{self.rack_base_url}/racks"
        facilities_url = f"{self.facility_base_url}/facilities"

        devices_raw, racks_raw, facilities_raw = await self._fetch_core_entities(
            devices_url=devices_url,
            racks_url=racks_url,
            facilities_url=facilities_url,
        )

        # Rack service list endpoint is currently page-limited; backfill racks by explicit IDs from real devices.
        device_rack_ids = {str(d.get("rack_id", "")) for d in devices_raw if d.get("rack_id")}
        listed_rack_ids = {str(r.get("id", "")) for r in racks_raw if r.get("id")}
        missing_rack_ids = sorted(rid for rid in device_rack_ids if rid and rid not in listed_rack_ids)
        if missing_rack_ids:
            racks_raw.extend(await self._fetch_racks_by_id(missing_rack_ids))

        racks: dict[str, dict[str, Any]] = {}
        for rack in racks_raw:
            rack_id = str(rack.get("id", ""))
            workspace_id = str(rack.get("workspace_id", ""))
            if not rack_id:
                continue
            if self.workspace_filter and workspace_id not in self.workspace_filter:
                continue
            racks[rack_id] = rack

        facilities: dict[str, dict[str, Any]] = {}
        for facility in facilities_raw:
            facility_id = str(facility.get("id", ""))
            workspace_id = str(facility.get("workspace_id", ""))
            if not facility_id:
                continue
            if self.workspace_filter and workspace_id not in self.workspace_filter:
                continue
            facilities[facility_id] = facility

        devices: list[dict[str, Any]] = []
        for device in devices_raw:
            rack_id = str(device.get("rack_id", ""))
            if not rack_id or rack_id not in racks:
                # Ignore orphan devices that no longer map to a real rack.
                continue
            workspace_id = str(device.get("workspace_id", "") or racks[rack_id].get("workspace_id", ""))
            if self.workspace_filter and workspace_id not in self.workspace_filter:
                continue
            devices.append(device)

        hall_ids = sorted({str(r.get("hall_id", "")) for r in racks.values() if r.get("hall_id")})
        halls = await self._fetch_halls(hall_ids)

        # Facility capacity derives from real halls.
        facility_capacity_mw: dict[str, float] = {}
        for hall in halls.values():
            facility_id = str(hall.get("facility_id", ""))
            if not facility_id:
                continue
            facility_capacity_mw[facility_id] = facility_capacity_mw.get(facility_id, 0.0) + float(
                hall.get("power_capacity_mw") or 0.0
            )

        workspace_ids: set[str] = set()
        for rack in racks.values():
            workspace = str(rack.get("workspace_id", ""))
            if workspace:
                workspace_ids.add(workspace)
        for device in devices:
            workspace = str(device.get("workspace_id", ""))
            if workspace:
                workspace_ids.add(workspace)
        for facility in facilities.values():
            workspace = str(facility.get("workspace_id", ""))
            if workspace:
                workspace_ids.add(workspace)

        return InfraGraphSnapshot(
            fetched_at=time.time(),
            devices=devices,
            racks=racks,
            halls=halls,
            facilities=facilities,
            facility_capacity_mw=facility_capacity_mw,
            workspace_ids=workspace_ids,
        )

    async def _fetch_core_entities(
        self,
        *,
        devices_url: str,
        racks_url: str,
        facilities_url: str,
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
        assert self._client is not None
        devices_req = self._client.get(devices_url, params={"limit": self.max_devices_fetch})
        racks_req = self._client.get(racks_url)
        facilities_req = self._client.get(facilities_url)
        devices_resp, racks_resp, facilities_resp = await asyncio.gather(
            devices_req, racks_req, facilities_req
        )
        devices = self._as_list("devices", devices_resp)
        racks = self._as_list("racks", racks_resp)
        facilities = self._as_list("facilities", facilities_resp)
        return devices, racks, facilities

    async def _fetch_halls(self, hall_ids: list[str]) -> dict[str, dict[str, Any]]:
        halls: dict[str, dict[str, Any]] = {}
        if not hall_ids:
            return halls
        assert self._client is not None
        tasks = [self._client.get(f"{self.facility_base_url}/halls/{hall_id}") for hall_id in hall_ids]
        responses = await asyncio.gather(*tasks, return_exceptions=True)

        for hall_id, response in zip(hall_ids, responses):
            if isinstance(response, Exception):
                logger.warning("Failed hall fetch hall_id=%s error=%s", hall_id, response)
                continue
            if response.status_code != 200:
                logger.warning("Failed hall fetch hall_id=%s status=%s body=%s", hall_id, response.status_code, response.text)
                continue
            try:
                halls[hall_id] = response.json()
            except Exception as exc:
                logger.warning("Invalid hall payload hall_id=%s error=%s", hall_id, exc)
        return halls

    async def _fetch_racks_by_id(self, rack_ids: list[str]) -> list[dict[str, Any]]:
        racks: list[dict[str, Any]] = []
        if not rack_ids:
            return racks
        assert self._client is not None
        tasks = [self._client.get(f"{self.rack_base_url}/racks/{rack_id}") for rack_id in rack_ids]
        responses = await asyncio.gather(*tasks, return_exceptions=True)
        for rack_id, response in zip(rack_ids, responses):
            if isinstance(response, Exception):
                logger.warning("Failed rack fetch rack_id=%s error=%s", rack_id, response)
                continue
            if response.status_code != 200:
                logger.warning("Failed rack fetch rack_id=%s status=%s body=%s", rack_id, response.status_code, response.text)
                continue
            try:
                racks.append(response.json())
            except Exception as exc:
                logger.warning("Invalid rack payload rack_id=%s error=%s", rack_id, exc)
        return racks

    @staticmethod
    def _as_list(entity_name: str, response: httpx.Response) -> list[dict[str, Any]]:
        if response.status_code != 200:
            raise RuntimeError(
                f"Failed to fetch {entity_name}: status={response.status_code} body={response.text}"
            )
        payload = response.json()
        if isinstance(payload, list):
            return payload
        logger.warning("Unexpected %s payload type=%s; defaulting to empty list", entity_name, type(payload))
        return []
