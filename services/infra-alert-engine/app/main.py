from fastapi import FastAPI, HTTPException
from contextlib import asynccontextmanager
from typing import List
from app.services.processor import AlertProcessor
from app.schemas.alerts import AlertRule, RuleType, AlertSeverity

# Global processor instance
processor = AlertProcessor()

# Initial Default Rules
DEFAULT_RULES = [
    AlertRule(
        id="THERMAL_WARNING",
        name="High Temperature Warning",
        rule_type=RuleType.THRESHOLD,
        metric_name="rack_temp_c",
        operator=">",
        threshold=35.0,
        severity=AlertSeverity.WARNING,
        description="Rack temperature exceeded 35C warning threshold"
    ),
    AlertRule(
        id="THERMAL_CRITICAL",
        name="High Temperature Critical",
        rule_type=RuleType.THRESHOLD,
        metric_name="rack_temp_c",
        operator=">",
        threshold=45.0,
        severity=AlertSeverity.CRITICAL,
        description="Rack temperature exceeded 45C critical threshold"
    ),
    AlertRule(
        id="POWER_CRITICAL",
        name="Rack Power Overload",
        rule_type=RuleType.THRESHOLD,
        metric_name="rack_power_kw",
        operator=">",
        threshold=10.0,
        severity=AlertSeverity.CRITICAL,
        description="Rack power draw exceeds the critical safety limit"
    )
]

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load initial rules
    processor.rule_engine.rules = DEFAULT_RULES
    # Start processor
    await processor.start()
    yield
    # Cleanup
    await processor.stop()

app = FastAPI(title="InfraOS Alert Engine", lifespan=lifespan)

@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.get("/rules", response_model=List[AlertRule])
async def get_rules():
    return processor.rule_engine.rules

@app.post("/rules", response_model=AlertRule)
async def add_rule(rule: AlertRule):
    processor.rule_engine.rules.append(rule)
    return rule

@app.get("/engine/status")
async def get_status():
    return {
        "running": processor.running,
        "is_paused": processor.is_paused,
        "rule_count": len(processor.rule_engine.rules)
    }

@app.post("/engine/pause")
async def pause_engine():
    processor.is_paused = True
    return {"message": "Alert engine paused"}

@app.post("/engine/resume")
async def resume_engine():
    processor.is_paused = False
    return {"message": "Alert engine resumed"}
