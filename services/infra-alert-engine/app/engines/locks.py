import os

import redis.asyncio as redis
import structlog

from app.schemas.alerts import EntityType, MetricStreamEvent


class AlertLockManager:
    def __init__(self, redis_url: str | None = None):
        self.redis_url = redis_url or os.getenv("REDIS_URL", "redis://redis:6379")
        self.redis = redis.from_url(self.redis_url, decode_responses=True)
        self.logger = structlog.get_logger("infra-alert-engine.redis-locks")

    async def is_locked(self, tenant_id: str, entity_id: str, rule_id: str) -> bool:
        key = self._build_key(tenant_id=tenant_id, entity_id=entity_id, rule_id=rule_id)
        try:
            return bool(await self.redis.exists(key))
        except Exception as exc:
            # Redis failures should not block alert generation.
            self.logger.warning("redis_lock_check_failed", key=key, error=str(exc))
            return False

    async def lock(self, tenant_id: str, entity_id: str, rule_id: str, ttl_s: int) -> None:
        key = self._build_key(tenant_id=tenant_id, entity_id=entity_id, rule_id=rule_id)
        try:
            await self.redis.setex(key, ttl_s, "active")
        except Exception as exc:
            # Redis failures should not block pipeline health.
            self.logger.warning("redis_lock_set_failed", key=key, ttl_s=ttl_s, error=str(exc))

    async def close(self) -> None:
        await self.redis.aclose()

    @staticmethod
    def resolve_entity(event: MetricStreamEvent) -> tuple[str, EntityType]:
        if event.device_id:
            return event.device_id, EntityType.DEVICE
        if event.rack_id:
            return event.rack_id, EntityType.RACK
        return event.facility_id, EntityType.FACILITY

    @staticmethod
    def _build_key(tenant_id: str, entity_id: str, rule_id: str) -> str:
        return f"alert_lock:{tenant_id}:{entity_id}:{rule_id}"
