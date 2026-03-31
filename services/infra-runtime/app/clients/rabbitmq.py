import aio_pika
import json
from typing import Callable, Awaitable
from app.schemas.runtime import StateUpdateEvent

class RabbitMQClient:
    def __init__(self, url: str = "amqp://infraos:infraos_password@rabbitmq:5672/"):
        self.url = url
        self.connection = None
        self.channel = None

    async def connect(self):
        import asyncio
        retries = 30
        while retries > 0:
            try:
                self.connection = await aio_pika.connect_robust(self.url)
                break
            except Exception:
                retries -= 1
                await asyncio.sleep(5)
        
        if not self.connection:
            raise Exception("Failed to connect to RabbitMQ")
            
        self.channel = await self.connection.channel()
        
        # Exchanges
        await self.channel.declare_exchange("infra.alerts", aio_pika.ExchangeType.TOPIC)
        await self.channel.declare_exchange("infra.state", aio_pika.ExchangeType.TOPIC)

    async def consume_alerts(self, callback: Callable[[dict], Awaitable[None]]):
        """
        Consumes alerts from the infra.alerts exchange for warning and critical severities.
        """
        queue = await self.channel.declare_queue("infra-runtime-alerts", durable=True)
        exchange = await self.channel.get_exchange("infra.alerts")
        
        # Bind to severity-based patterns
        await queue.bind(exchange, routing_key="alert.warning.*")
        await queue.bind(exchange, routing_key="alert.critical.*")
        
        async with queue.iterator() as queue_iter:
            async for message in queue_iter:
                async with message.process():
                    data = json.loads(message.body.decode())
                    await callback(data)

    async def publish_state_update(self, event: StateUpdateEvent):
        """
        Publishes an infra.state.updated event to the command bus.
        """
        exchange = await self.channel.get_exchange("infra.state")
        routing_key = f"state.updated.{event.entity_type}"
        
        await exchange.publish(
            aio_pika.Message(body=event.model_dump_json().encode()),
            routing_key=routing_key
        )

    async def close(self):
        if self.connection:
            await self.connection.close()
