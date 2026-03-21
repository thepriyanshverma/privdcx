import type { 
  EntityId, 
  EntityStatus, 
  DependencyType, 
  FailureState, 
  Incident, 
  IncidentCategory, 
} from '../domain/types';
import { v4 as uuidv4 } from 'uuid';

export interface Dependency {
  providerId: EntityId;
  consumerId: EntityId;
  type: DependencyType;
}

/**
 * FailureManager
 * Orchestrates infrastructure dependency graphs and cascading failure propagation.
 */
class FailureManager {
  private dependencies: Dependency[] = [];
  private entityFailureStates = new Map<EntityId, FailureState>();
  private activeIncidents: Incident[] = [];

  /**
   * Register a dependency between two entities.
   */
  public registerDependency(providerId: EntityId, consumerId: EntityId, type: DependencyType) {
    this.dependencies.push({ providerId, consumerId, type });
  }

  /**
   * Injects a failure into an entity.
   */
  public injectFailure(entityId: EntityId, category: IncidentCategory, severity: number): string {
    const incidentId = uuidv4();
    const failure: FailureState = {
      status: severity >= 1.0 ? 'failed' : 'degraded',
      causeType: category,
      severity,
      timestamp: Date.now()
    };

    this.entityFailureStates.set(entityId, failure);
    
    const incident: Incident = {
      id: incidentId,
      entityId,
      category,
      severity: severity >= 1.0 ? 'critical' : 'high',
      message: `Injected ${category} incident at ${entityId.slice(0, 8)}`,
      timestamp: Date.now(),
      resolved: false,
      lifecycle: 'detected',
      affectedEntityIds: [entityId],
      propagationState: 'spreading'
    };

    this.activeIncidents.push(incident);
    this.propagateFailures();
    return incidentId;
  }

  /**
   * Cascades failures through the dependency graph.
   * Batched computation to avoid recursion loops.
   */
  public propagateFailures() {
    // Cascades failures through the dependency graph.
    // Batched computation to avoid recursion loops.
    
    let changed = true;
    let iterations = 0;
    const MAX_ITERATIONS = 10; // Safety cap for graph cycles

    while (changed && iterations < MAX_ITERATIONS) {
      changed = false;
      iterations++;

      for (const dep of this.dependencies) {
        const providerState = this.entityFailureStates.get(dep.providerId);
        if (!providerState) continue;

        if (providerState.status === 'failed' || providerState.status === 'degraded') {
          const currentConsumerState = this.entityFailureStates.get(dep.consumerId);
          
          // Deterministic Propagation Rules:
          // Provider Failed -> Consumer Failed (if no redundancy)
          // Provider Degraded -> Consumer Degraded 
          
          let impactSeverity = providerState.severity * 0.9; // Slight attenuation
          let newStatus: EntityStatus = impactSeverity >= 0.9 ? 'failed' : 'degraded';

          // Apply Redundancy Dampening (Simplified)
          // In Phase 3, we check if the consumer is a "Rack" or "Cluster" with redundancy
          // This would ideally be looked up in the Control Plane.
          
          if (!currentConsumerState || currentConsumerState.severity < impactSeverity) {
            this.entityFailureStates.set(dep.consumerId, {
              status: newStatus,
              causeType: providerState.causeType,
              severity: impactSeverity,
              timestamp: Date.now()
            });
            changed = true;
          }
        }
      }
    }
  }

  public getEntityStatus(entityId: EntityId): EntityStatus {
    return this.entityFailureStates.get(entityId)?.status || 'healthy';
  }

  public getFailureState(entityId: EntityId): FailureState | undefined {
    return this.entityFailureStates.get(entityId);
  }

  public getActiveIncidents(): Incident[] {
    return this.activeIncidents;
  }

  public resolveIncident(incidentId: string) {
    const incident = this.activeIncidents.find(i => i.id === incidentId);
    if (incident) {
      incident.resolved = true;
      incident.lifecycle = 'resolved';
      this.entityFailureStates.delete(incident.entityId);
      // Re-propagate to clear children
      this.clearOrphanedFailures();
      this.propagateFailures();
    }
  }

  private clearOrphanedFailures() {
    // Only keep failures that were explicitly injected
    // A more robust system would track "source" incidents
    const injectedIds = new Set(this.activeIncidents.filter(i => !i.resolved).map(i => i.entityId));
    this.entityFailureStates.forEach((_state, id) => {
      if (!injectedIds.has(id)) {
        this.entityFailureStates.delete(id);
      }
    });
  }
}

export const failureManager = new FailureManager();
