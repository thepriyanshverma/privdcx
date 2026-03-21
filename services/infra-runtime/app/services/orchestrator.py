import asyncio
from typing import List
from datetime import datetime
from app.clients.rabbitmq import RabbitMQClient
from app.services.state import StateManager
from app.engines.remediation import RemediationEngine
from app.engines.propagation import PropagationModel
from app.schemas.runtime import InfraState, OperationalStatus, StateUpdateEvent, RemediationAction

class RuntimeOrchestrator:
    def __init__(self):
        self.rabbitmq = RabbitMQClient()
        self.state_manager = StateManager()
        self.remediation_engine = RemediationEngine()
        self.propagation_model = PropagationModel()
        self.is_paused = False
        self.running = False

    async def start(self):
        self.running = True
        await self.rabbitmq.connect()
        asyncio.create_task(self.rabbitmq.consume_alerts(self._process_alert))

    async def stop(self):
        self.running = False
        await self.rabbitmq.close()
        await self.state_manager.close()

    async def _process_alert(self, alert: dict):
        """
        Main Control Loop: Alert -> Evaluate -> Remediate -> Update State -> Propagate -> Publish
        """
        if self.is_paused:
            return

        entity_id = alert.get("rack_id") or alert.get("facility_id")
        if not entity_id:
            return

        # 1. Get Current State
        current_state = await self.state_manager.get_current_state(entity_id)
        if not current_state:
            # Initialize state if missing - in a real app, this would be synced from domain service
            current_state = InfraState(
                id=entity_id,
                entity_type="rack" if alert.get("rack_id") else "facility",
                tenant_id=alert.get("tenant_id"),
                workspace_id=alert.get("workspace_id"),
                operational_status=OperationalStatus.ACTIVE
            )

        previous_status = current_state.operational_status

        # 2. Evaluate Remediation
        policy = await self.remediation_engine.evaluate_remediation(alert)
        if policy:
            # Execute Action
            action = RemediationAction(
                tenant_id=alert.get("tenant_id"),
                entity_id=entity_id,
                rule_id=alert.get("rule_id"),
                action_type=policy["action"]
            )
            await self.state_manager.record_remediation(action.model_dump())
            
            # Update State based on policy
            current_state.operational_status = policy["target_status"]
            current_state.last_updated = datetime.utcnow()
            await self.state_manager.update_state(current_state)

        # 3. Propagate Degradation (simplified)
        if current_state.operational_status != previous_status:
            affected_ids = self.propagation_model.get_affected_nodes(entity_id)
            for adj_id in affected_ids:
                if adj_id == entity_id: continue
                # Logic to degrade neighbor states would go here...
                pass

            # 4. Publish State Update
            update_event = StateUpdateEvent(
                tenant_id=alert.get("tenant_id"),
                workspace_id=alert.get("workspace_id"),
                entity_type=current_state.entity_type,
                entity_id=entity_id,
                previous_state=previous_status,
                current_state=current_state.operational_status,
                reason=alert.get("rule_id")
            )
            await self.rabbitmq.publish_state_update(update_event)
