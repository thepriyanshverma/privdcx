import networkx as nx
import numpy as np
from typing import Dict, List

class NetworkEngine:
    def __init__(self):
        self.topo = nx.Graph()

    def update_topology(self, connections: List[tuple]):
        self.topo.clear()
        self.topo.add_edges_from(connections)

    def simulate_latency(self, source_id: str, target_id: str) -> float:
        """
        Simulates packet propagation delay based on hopping distance and congestion.
        """
        try:
            path_len = nx.shortest_path_length(self.topo, source_id, target_id)
            base_latency = path_len * 0.5 # 0.5ms per hop
            congestion = np.random.uniform(1.0, 1.5) # Stochastic congestion
            return base_latency * congestion
        except:
            return 1000.0 # Disconnected
            
    @staticmethod
    def calculate_congestion_index(utilization: float) -> float:
        return float(np.clip(utilization, 0, 1))
