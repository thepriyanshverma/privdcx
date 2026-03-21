# Service Documentation: Metrics Stream Bridge (infra-metrics-stream-service)

This service acts as the real-time observability bridge for InfraOS, extracting high-fidelity telemetry from Prometheus and streaming it into a Kafka-based event pipeline.

## 1. Folder Structure
```text
services/infra-metrics-stream/
├── app/
│   ├── api/v1/         # Control API Routers
│   ├── clients/        # Prometheus & Kafka clients
│   ├── schemas/        # Event normalization (InfraMetricEvent v1)
│   ├── services/       # Stream worker orchestration
│   └── main.py         # Entry Point
├── Dockerfile          # Image Specification
└── requirements.txt    # Python Dependencies
```

## 2. Prometheus Polling Design
The service uses an asynchronous HTTP client to poll the Prometheus query API every **2 seconds**.
- **Metrics Tracked:** `rack_power_kw`, `rack_temp_c`, `device_latency_ms`, `infra_risk_index`, `cluster_latency_score`.
- **Normalization:** Raw vector results are parsed and enriched with domain metadata (labels) into a flat JSON event structure.

## 3. Kafka Producer Architecture
The streaming engine uses `aiokafka` for high-performance, non-blocking publishing.
- **Topic:** `infra.metrics.stream`
- **Partitioning:** Events are partitioned by `tenant_id` to ensure strict ordering of metrics for each tenant and enable parallel consumer scaling.
- **Reliability:** Configured with `acks=all` and automatic retry backoff for data integrity.

## 4. Metric Event Schema (v1)
```json
{
  "version": "v1",
  "timestamp": 1710000000.123,
  "metric_name": "rack_power_kw",
  "value": 4.5,
  "tenant_id": "T1",
  "workspace_id": "W1",
  "facility_id": "F1",
  "rack_id": "R1",
  "labels": {
    "zone": "Z1"
  }
}
```

## 5. Async Streaming Loop Design
The `StreamWorker` manages the pipeline state:
- **Tick Engine:** Orchestrates the sequential "Poll -> Normalize -> Enrich -> Publish" flow.
- **Control:** Supports dynamic `pause` and `resume` via API to handle downstream maintenance or backpressure.

## 6. Docker Orchestration (Kafka Backbone)
The service is integrated with a Confluent-style Kafka & Zookeeper stack:
```yaml
  zookeeper:
    image: confluentinc/cp-zookeeper:latest
  
  kafka:
    image: confluentinc/cp-kafka:latest
    ports: ["9092:9092"]

  infra-metrics-stream:
    environment:
      - KAFKA_BOOTSTRAP_SERVERS=kafka:9092
      - PROMETHEUS_URL=http://prometheus:9090
```

## 7. Throughput Scaling Design
- **Vertical Scaling:** Asyncio loop handles thousands of concurrent metric samples per second.
- **Horizontal Scaling:** Kafka partitioning allows multiple instances of downstream consumers (Alerting, Analytics) to process the `infra.metrics.stream` topic in parallel without losing tenant ordering.
