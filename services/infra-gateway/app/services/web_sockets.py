import aio_pika
import json
import asyncio
from fastapi import WebSocket, WebSocketDisconnect
from typing import List, Dict, Set
import structlog

logger = structlog.get_logger()

class WebSocketManager:
    def __init__(self, rabbitmq_url: str = "amqp://infraos:infraos_password@rabbitmq:5672/"):
        self.active_connections: Dict[str, Set[WebSocket]] = {} # tenant_id -> set of sockets
        self.rabbitmq_url = rabbitmq_url
        self.connection = None
        self.channel = None

    async def connect_rabbitmq(self):
        """
        Connects to RabbitMQ and starts the bridge loop to broadcast updates.
        """
        retries = 30
        while retries > 0:
            try:
                self.connection = await aio_pika.connect_robust(self.rabbitmq_url)
                break
            except Exception as e:
                logger.warning("RabbitMQ not ready, retrying...", error=str(e), retries_left=retries)
                retries -= 1
                await asyncio.sleep(5)
        
        if not self.connection:
            raise Exception("Failed to connect to RabbitMQ after multiple retries")

        self.channel = await self.connection.channel()
        
        exchange = await self.channel.declare_exchange("infra.state", aio_pika.ExchangeType.TOPIC)
        queue = await self.channel.declare_queue("gateway-ws-bridge", exclusive=True)
        
        # Bind to all state updates
        await queue.bind(exchange, routing_key="state.updated.#")
        
        # Start background task to consume and broadcast
        asyncio.create_task(self._consume_and_broadcast(queue))

    async def _consume_and_broadcast(self, queue):
        """
        Background task: RabbitMQ -> Tenant WebSocket fan-out.
        """
        async with queue.iterator() as queue_iter:
            async for message in queue_iter:
                async with message.process():
                    data = json.loads(message.body.decode())
                    tenant_id = data.get("tenant_id")
                    
                    if tenant_id and tenant_id in self.active_connections:
                        # Broadcast to all connections for this tenant
                        disconnected = set()
                        for ws in self.active_connections[tenant_id]:
                            try:
                                await ws.send_json(data)
                            except Exception:
                                disconnected.add(ws)
                        
                        # Cleanup dead connections
                        for ws in disconnected:
                            self.active_connections[tenant_id].discard(ws)

    async def connect_client(self, websocket: WebSocket, tenant_id: str):
        """
        Registers a new client WebSocket connection.
        """
        await websocket.accept()
        if tenant_id not in self.active_connections:
            self.active_connections[tenant_id] = set()
        self.active_connections[tenant_id].add(websocket)

    def disconnect_client(self, websocket: WebSocket, tenant_id: str):
        """
        Unregisters a WebSocket connection.
        """
        if tenant_id in self.active_connections:
            self.active_connections[tenant_id].discard(websocket)

    async def close(self):
        if self.connection:
            await self.connection.close()
