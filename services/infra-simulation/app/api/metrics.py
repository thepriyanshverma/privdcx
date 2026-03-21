from prometheus_client import Gauge, generate_latest, CONTENT_TYPE_LATEST
from fastapi import Response

# Metrics Definitions
RACK_POWER = Gauge("rack_power_kw", "Current power draw of a rack in kW", ["rack_id", "workspace_id"])
RACK_TEMP = Gauge("rack_temp_c", "Ambient temperature at rack inlet in Celsius", ["rack_id"])
DEVICE_LATENCY = Gauge("device_latency_ms", "End-to-end network latency for a device", ["device_id"])
INFRA_RISK = Gauge("infra_risk_index", "Aggregated risk probability for the facility", ["facility_id"])

def get_prometheus_metrics():
    """
    Exposes metrics in Prometheus exposition format.
    """
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
