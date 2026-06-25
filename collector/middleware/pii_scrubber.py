"""
PII & Secret Scrubber — strips sensitive data from telemetry metadata
before it reaches ClickHouse or any persistent storage.

Detects:
  - API keys / Bearer tokens
  - Email addresses
  - Credit card numbers (Luhn-validated)
  - AWS / GCP / Azure secret keys
  - SSH private keys
  - Common password field patterns
"""
import re
import logging
from typing import Any, Dict

logger = logging.getLogger("aiops.scrubber")

REDACTED = "[REDACTED]"

# Pre-compiled regex patterns
PATTERNS = [
    # Email addresses
    (re.compile(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+'), "email"),

    # Credit card numbers (13-19 digits, optionally separated by spaces or dashes)
    (re.compile(r'\b(?:\d[ -]*?){13,19}\b'), "credit_card"),

    # API keys — common formats
    # OpenAI
    (re.compile(r'sk-[a-zA-Z0-9_-]{20,}'), "openai_key"),
    # Anthropic
    (re.compile(r'sk-ant-[a-zA-Z0-9_-]{20,}'), "anthropic_key"),
    # Generic Bearer token values
    (re.compile(r'Bearer\s+[A-Za-z0-9_\-.~+/]+=*', re.IGNORECASE), "bearer_token"),

    # AWS Access Key ID
    (re.compile(r'(?:AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}'), "aws_access_key"),
    # AWS Secret Access Key (40-char base64)
    (re.compile(r'(?<=[\s=:"\'])[A-Za-z0-9/+=]{40}(?=[\s"\'])'), "aws_secret_key"),

    # GCP / Firebase service account key fragments
    (re.compile(r'"private_key"\s*:\s*"-----BEGIN [A-Z ]+ KEY-----[^"]*-----END [A-Z ]+ KEY-----[^"]*"', re.DOTALL), "gcp_private_key"),

    # SSH private key blocks
    (re.compile(r'-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----'), "ssh_key"),

    # Generic password fields in JSON-like text
    (re.compile(r'(?i)(?:"password"|\'password\'|password\s*=)\s*[:=]\s*["\']?[^\s"\']{4,}["\']?'), "password_field"),

    # GitHub tokens
    (re.compile(r'gh[pousr]_[A-Za-z0-9_]{36,}'), "github_token"),

    # Slack tokens
    (re.compile(r'xox[baprs]-[A-Za-z0-9-]{10,}'), "slack_token"),
]


def _luhn_check(num_str: str) -> bool:
    """Validate a credit card number with the Luhn algorithm."""
    digits = [int(d) for d in num_str if d.isdigit()]
    if len(digits) < 13:
        return False
    total = 0
    for i, d in enumerate(reversed(digits)):
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0


def scrub_string(text: str) -> str:
    """Scan a string and replace all detected PII / secrets with [REDACTED]."""
    for pattern, kind in PATTERNS:
        matches = pattern.findall(text)
        for match in matches:
            # Extra validation for credit cards
            if kind == "credit_card":
                clean = re.sub(r'[\s-]', '', match)
                if not _luhn_check(clean):
                    continue
            text = text.replace(match, f"{REDACTED}:{kind}")
    return text


def scrub_dict(data: Dict[str, Any], depth: int = 0, max_depth: int = 8) -> Dict[str, Any]:
    """Recursively scrub all string values in a dictionary."""
    if depth > max_depth:
        return data

    result = {}
    for key, value in data.items():
        if isinstance(value, str):
            result[key] = scrub_string(value)
        elif isinstance(value, dict):
            result[key] = scrub_dict(value, depth + 1, max_depth)
        elif isinstance(value, list):
            result[key] = [
                scrub_dict(item, depth + 1, max_depth) if isinstance(item, dict)
                else scrub_string(item) if isinstance(item, str)
                else item
                for item in value
            ]
        else:
            result[key] = value
    return result


def scrub_telemetry_event(event: dict) -> dict:
    """
    Scrub an incoming telemetry event dict before persistence.
    Focuses on the 'metadata' field but also checks 'error' and 'error_message'.
    """
    if "metadata" in event and isinstance(event["metadata"], dict):
        event["metadata"] = scrub_dict(event["metadata"])
    elif "metadata" in event and isinstance(event["metadata"], str):
        event["metadata"] = scrub_string(event["metadata"])

    for field in ("error", "error_message"):
        if field in event and isinstance(event[field], str):
            event[field] = scrub_string(event[field])

    return event
