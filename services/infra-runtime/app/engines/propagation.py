import networkx as nx
from typing import List, Dict

class PropagationModel:
    def __init__(self):
        self.graph = nx.Graph()

    def update_topology(self, connections: List[tuple]):
        """
        Builds the physical adjacency graph (e.g., adjacent racks).
        """
        self.graph.clear()
        self.graph.add_edges_from(connections)

    def get_affected_nodes(self, failed_node: str, radius: int = 1) -> List[str]:
        """
        Returns a list of nodes adjacent to the failure point that may be affected.
        """
        if failed_node not in self.graph:
            return []
            
        # Get neighbors within radius
        return list(nx.single_source_shortest_path_length(self.graph, failed_node, cutoff=radius).keys())
