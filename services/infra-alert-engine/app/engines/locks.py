import redis.asyncio as redis
import os

class AlertLockManager:
    def __init__(self, redis_url: str = "redis://redis:6379"):
        self.redis = redis.from_url(redis_url)

    async def is_locked(self, tenant_id: str, entity_id: str, rule_id: str) -> bool:
        """
        Checks if an alert for this specific context is currently suppressed.
        """
        key = f"alert_lock:{tenant_id}:{entity_id}:{rule_id}"
        return await self.redis.exists(key) > 0

    async def lock(self, tenant_id: str, entity_id: str, rule_id: str, ttl_s: int = 60):
        """
        Applies a suppression lock for a specific alert.
        """
        key = f"alert_lock:{tenant_id}:{entity_id}:{rule_id}"
        await self.redis.setex(key, ttl_s, "active")

    async def close(self):
        await self.redis.close()
        
    def get_entity_id(self, event: dict) -> str:
        # Priority: device_id > rack_id > facility_id
        return event.get("device_id") or event.get("rack_id") or event.get("facility_id") or "global"
