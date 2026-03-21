import numpy as np
from typing import Dict, List, Any

class PowerEngine:
    @staticmethod
    def simulate_device_power(base_kw: float, variance: float = 0.05) -> float:
        """
        Simulates real-time device power draw with stochastic variance.
        """
        noise = np.random.normal(0, variance * base_kw)
        return max(0, base_kw + noise)

    @staticmethod
    def aggregate_rack_power(device_powers: List[float]) -> float:
        """
        Sums device power draws into a rack-level metric.
        """
        return sum(device_powers)

    @staticmethod
    def calculate_overload_risk(current_kw: float, max_kw: float) -> float:
        """
        Returns a risk score 0.0 to 1.0 based on power saturation.
        """
        if max_kw <= 0: return 1.0
        ratio = current_kw / max_kw
        return float(np.clip((ratio - 0.7) / 0.3, 0, 1)) # Risk starts rising at 70% load
