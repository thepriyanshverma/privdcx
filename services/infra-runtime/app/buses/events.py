import aio_pika
import os
import json
from app.core.redis_client import redis_client

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://infraos:infraos_password@localhost:5672/")

async def process_message(message: aio_pika.IncomingMessage):
    async with message.process():
        topic = message.routing_key
        payload = json.loads(message.body.decode())
        
        print(f"[x] Received event {topic}: {payload}")
        
        # Example Engine Routing:
        if topic == "infra.rack.created":
            rack_id = payload.get("id")
            await redis_client.hset(f"rack_state:{rack_id}", mapping={"status": "online", "power_draw_w": 0})
        elif topic == "infra.layout.generated":
            print("[x] Orchestrating Layout Generation cascade.")
            # Trigger subsequent topology caches here
            
async def start_event_bus():
    connection = await aio_pika.connect_robust(RABBITMQ_URL)
    channel = await connection.channel()

    # Topic Exchange for InfraOS
    exchange = await channel.declare_exchange("infraos_events", aio_pika.ExchangeType.TOPIC)

    # Dedicated Queue for Kernel Runtime
    queue = await channel.declare_queue("runtime_kernel_queue", durable=True)
    
    # Bind to various topics
    await queue.bind(exchange, routing_key="infra.#")

    print(" [*] Runtime Kernel waiting for InfraOS events.")
    await queue.consume(process_message)
