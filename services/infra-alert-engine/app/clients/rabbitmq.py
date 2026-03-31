import asyncio
import os
import time

import aio_pika
import structlog

from app.schemas.alerts import InfraAlertEvent


class RabbitMQDispatcher:
    def __init__(self, rabbitmq_url: str | None = None):
        self.rabbitmq_url = rabbitmq_url or os.getenv("RABBITMQ_URL", "amqp://infraos:infraos_password@rabbitmq:5672/")
        self.connection: aio_pika.abc.AbstractRobustConnection | None = None
        self.channel: aio_pika.abc.AbstractChannel | None = None
        self.exchange: aio_pika.abc.AbstractExchange | None = None
        self.logger = structlog.get_logger("infra-alert-engine.rabbitmq")
        self.max_publish_retries = int(os.getenv("RABBITMQ_PUBLISH_RETRIES", "3"))
        self.publish_retry_delay_s = float(os.getenv("RABBITMQ_RETRY_DELAY_S", "0.5"))

    async def connect(self) -> None:
        retries = int(os.getenv("RABBITMQ_CONNECT_RETRIES", "30"))
        delay_s = float(os.getenv("RABBITMQ_CONNECT_RETRY_DELAY_S", "2"))

        while retries > 0:
            try:
                self.connection = await aio_pika.connect_robust(self.rabbitmq_url)
                self.channel = await self.connection.channel()
                self.exchange = await self.channel.declare_exchange(
                    "infra.alerts",
                    aio_pika.ExchangeType.TOPIC,
                    durable=False,
                )
                return
            except Exception as exc:
                retries -= 1
                self.logger.warning("rabbitmq_connect_retry", retries_remaining=retries, error=str(exc))
                await asyncio.sleep(delay_s)

        raise RuntimeError("Failed to connect to RabbitMQ for alert dispatch")

    async def publish_alert(self, alert: InfraAlertEvent) -> None:
        if not self.exchange:
            raise RuntimeError("RabbitMQ exchange is not initialized")

        routing_key = f"alert.{alert.severity.value.lower()}.{alert.entity_type.value}"
        message = aio_pika.Message(
            body=alert.model_dump_json().encode("utf-8"),
            content_type="application/json",
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
            timestamp=int(time.time()),
        )

        last_error: Exception | None = None
        for attempt in range(1, self.max_publish_retries + 1):
            try:
                await self.exchange.publish(message, routing_key=routing_key)
                return
            except Exception as exc:
                last_error = exc
                self.logger.warning(
                    "rabbitmq_publish_retry",
                    attempt=attempt,
                    max_retries=self.max_publish_retries,
                    routing_key=routing_key,
                    error=str(exc),
                )
                await asyncio.sleep(self.publish_retry_delay_s)

        raise RuntimeError(f"Failed to publish alert after retries: {last_error}")

    async def close(self) -> None:
        if self.connection:
            await self.connection.close()
