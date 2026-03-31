import asyncio
import logging
import os
import random
import time
from typing import Any

from app.services.infra_client import InfraGraphClient, InfraGraphSnapshot
from app.services.prometheus_formatter import build_prometheus_text
from app.services.state_store import MetricsStore

logger = logging.getLogger("infra-simulation.loop")


def _normalize_device_type(raw_type: str | None) -> str:
    value = str(raw_type or "").lower()
    if value == "switch":
        return "network"
    return value or "server"


def _as_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "y", "on"}:
        return True
    if normalized in {"0", "false", "no", "n", "off"}:
        return False
    return default


class SimulationLoop:
    def __init__(self, tick_interval_s: float, metrics_store: MetricsStore):
        self.tick_interval_s = tick_interval_s
        self.graph_refresh_interval_s = float(os.getenv("SIM_GRAPH_REFRESH_INTERVAL_S", "30"))
        self.ambient_temp_c = float(os.getenv("SIM_AMBIENT_TEMP_C", "22.0"))
        self.thermal_factor = float(os.getenv("SIM_THERMAL_FACTOR", "0.9"))
        self.gpu_spike_probability = float(os.getenv("SIM_GPU_SPIKE_PROBABILITY", "0.12"))
        self.gpu_spike_min = float(os.getenv("SIM_GPU_SPIKE_MIN_MULTIPLIER", "1.15"))
        self.gpu_spike_max = float(os.getenv("SIM_GPU_SPIKE_MAX_MULTIPLIER", "1.55"))
        # Bad telemetry injection for resilience and alert pipeline testing.
        self.bad_data_enabled = _as_bool(os.getenv("SIM_BAD_DATA_ENABLED"), True)
        self.bad_data_probability = float(os.getenv("SIM_BAD_DATA_PROBABILITY", "0.03"))
        self.bad_power_spike_min = float(os.getenv("SIM_BAD_POWER_SPIKE_MIN_MULTIPLIER", "2.0"))
        self.bad_power_spike_max = float(os.getenv("SIM_BAD_POWER_SPIKE_MAX_MULTIPLIER", "5.5"))
        self.bad_temp_offset_min = float(os.getenv("SIM_BAD_TEMP_OFFSET_MIN_C", "12.0"))
        self.bad_temp_offset_max = float(os.getenv("SIM_BAD_TEMP_OFFSET_MAX_C", "32.0"))
        self.bad_drop_power_max_kw = float(os.getenv("SIM_BAD_DROP_POWER_MAX_KW", "0.08"))
        self.bad_drop_temp_min_c = float(os.getenv("SIM_BAD_DROP_TEMP_MIN_C", "-8.0"))
        self.bad_drop_temp_max_c = float(os.getenv("SIM_BAD_DROP_TEMP_MAX_C", "6.0"))
        self._rng = random.Random()

        self.running = False
        self._task: asyncio.Task | None = None
        self._refresh_task: asyncio.Task | None = None
        self._last_refresh_monotonic = 0.0
        self._graph_lock = asyncio.Lock()
        self._graph = InfraGraphSnapshot(fetched_at=0.0)
        self._metrics_store = metrics_store
        self._infra_client = InfraGraphClient()

    def _inject_bad_device_data(
        self,
        *,
        device_id: str,
        device_type: str,
        power_kw: float,
        temp_c: float,
    ) -> tuple[float, float, str | None]:
        if not self.bad_data_enabled:
            return power_kw, temp_c, None
        if self._rng.random() >= self.bad_data_probability:
            return power_kw, temp_c, None

        # GPU devices get slightly more bursty anomaly patterns.
        anomaly_modes = ["power_spike", "temp_spike", "sensor_drop", "noisy"]
        if device_type == "gpu":
            anomaly_modes.extend(["power_spike", "temp_spike"])
        mode = self._rng.choice(anomaly_modes)

        if mode == "power_spike":
            power_kw *= self._rng.uniform(self.bad_power_spike_min, self.bad_power_spike_max)
            temp_c += self._rng.uniform(self.bad_temp_offset_min * 0.3, self.bad_temp_offset_max)
        elif mode == "temp_spike":
            temp_c += self._rng.uniform(self.bad_temp_offset_min, self.bad_temp_offset_max)
        elif mode == "sensor_drop":
            power_kw = self._rng.uniform(0.0, self.bad_drop_power_max_kw)
            temp_c = self._rng.uniform(self.bad_drop_temp_min_c, self.bad_drop_temp_max_c)
        else:
            power_kw *= self._rng.uniform(0.2, self.bad_power_spike_max)
            temp_c += self._rng.uniform(-14.0, self.bad_temp_offset_max)

        logger.debug(
            "Injected bad telemetry device_id=%s device_type=%s mode=%s power_kw=%.4f temp_c=%.4f",
            device_id,
            device_type,
            mode,
            power_kw,
            temp_c,
        )
        return power_kw, temp_c, mode

    async def start(self) -> None:
        if self.running:
            return
        self.running = True
        await self._infra_client.start()
        await self._refresh_graph(force=True)
        await self._simulate_tick()
        self._task = asyncio.create_task(self._run(), name="infra-simulation-loop")
        logger.info("Simulation loop started tick_interval_s=%s refresh_interval_s=%s", self.tick_interval_s, self.graph_refresh_interval_s)

    async def stop(self) -> None:
        self.running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        if self._refresh_task:
            self._refresh_task.cancel()
            try:
                await self._refresh_task
            except asyncio.CancelledError:
                pass
            self._refresh_task = None
        await self._infra_client.close()
        logger.info("Simulation loop stopped")

    async def _run(self) -> None:
        while self.running:
            tick_started = time.monotonic()
            try:
                await self._maybe_refresh_graph()
                await self._simulate_tick()
            except Exception:
                logger.exception("Simulation tick failed")

            elapsed = time.monotonic() - tick_started
            await asyncio.sleep(max(0.0, self.tick_interval_s - elapsed))

    async def _maybe_refresh_graph(self) -> None:
        now = time.monotonic()
        if self._refresh_task and self._refresh_task.done():
            try:
                await self._refresh_task
            except Exception:
                logger.exception("Background graph refresh failed")
            finally:
                self._refresh_task = None
        if (now - self._last_refresh_monotonic) >= self.graph_refresh_interval_s and self._refresh_task is None:
            self._refresh_task = asyncio.create_task(self._refresh_graph(force=False), name="infra-graph-refresh")

    async def _refresh_graph(self, force: bool) -> None:
        try:
            graph = await self._infra_client.fetch_graph()
            async with self._graph_lock:
                self._graph = graph
            self._last_refresh_monotonic = time.monotonic()
            logger.info(
                "Infra graph refreshed force=%s workspaces=%s racks=%s devices=%s facilities=%s halls=%s",
                force,
                len(graph.workspace_ids),
                len(graph.racks),
                len(graph.devices),
                len(graph.facilities),
                len(graph.halls),
            )
        except Exception:
            logger.exception("Infra graph refresh failed")
            if force:
                # On initial boot keep empty graph but stay alive.
                self._last_refresh_monotonic = time.monotonic()

    async def _simulate_tick(self) -> None:
        async with self._graph_lock:
            graph = self._graph

        if not graph.racks:
            await self._metrics_store.update(
                devices=[],
                racks=[],
                facilities=[],
                prometheus_text="",
            )
            return

        device_metrics: list[dict[str, Any]] = []
        rack_rollup: dict[str, dict[str, Any]] = {}

        # Initialize rollup from real rack inventory (multi-tenant).
        for rack_id, rack in graph.racks.items():
            workspace_id = str(rack.get("workspace_id", ""))
            facility_id = str(rack.get("facility_id", ""))
            rack_rollup[rack_id] = {
                "rack_id": rack_id,
                "workspace_id": workspace_id,
                "facility_id": facility_id,
                "power_kw": 0.0,
                "weighted_temp_sum": 0.0,
                "weight_sum": 0.0,
            }

        for device in graph.devices:
            rack_id = str(device.get("rack_id", ""))
            rack = graph.racks.get(rack_id)
            if not rack:
                continue

            workspace_id = str(device.get("workspace_id", "") or rack.get("workspace_id", ""))
            facility_id = str(rack.get("facility_id", ""))
            device_type = _normalize_device_type(device.get("device_type"))

            base_power_kw = float(device.get("power_draw_kw") or 0.0)
            if base_power_kw <= 0:
                base_power_kw = 0.5

            power_kw = base_power_kw * self._rng.uniform(0.5, 1.2)
            if device_type == "gpu" and self._rng.random() < self.gpu_spike_probability:
                power_kw *= self._rng.uniform(self.gpu_spike_min, self.gpu_spike_max)

            temp_c = self.ambient_temp_c + (power_kw * self.thermal_factor)
            temp_c += self._rng.uniform(-0.35, 0.35)
            device_id = str(device.get("id", ""))
            power_kw, temp_c, bad_mode = self._inject_bad_device_data(
                device_id=device_id,
                device_type=device_type,
                power_kw=power_kw,
                temp_c=temp_c,
            )

            # Keep values finite and within sane exporter bounds.
            power_kw = round(min(max(power_kw, 0.0), 250.0), 4)
            temp_c = round(min(max(temp_c, -50.0), 120.0), 4)

            device_metrics.append(
                {
                    "device_id": device_id,
                    "device_type": device_type,
                    "rack_id": rack_id,
                    "workspace_id": workspace_id,
                    "facility_id": facility_id,
                    "power_kw": power_kw,
                    "temp_c": temp_c,
                    "telemetry_quality": "bad" if bad_mode else "normal",
                    "fault_mode": bad_mode,
                }
            )

            rollup = rack_rollup[rack_id]
            rollup["power_kw"] += power_kw
            rollup["weighted_temp_sum"] += temp_c * max(power_kw, 0.001)
            rollup["weight_sum"] += max(power_kw, 0.001)

        rack_metrics: list[dict[str, Any]] = []
        for rack_id, rollup in rack_rollup.items():
            weight = rollup["weight_sum"]
            if weight > 0:
                rack_temp = rollup["weighted_temp_sum"] / weight
            else:
                rack_temp = self.ambient_temp_c
            rack_metrics.append(
                {
                    "rack_id": rack_id,
                    "workspace_id": rollup["workspace_id"],
                    "facility_id": rollup["facility_id"],
                    "power_kw": round(rollup["power_kw"], 4),
                    "temp_c": round(rack_temp, 4),
                }
            )

        facility_rollup: dict[str, dict[str, Any]] = {}
        for facility_id, facility in graph.facilities.items():
            facility_rollup[facility_id] = {
                "facility_id": facility_id,
                "workspace_id": str(facility.get("workspace_id", "")),
                "power_kw": 0.0,
            }
        for rack_metric in rack_metrics:
            facility_id = rack_metric["facility_id"]
            if not facility_id:
                continue
            if facility_id not in facility_rollup:
                facility_rollup[facility_id] = {
                    "facility_id": facility_id,
                    "workspace_id": rack_metric["workspace_id"],
                    "power_kw": 0.0,
                }
            facility_rollup[facility_id]["power_kw"] += float(rack_metric["power_kw"])

        facility_metrics: list[dict[str, Any]] = []
        for facility_id, rollup in facility_rollup.items():
            power_mw = round(rollup["power_kw"] / 1000.0, 6)
            capacity_mw = float(graph.facility_capacity_mw.get(facility_id, 0.0))
            if capacity_mw > 0:
                risk_index = power_mw / capacity_mw
            else:
                risk_index = 0.0
            facility_metrics.append(
                {
                    "facility_id": facility_id,
                    "workspace_id": rollup["workspace_id"],
                    "power_mw": power_mw,
                    "risk_index": round(risk_index, 6),
                }
            )

        prometheus_text = build_prometheus_text(
            devices=device_metrics,
            racks=rack_metrics,
            facilities=facility_metrics,
        )

        await self._metrics_store.update(
            devices=device_metrics,
            racks=rack_metrics,
            facilities=facility_metrics,
            prometheus_text=prometheus_text,
        )
