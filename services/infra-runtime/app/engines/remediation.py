from typing import Optional

from app.schemas.runtime import IncomingAlert, OperationalStatus


class RemediationEngine:
    async def evaluate_remediation(self, alert: IncomingAlert) -> Optional[dict]:
        """
        Rule -> action policy mapping for first-line remediation.
        """
        policies = {
            "THERMAL_CRITICAL": {
                "action": "throttle_workload",
                "target_status": OperationalStatus.DEGRADED,
                "health_score": 0.6,
                "sub_states": {"thermal": "HIGH", "power": "NORMAL", "network": "NORMAL"},
                "reason": "Critical thermal threshold breached; reduce load to cut heat generation.",
                "fallback_policy": "shutdown_rack",
            },
            "THERMAL_WARNING": {
                "action": "increase_cooling",
                "target_status": OperationalStatus.DEGRADED,
                "health_score": 0.8,
                "sub_states": {"thermal": "ELEVATED", "power": "NORMAL", "network": "NORMAL"},
                "reason": "Thermal warning detected; boost cooling as first response.",
                "fallback_policy": "throttle_workload",
            },
            "POWER_CRITICAL": {
                "action": "redistribute_load",
                "target_status": OperationalStatus.DEGRADED,
                "health_score": 0.55,
                "sub_states": {"thermal": "NORMAL", "power": "HIGH", "network": "NORMAL"},
                "reason": "Power envelope exceeded; rebalance compute distribution.",
                "fallback_policy": "isolate_power_domain",
            },
            "NETWORK_LATENCY": {
                "action": "reroute_traffic",
                "target_status": OperationalStatus.DEGRADED,
                "health_score": 0.7,
                "sub_states": {"thermal": "NORMAL", "power": "NORMAL", "network": "HIGH_LATENCY"},
                "reason": "Network latency exceeded SLO; shift path to alternate route.",
                "fallback_policy": "isolate_entity",
            },
        }

        policy = policies.get(alert.rule_id)
        if policy:
            return policy

        # Fallback policy by metric domain.
        metric = alert.metric_name.lower()
        if "temp" in metric:
            return {
                "action": "throttle_workload",
                "target_status": OperationalStatus.DEGRADED,
                "health_score": 0.65,
                "sub_states": {"thermal": "HIGH", "power": "NORMAL", "network": "NORMAL"},
                "reason": "Fallback thermal policy selected from metric domain.",
                "fallback_policy": "shutdown_rack",
            }
        if "power" in metric:
            return {
                "action": "redistribute_load",
                "target_status": OperationalStatus.DEGRADED,
                "health_score": 0.6,
                "sub_states": {"thermal": "NORMAL", "power": "HIGH", "network": "NORMAL"},
                "reason": "Fallback power policy selected from metric domain.",
                "fallback_policy": "isolate_power_domain",
            }
        if "network" in metric or "latency" in metric:
            return {
                "action": "reroute_traffic",
                "target_status": OperationalStatus.DEGRADED,
                "health_score": 0.7,
                "sub_states": {"thermal": "NORMAL", "power": "NORMAL", "network": "HIGH_LATENCY"},
                "reason": "Fallback network policy selected from metric domain.",
                "fallback_policy": "isolate_entity",
            }
        return None

    async def evaluate_secondary_action(self, alert: IncomingAlert) -> dict:
        """
        Escalation policy when verification fails.
        """
        metric = alert.metric_name.lower()
        if "temp" in metric:
            return {
                "action": "shutdown_rack",
                "target_status": OperationalStatus.FAILED,
                "health_score": 0.2,
                "sub_states": {"thermal": "CRITICAL", "power": "HIGH", "network": "NORMAL"},
                "reason": "Thermal remediation failed; hard isolation required.",
            }
        if "power" in metric:
            return {
                "action": "isolate_power_domain",
                "target_status": OperationalStatus.ISOLATED,
                "health_score": 0.3,
                "sub_states": {"thermal": "NORMAL", "power": "CRITICAL", "network": "NORMAL"},
                "reason": "Power remediation failed; isolate electrical domain.",
            }
        return {
            "action": "isolate_entity",
            "target_status": OperationalStatus.ISOLATED,
            "health_score": 0.35,
            "sub_states": {"thermal": "UNKNOWN", "power": "UNKNOWN", "network": "DEGRADED"},
            "reason": "Generic secondary isolation fallback.",
        }
