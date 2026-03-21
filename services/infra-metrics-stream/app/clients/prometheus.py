import httpx
from typing import List, Dict, Any
import os
from app.schemas.events import InfraMetricEvent

class PrometheusClient:
    def __init__(self, base_url: str = "http://prometheus:9090"):
        self.base_url = base_url
        self.client = httpx.AsyncClient(base_url=base_url, timeout=5.0)

    async def query_metrics(self, query: str) -> List[InfraMetricEvent]:
        """
        Queries Prometheus and transforms vector results into InfraMetricEvents.
        """
        url = "/api/v1/query"
        params = {"query": query}
        
        try:
            response = await self.client.get(url, params=params)
            response.raise_for_status()
            data = response.json()
            
            if data["status"] != "success":
                return []
                
            results = data["data"]["result"]
            events = []
            
            for res in results:
                metric = res["metric"]
                value = float(res["value"][1])
                timestamp = float(res["value"][0])
                
                # Enrich with labels
                events.append(InfraMetricEvent(
                    metric_name=metric.get("__name__", query),
                    value=value,
                    timestamp=timestamp,
                    tenant_id=metric.get("tenant_id"),
                    workspace_id=metric.get("workspace_id"),
                    facility_id=metric.get("facility_id"),
                    rack_id=metric.get("rack_id"),
                    device_id=metric.get("device_id"),
                    labels={k: v for k, v in metric.items() if k not in ["__name__", "tenant_id", "workspace_id", "facility_id", "rack_id", "device_id"]}
                ))
            return events
        except Exception as e:
            # In a real app, use structured logging here
            print(f"Error querying Prometheus: {e}")
            return []

    async def close(self):
        await self.client.aclose()
