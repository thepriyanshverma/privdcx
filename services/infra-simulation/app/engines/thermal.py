import numpy as np

class ThermalEngine:
    @staticmethod
    def simulate_rack_temp(
        base_temp: float, 
        power_kw: float, 
        cooling_efficency: float = 0.8,
        airflow_cfm: float = 100.0
    ) -> float:
        """
        Simplified thermal model: temp = ambient + (heat_gen / airflow_cooling)
        """
        # Heat generated in BTU/hr roughly = kW * 3412
        heat_btu = power_kw * 3412.0
        
        # Simple cooling effect
        # Delta T = Q / (MCP) -> Q is heat, M is mass flow
        heat_contribution = (heat_btu / (airflow_cfm * 1.08)) * (1.0 - cooling_efficency)
        
        return base_temp + heat_contribution

    @staticmethod
    def calculate_hotspot_score(temp: float, threshold: float = 35.0) -> float:
        """
        Returns a hotspot severity score 0.0 to 1.0.
        """
        if temp < threshold: return 0.0
        return float(np.clip((temp - threshold) / 15.0, 0, 1)) # Max risk at threshold + 15C
