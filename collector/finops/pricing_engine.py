"""
FinOps Pricing Engine

Maintains a live pricing table for LLM model tokens.
Calculates accurate per-call cost and detects anomalous spending spikes.
"""
import time
import json
import logging
from typing import Dict, Optional
from database import redis_client

logger = logging.getLogger("aiops.finops")

# Cost per 1 million tokens (USD)
# Source: official pricing pages as of 2025-Q4. Updated manually or via scraper.
MODEL_PRICING_DB: Dict[str, Dict[str, float]] = {
    # OpenAI
    "gpt-4o":               {"prompt": 2.50,  "completion": 10.00},
    "gpt-4o-mini":          {"prompt": 0.15,  "completion": 0.60},
    "gpt-4-turbo":          {"prompt": 10.00, "completion": 30.00},
    "gpt-4":                {"prompt": 30.00, "completion": 60.00},
    "gpt-3.5-turbo":        {"prompt": 0.50,  "completion": 1.50},
    "o1":                   {"prompt": 15.00, "completion": 60.00},
    "o1-mini":              {"prompt": 3.00,  "completion": 12.00},
    "o3-mini":              {"prompt": 1.10,  "completion": 4.40},
    # Anthropic
    "claude-opus-4":        {"prompt": 15.00, "completion": 75.00},
    "claude-sonnet-4":      {"prompt": 3.00,  "completion": 15.00},
    "claude-3-5-sonnet":    {"prompt": 3.00,  "completion": 15.00},
    "claude-3-5-haiku":     {"prompt": 0.80,  "completion": 4.00},
    "claude-3-haiku":       {"prompt": 0.25,  "completion": 1.25},
    "claude-3-opus":        {"prompt": 15.00, "completion": 75.00},
    # Google
    "gemini-2.5-pro":       {"prompt": 1.25,  "completion": 10.00},
    "gemini-2.5-flash":     {"prompt": 0.15,  "completion": 0.60},
    "gemini-2.0-flash":     {"prompt": 0.10,  "completion": 0.40},
    # Cohere
    "command-r-plus":       {"prompt": 2.50,  "completion": 10.00},
    "command-r":            {"prompt": 0.15,  "completion": 0.60},
    # Meta (via providers)
    "llama-3.1-405b":       {"prompt": 3.00,  "completion": 3.00},
    "llama-3.1-70b":        {"prompt": 0.59,  "completion": 0.79},
    "llama-3.1-8b":         {"prompt": 0.05,  "completion": 0.08},
    # Mistral
    "mistral-large":        {"prompt": 2.00,  "completion": 6.00},
    "mistral-small":        {"prompt": 0.20,  "completion": 0.60},
    # Local / self-hosted — zero cost
    "ollama":               {"prompt": 0.0,   "completion": 0.0},
    "vllm":                 {"prompt": 0.0,   "completion": 0.0},
}

# Fuzzy model name resolution
def _normalize_model_name(model: str) -> str:
    """Normalize a model string for lookup (e.g. 'gpt-4o-2024-08-06' -> 'gpt-4o')."""
    model = model.lower().strip()
    # Strip date suffixes like -2024-08-06
    for suffix_len in (11, 8):  # -YYYY-MM-DD or -YYYYMMDD
        if len(model) > suffix_len and model[-suffix_len] == '-' and model[-suffix_len + 1:].replace('-', '').isdigit():
            model = model[:-suffix_len]
            break
    return model


def calculate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    """Return estimated USD cost for a single LLM call."""
    key = _normalize_model_name(model)
    pricing = MODEL_PRICING_DB.get(key)
    if not pricing:
        # Try prefix match (e.g. "claude-3-5-sonnet-20241022")
        for db_key in MODEL_PRICING_DB:
            if key.startswith(db_key):
                pricing = MODEL_PRICING_DB[db_key]
                break
    if not pricing:
        logger.debug("No pricing data for model '%s'. Using zero cost.", model)
        return 0.0

    return (prompt_tokens / 1_000_000) * pricing["prompt"] + \
           (completion_tokens / 1_000_000) * pricing["completion"]


def get_pricing_table() -> Dict[str, Dict[str, float]]:
    """Return the full pricing table (for dashboard display)."""
    return MODEL_PRICING_DB


# ---------------------------------------------------------------------------
# Anomaly Cost Detection
# ---------------------------------------------------------------------------

# Thresholds — configurable per org, here as global defaults
COST_ALERT_WINDOW_SECS = 600        # 10-minute sliding window
COST_ALERT_THRESHOLD_USD = 100.0    # trigger if cumulative cost > $100 in window
COST_ALERT_COOLDOWN_SECS = 300      # suppress duplicate alerts for 5 minutes


def record_cost_and_check_anomaly(
    agent_id: str,
    cost: float,
    organization_id: str = "default",
) -> Optional[dict]:
    """
    Record a cost event in Redis and return an alert dict if the sliding-window
    total exceeds the threshold.

    Returns None if no anomaly or Redis is unavailable.
    """
    if not redis_client or cost <= 0:
        return None

    now = time.time()
    window_start = now - COST_ALERT_WINDOW_SECS
    bucket_key = f"aiops:cost_window:{organization_id}:{agent_id}"
    cooldown_key = f"aiops:cost_alert_cd:{organization_id}:{agent_id}"

    try:
        pipe = redis_client.pipeline()
        # Store cost as member score in a sorted set
        pipe.zadd(bucket_key, {f"{now}:{cost}": now})
        # Prune entries outside the window
        pipe.zremrangebyscore(bucket_key, 0, window_start)
        # Get all entries in the window
        pipe.zrangebyscore(bucket_key, window_start, "+inf")
        # TTL for auto-cleanup
        pipe.expire(bucket_key, COST_ALERT_WINDOW_SECS + 60)
        results = pipe.execute()

        entries = results[2]  # list of member strings like "1719350000.123:0.0045"
        window_total = 0.0
        for entry in entries:
            try:
                _, c = entry.rsplit(":", 1)
                window_total += float(c)
            except (ValueError, AttributeError):
                continue

        if window_total >= COST_ALERT_THRESHOLD_USD:
            # Check cooldown to avoid alert floods
            if redis_client.get(cooldown_key):
                return None  # already alerted recently

            redis_client.setex(cooldown_key, COST_ALERT_COOLDOWN_SECS, "1")
            alert = {
                "type": "cost_anomaly",
                "severity": "critical",
                "organization_id": organization_id,
                "agent_id": agent_id,
                "window_seconds": COST_ALERT_WINDOW_SECS,
                "total_cost_usd": round(window_total, 4),
                "threshold_usd": COST_ALERT_THRESHOLD_USD,
                "message": f"Agent '{agent_id}' spent ${window_total:.2f} in the last {COST_ALERT_WINDOW_SECS // 60} minutes (threshold: ${COST_ALERT_THRESHOLD_USD:.0f})."
            }
            logger.critical("COST ANOMALY ALERT: %s", json.dumps(alert))
            return alert

    except Exception as e:
        logger.warning("Cost anomaly check failed: %s", e)

    return None
