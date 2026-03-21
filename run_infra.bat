@echo off
echo 🏗️ Starting InfraOS Hyperscale Stack...
docker-compose down
docker-compose up -d --build

echo ⏳ Waiting for services to stabilize (30s)...
timeout /t 30 /nobreak > nul

echo 🚀 Bootstrapping Tenants and Workspaces...
python scripts/bootstrap_platform.py

echo ✨ All systems operational.
echo 🌐 API Gateway: http://localhost:8000
echo 📊 Prometheus: http://localhost:9090
echo 🐰 RabbitMQ: http://localhost:15672
