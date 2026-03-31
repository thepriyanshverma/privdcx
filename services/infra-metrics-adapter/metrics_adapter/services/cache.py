import json
import os
import time
from typing import Any, Dict

import redis.asyncio as redis

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
ENTITY_TTL_SECONDS = int(os.getenv("ENTITY_METRICS_TTL_SECONDS", "5"))

redis_client = redis.from_url(REDIS_URL, encoding="utf-8", decode_responses=True)


def _entity_key(entity_id: str) -> str:
    return f"metrics:entity:{entity_id}"


def _workspace_index_key(workspace_id: str) -> str:
    return f"metrics:index:workspace:{workspace_id}"


def _facility_index_key(workspace_id: str, facility_id: str) -> str:
    return f"metrics:index:workspace:{workspace_id}:facility:{facility_id}"


def _parse_json(raw_data: str | None) -> Dict[str, Any] | None:
    if not raw_data:
        return None
    try:
        parsed = json.loads(raw_data)
        if isinstance(parsed, dict):
            return parsed
        return None
    except json.JSONDecodeError:
        return None


async def set_entity_metrics(
    entity_id: str,
    data: Dict[str, Any],
    workspace_id: str | None = None,
    facility_id: str | None = None,
) -> None:
    payload = dict(data or {})
    payload["entity_id"] = entity_id
    payload["updated_at"] = float(payload.get("updated_at") or time.time())
    payload["workspace_id"] = str(workspace_id) if workspace_id else payload.get("workspace_id")
    payload["facility_id"] = str(facility_id) if facility_id else payload.get("facility_id")

    pipe = redis_client.pipeline()
    pipe.set(_entity_key(entity_id), json.dumps(payload), ex=ENTITY_TTL_SECONDS)

    if workspace_id:
        workspace_key = _workspace_index_key(workspace_id)
        pipe.sadd(workspace_key, entity_id)
        pipe.expire(workspace_key, max(ENTITY_TTL_SECONDS * 3, 15))
        if facility_id:
            facility_key = _facility_index_key(workspace_id, facility_id)
            pipe.sadd(facility_key, entity_id)
            pipe.expire(facility_key, max(ENTITY_TTL_SECONDS * 3, 15))

    await pipe.execute()


async def get_entity_metrics(entity_id: str) -> Dict[str, Any] | None:
    raw = await redis_client.get(_entity_key(entity_id))
    return _parse_json(raw)


async def get_entities_for_workspace(workspace_id: str, facility_id: str | None = None) -> Dict[str, Dict[str, Any]]:
    if facility_id:
        entity_ids = await redis_client.smembers(_facility_index_key(workspace_id, facility_id))
    else:
        entity_ids = await redis_client.smembers(_workspace_index_key(workspace_id))

    if not entity_ids:
        return {}

    keys = [_entity_key(entity_id) for entity_id in sorted(entity_ids)]
    raw_rows = await redis_client.mget(keys)
    response: Dict[str, Dict[str, Any]] = {}

    for row in raw_rows:
        parsed = _parse_json(row)
        if not parsed:
            continue
        entity_id = str(parsed.get("entity_id") or "").strip()
        if not entity_id:
            continue
        response[entity_id] = parsed

    return response


async def get_all_entity_metrics(limit: int = 2000) -> Dict[str, Dict[str, Any]]:
    cursor = 0
    keys: list[str] = []
    pattern = "metrics:entity:*"

    while True:
        cursor, batch = await redis_client.scan(cursor=cursor, match=pattern, count=250)
        keys.extend(batch)
        if cursor == 0 or len(keys) >= limit:
            break

    if not keys:
        return {}

    raw_rows = await redis_client.mget(keys[:limit])
    response: Dict[str, Dict[str, Any]] = {}
    for row in raw_rows:
        parsed = _parse_json(row)
        if not parsed:
            continue
        entity_id = str(parsed.get("entity_id") or "").strip()
        if not entity_id:
            continue
        response[entity_id] = parsed

    return response


async def close_cache() -> None:
    await redis_client.aclose()
