import httpx
import asyncio
from typing import Dict, Any, List

class DataAggregator:
    def __init__(self, proxy_client: httpx.AsyncClient):
        self.client = proxy_client

    async def get_dashboard_summary(self, headers: Dict[str, str]) -> Dict[str, Any]:
        """
        Composite endpoint to aggregate data from multiple services.
        """
        # Parallel sub-requests with correct canonical paths
        tasks = [
            self._fetch("http://infra-facility:8006/api/v1/facilities", headers, method="GET"),
            self._fetch("http://infra-rack:8007/api/v1/racks", headers, method="GET"),
            self._fetch("http://infra-metrics-stream:8011/metrics/summary", headers, method="GET"),
            self._fetch("http://infra-alert-engine:8012/engine/status", headers, method="GET"),
            self._fetch("http://infra-runtime:8013/state/snapshot", headers, method="POST")
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        return {
            "facilities": results[0] if isinstance(results[0], list) else [],
            "racks": results[1] if isinstance(results[1], list) else [],
            "metrics": results[2] if isinstance(results[2], dict) else {},
            "alert_status": results[3] if isinstance(results[3], dict) else {},
            "runtime_snapshot": results[4] if isinstance(results[4], dict) else {}
        }

    async def _fetch(self, url: str, headers: Dict[str, str], method: str = "GET") -> Any:
        try:
            if method == "POST":
                resp = await self.client.post(url, headers=headers)
            else:
                resp = await self.client.get(url, headers=headers)
                
            if resp.status_code in [200, 201]:
                return resp.json()
            return None
        except Exception:
            return None
