from typing import Any


def _escape_label(value: str) -> str:
    return value.replace("\\", "\\\\").replace("\n", "\\n").replace('"', '\\"')


def _render_line(metric: str, labels: dict[str, str], value: float) -> str:
    label_text = ",".join(f'{k}="{_escape_label(str(v))}"' for k, v in labels.items())
    return f"{metric}{{{label_text}}} {value}"


def build_prometheus_text(
    *,
    devices: list[dict[str, Any]],
    racks: list[dict[str, Any]],
    facilities: list[dict[str, Any]],
) -> str:
    if not devices and not racks and not facilities:
        return ""

    lines: list[str] = []

    lines.append("# HELP device_power_kw Device power consumption in kW")
    lines.append("# TYPE device_power_kw gauge")
    for item in devices:
        lines.append(
            _render_line(
                "device_power_kw",
                {
                    "device_id": item["device_id"],
                    "device_type": item["device_type"],
                    "rack_id": item["rack_id"],
                    "workspace_id": item["workspace_id"],
                    "facility_id": item["facility_id"],
                },
                float(item["power_kw"]),
            )
        )

    lines.append("# HELP device_temp_c Device temperature in Celsius")
    lines.append("# TYPE device_temp_c gauge")
    for item in devices:
        lines.append(
            _render_line(
                "device_temp_c",
                {
                    "device_id": item["device_id"],
                    "device_type": item["device_type"],
                    "rack_id": item["rack_id"],
                    "workspace_id": item["workspace_id"],
                    "facility_id": item["facility_id"],
                },
                float(item["temp_c"]),
            )
        )

    lines.append("# HELP device_bad_data_flag Device telemetry anomaly flag (1=bad, 0=normal)")
    lines.append("# TYPE device_bad_data_flag gauge")
    for item in devices:
        lines.append(
            _render_line(
                "device_bad_data_flag",
                {
                    "device_id": item["device_id"],
                    "device_type": item["device_type"],
                    "rack_id": item["rack_id"],
                    "workspace_id": item["workspace_id"],
                    "facility_id": item["facility_id"],
                },
                1.0 if item.get("telemetry_quality") == "bad" else 0.0,
            )
        )

    lines.append("# HELP rack_power_kw Rack power consumption in kW")
    lines.append("# TYPE rack_power_kw gauge")
    for item in racks:
        lines.append(
            _render_line(
                "rack_power_kw",
                {
                    "rack_id": item["rack_id"],
                    "workspace_id": item["workspace_id"],
                    "facility_id": item["facility_id"],
                },
                float(item["power_kw"]),
            )
        )

    lines.append("# HELP rack_temp_c Rack weighted average temperature in Celsius")
    lines.append("# TYPE rack_temp_c gauge")
    for item in racks:
        lines.append(
            _render_line(
                "rack_temp_c",
                {
                    "rack_id": item["rack_id"],
                    "workspace_id": item["workspace_id"],
                    "facility_id": item["facility_id"],
                },
                float(item["temp_c"]),
            )
        )

    lines.append("# HELP facility_power_mw Facility total power in MW")
    lines.append("# TYPE facility_power_mw gauge")
    for item in facilities:
        lines.append(
            _render_line(
                "facility_power_mw",
                {
                    "facility_id": item["facility_id"],
                    "workspace_id": item["workspace_id"],
                },
                float(item["power_mw"]),
            )
        )

    lines.append("# HELP infra_risk_index Facility utilization risk index")
    lines.append("# TYPE infra_risk_index gauge")
    for item in facilities:
        lines.append(
            _render_line(
                "infra_risk_index",
                {
                    "facility_id": item["facility_id"],
                    "workspace_id": item["workspace_id"],
                },
                float(item["risk_index"]),
            )
        )

    return "\n".join(lines) + "\n"
