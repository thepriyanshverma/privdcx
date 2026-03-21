import asyncio
import time
from app.engines.power import PowerEngine
from app.engines.thermal import ThermalEngine
from app.engines.network import NetworkEngine
from app.api.metrics import RACK_POWER, RACK_TEMP, DEVICE_LATENCY, INFRA_RISK
from app.core.mongo import db

class SimulationLoop:
    def __init__(self, tick_interval_s: float = 1.0):
        self.tick_interval_s = tick_interval_s
        self.running = False
        self.power_engine = PowerEngine()
        self.thermal_engine = ThermalEngine()
        self.network_engine = NetworkEngine()

    async def start(self):
        self.running = True
        asyncio.create_task(self._run())

    async def stop(self):
        self.running = False

    async def _run(self):
        while self.running:
            start_time = time.time()
            
            # --- Simulation Tick ---
            # 1. Simulate Power
            # (In a real scenario, we'd fetch actual rack IDs from rack-service)
            # For this MVP, we simulate a few dummy racks to verify the pipeline.
            dummy_racks = ["RACK-001", "RACK-002", "RACK-003"]
            
            for rid in dummy_racks:
                p_kw = self.power_engine.simulate_device_power(4.5)
                t_c = self.thermal_engine.simulate_rack_temp(22.0, p_kw)
                
                # Emit to Prometheus
                RACK_POWER.labels(rack_id=rid, workspace_id="default").set(p_kw)
                RACK_TEMP.labels(rack_id=rid).set(t_c)
                
                # Persist to Mongo (Sampling)
                if int(time.time()) % 5 == 0:
                    await db.telemetry.insert_one({
                        "timestamp": time.time(),
                        "rack_id": rid,
                        "power_kw": p_kw,
                        "temp_c": t_c
                    })

            # 2. Simulate Facility Risk
            INFRA_RISK.labels(facility_id="DC-ALPHA").set(0.12)

            # --- Wait for next tick ---
            elapsed = time.time() - start_time
            await asyncio.sleep(max(0, self.tick_interval_s - elapsed))
