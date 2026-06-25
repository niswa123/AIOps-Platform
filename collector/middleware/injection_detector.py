"""
Prompt Injection Detection — lightweight heuristic scanner
for common prompt injection attack patterns in telemetry metadata.

This is NOT a full security solution. It catches obvious injection attempts
and raises alerts; a production system should use an ML classifier.
"""
import re
import logging
from typing import Optional, List

logger = logging.getLogger("aiops.injection")

# Common injection patterns (case-insensitive)
INJECTION_PATTERNS: List[re.Pattern] = [
    # Direct override attempts
    re.compile(r"ignore\s+(all\s+)?previous\s+(instructions|prompts|rules)", re.IGNORECASE),
    re.compile(r"ignore\s+(the\s+)?(above|system)\s+(prompt|message|instructions?)", re.IGNORECASE),
    re.compile(r"disregard\s+(all\s+)?previous", re.IGNORECASE),
    re.compile(r"forget\s+(everything|all|your)\s+(above|previous|instructions)", re.IGNORECASE),

    # Role hijacking
    re.compile(r"you\s+are\s+now\s+(a\s+)?(?:DAN|unrestricted|jailbroken|evil)", re.IGNORECASE),
    re.compile(r"pretend\s+(you\s+are|to\s+be)\s+(a\s+)?(hacker|admin|root|unrestricted)", re.IGNORECASE),
    re.compile(r"act\s+as\s+(a\s+)?(?:DAN|unrestricted|jailbroken)", re.IGNORECASE),
    re.compile(r"switch\s+to\s+(?:developer|admin|root)\s+mode", re.IGNORECASE),

    # System prompt extraction
    re.compile(r"(print|show|reveal|output|repeat|display)\s+(the\s+)?(system|initial|original)\s+(prompt|instructions|message)", re.IGNORECASE),
    re.compile(r"what\s+(is|are)\s+(your|the)\s+(system\s+)?(prompt|instructions|rules)", re.IGNORECASE),

    # Delimiter/encoding attacks
    re.compile(r"\[SYSTEM\]|\[INST\]|<\|im_start\|>|<\|system\|>|<<SYS>>", re.IGNORECASE),
    re.compile(r"```\s*system", re.IGNORECASE),

    # Base64 / encoding smuggling
    re.compile(r"base64\s*(?:decode|encode)\s*[:=]", re.IGNORECASE),
    re.compile(r"eval\s*\(\s*(?:atob|Buffer\.from)", re.IGNORECASE),
]

# Severity thresholds
CONFIDENCE_HIGH = 0.9
CONFIDENCE_MEDIUM = 0.6


def scan_text(text: str) -> List[dict]:
    """
    Scan a text string for prompt injection patterns.
    Returns a list of detection results, each with pattern, match, and confidence.
    """
    if not text or len(text) < 10:
        return []

    detections = []
    for pattern in INJECTION_PATTERNS:
        matches = pattern.findall(text)
        if matches:
            detections.append({
                "pattern": pattern.pattern[:80],
                "match_count": len(matches),
                "sample": str(matches[0])[:100] if matches else "",
                "confidence": CONFIDENCE_HIGH,
            })

    return detections


def scan_telemetry_event(event: dict) -> Optional[dict]:
    """
    Scan telemetry metadata, error messages, and other text fields
    for prompt injection patterns.

    Returns an alert dict if injection is detected, otherwise None.
    """
    texts_to_scan = []

    # Collect scannable text from the event
    metadata = event.get("metadata")
    if isinstance(metadata, str):
        texts_to_scan.append(metadata)
    elif isinstance(metadata, dict):
        for v in metadata.values():
            if isinstance(v, str):
                texts_to_scan.append(v)

    for field in ("error", "error_message"):
        val = event.get(field)
        if isinstance(val, str):
            texts_to_scan.append(val)

    # Run detection
    all_detections = []
    for text in texts_to_scan:
        detections = scan_text(text)
        all_detections.extend(detections)

    if not all_detections:
        return None

    max_confidence = max(d["confidence"] for d in all_detections)
    severity = "critical" if max_confidence >= CONFIDENCE_HIGH else "warning"

    alert = {
        "type": "prompt_injection_detected",
        "severity": severity,
        "agent_id": event.get("agent_id", "unknown"),
        "trace_id": event.get("trace_id", "unknown"),
        "detections": all_detections,
        "message": f"Detected {len(all_detections)} potential prompt injection pattern(s) in telemetry from agent '{event.get('agent_id', 'unknown')}'."
    }
    logger.warning("PROMPT INJECTION ALERT: %s", alert["message"])
    return alert
