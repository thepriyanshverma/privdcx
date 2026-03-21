from typing import Optional, Dict, Any
from app.schemas.runtime import OperationalStatus, RemediationAction

class RemediationEngine:
    async def evaluate_remediation(self, alert: dict) -> Optional[dict]:
        """
        Determines the appropriate remediation action based on alert severity and rule.
        """
        rule_id = alert.get("rule_id")
        severity = alert.get("severity")
        
        # Policy Mapping: Rule -> Action
        policies = {
            "THERMAL_CRITICAL": {
                "action": "throttle_cluster",
                "target_status": OperationalStatus.DEGRADED,
                "msg": "High temp detected, throttling compute load."
            },
            "THERMAL_WARNING": {
                "action": "increase_cooling",
                "target_status": OperationalStatus.DEGRADED,
                "msg": "Thermal warning, bumping fan speeds."
            },
            "POWER_CRITICAL": {
                "action": "shed_noncritical_load",
                "target_status": OperationalStatus.FAILED,
                "msg": "Power overload, shedding non-critical equipment."
            }
        }
        
        policy = policies.get(rule_id)
        if not policy:
            return None
            
        return policy
