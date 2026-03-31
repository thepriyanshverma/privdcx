from fastapi import Response

from app.services.state_store import MetricsStore


async def get_prometheus_metrics(metrics_store: MetricsStore) -> Response:
    """
    Returns precomputed Prometheus exposition payload from memory.
    No DB calls. No recomputation.
    """
    snapshot = await metrics_store.snapshot()
    payload = snapshot["prometheus_text"] or ""
    return Response(content=payload, headers={"Content-Type": "text/plain; version=0.0.4"})
