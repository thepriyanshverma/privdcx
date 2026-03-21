import aio_pika
import json
import os
from app.schemas.alerts import InfraAlertEvent, AlertSeverity

class RabbitMQDispatcher:
    def __init__(self, rabbitmq_url: str = "amqp://infraos:infraos_password@rabbitmq:5672/"):
        self.rabbitmq_url = rabbitmq_url
        self.connection = None
        self.channel = None

    async def connect(self):
        import asyncio
        retries = 30
        while retries > 0:
            try:
                self.connection = await aio_pika.connect_robust(self.rabbitmq_url)
                break
            except Exception:
                retries -= 1
                await asyncio.sleep(5)
        
        if not self.connection:
            raise Exception("Failed to connect to RabbitMQ")
            
        self.channel = await self.connection.channel()
        
        # Declare topics
        await self.channel.declare_exchange("infra.alerts", aio_pika.ExchangeType.TOPIC)

    async def publish_alert(self, alert: InfraAlertEvent):
        """
        Publishes an alert to RabbitMQ using severity-based routing.
        """
        severity_key = alert.severity.lower() # warning | critical
        routing_key = f"alert.{severity_key}.{alert.rule_id.lower()}"
        
        message_body = alert.model_dump_json().encode()
        
        exchange = await self.channel.get_exchange("infra.alerts")
        await exchange.publish(
            aio_pika.Message(body=message_body),
            routing_key=routing_key
        )

    async def close(self):
        if self.connection:
            await self.connection.close()
