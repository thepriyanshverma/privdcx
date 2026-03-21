from typing import List, Optional
from app.schemas.alerts import AlertRule, InfraAlertEvent, RuleType, AlertSeverity

class RuleEngine:
    def __init__(self, rules: List[AlertRule]):
        self.rules = rules

    def evaluate(self, metric_event: dict) -> List[InfraAlertEvent]:
        """
        Evaluates a single metric event against all configured rules.
        """
        alerts = []
        metric_name = metric_event.get("metric_name")
        metric_value = metric_event.get("value")
        
        for rule in self.rules:
            if rule.rule_type == RuleType.THRESHOLD:
                if rule.metric_name == metric_name:
                    if self._check_threshold(metric_value, rule.operator, rule.threshold):
                        alerts.append(self._create_alert(metric_event, rule))
                        
            # Composite rules would require state/windowing, 
            # for MVP we focus on multi-condition logic if available in event
            # (Simplified version)
            
        return alerts

    def _check_threshold(self, value: float, operator: str, threshold: float) -> bool:
        if operator == ">": return value > threshold
        if operator == "<": return value < threshold
        if operator == ">=": return value >= threshold
        if operator == "<=": return value <= threshold
        if operator == "==": return value == threshold
        return False

    def _create_alert(self, event: dict, rule: AlertRule) -> InfraAlertEvent:
        return InfraAlertEvent(
            tenant_id=event.get("tenant_id"),
            workspace_id=event.get("workspace_id"),
            facility_id=event.get("facility_id"),
            rack_id=event.get("rack_id"),
            severity=rule.severity,
            rule_id=rule.id,
            metric_name=event.get("metric_name"),
            metric_value=event.get("value"),
            description=f"{rule.description} (Value: {event.get('value')})"
        )
