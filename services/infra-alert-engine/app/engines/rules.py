from collections import defaultdict
from operator import eq, ge, gt, le, lt
from typing import Iterable

import structlog

from app.schemas.alerts import AlertRule, MetricStreamEvent


_OPERATORS = {
    ">": gt,
    "<": lt,
    ">=": ge,
    "<=": le,
    "==": eq,
}


class RuleEngine:
    def __init__(self, rules: Iterable[AlertRule] | None = None):
        self.logger = structlog.get_logger("infra-alert-engine.rules")
        self._rules_by_id: dict[str, AlertRule] = {}
        self._rules_by_metric: dict[str, tuple[AlertRule, ...]] = {}
        if rules:
            self.replace_rules(rules)

    def replace_rules(self, rules: Iterable[AlertRule]) -> None:
        self._rules_by_id = {rule.rule_id: rule for rule in rules}
        self._rebuild_metric_index()

    def list_rules(self) -> list[AlertRule]:
        return sorted(self._rules_by_id.values(), key=lambda rule: rule.rule_id)

    def upsert_rule(self, rule: AlertRule) -> AlertRule:
        self._rules_by_id[rule.rule_id] = rule
        self._rebuild_metric_index()
        return rule

    def delete_rule(self, rule_id: str) -> bool:
        removed = self._rules_by_id.pop(rule_id, None)
        if removed is None:
            return False
        self._rebuild_metric_index()
        return True

    def evaluate_event(self, metric_event: MetricStreamEvent) -> list[AlertRule]:
        matched_rules: list[AlertRule] = []
        rules = self._rules_by_metric.get(metric_event.metric_name, ())

        for rule in rules:
            if not rule.enabled:
                continue
            try:
                operator_fn = _OPERATORS[rule.operator]
                if operator_fn(metric_event.value, rule.threshold):
                    matched_rules.append(rule)
            except Exception as exc:
                # Skip bad rule evaluation and keep engine loop healthy.
                self.logger.warning(
                    "rule_evaluation_failed",
                    rule_id=rule.rule_id,
                    metric_name=metric_event.metric_name,
                    error=str(exc),
                )
                continue
        return matched_rules

    def _rebuild_metric_index(self) -> None:
        metric_index: dict[str, list[AlertRule]] = defaultdict(list)
        for rule in self._rules_by_id.values():
            metric_index[rule.metric_name].append(rule)
        self._rules_by_metric = {metric_name: tuple(items) for metric_name, items in metric_index.items()}
