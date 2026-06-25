"""
AIOps Local Model Provider Instrumentor.

Wraps HTTP-based local model APIs to capture telemetry:
- Ollama (POST /api/generate, /api/chat)
- vLLM (OpenAI-compatible POST /v1/completions, /v1/chat/completions)
- HuggingFace Transformers (pipeline.__call__)

Usage:
    from aiops_sdk import TelemetryClient
    from aiops_sdk.instrumentation.local_providers import LocalModelInstrumentor

    client = TelemetryClient(api_key="your-key")
    instrumentor = LocalModelInstrumentor(client)
    instrumentor.instrument_ollama(base_url="http://localhost:11434")
    instrumentor.instrument_vllm(base_url="http://localhost:8000")
    instrumentor.instrument_huggingface()
"""

import uuid
import time
import json
import logging
import functools
from typing import Any, Optional, Dict

logger = logging.getLogger("aiops.sdk.local_providers")


class LocalModelInstrumentor:
    """Instrumentor for local model providers: Ollama, vLLM, and HuggingFace Transformers."""

    def __init__(self, telemetry_client, agent_id: str = "local-model-agent", session_id: str = "default-session"):
        self.telemetry_client = telemetry_client
        self.agent_id = agent_id
        self.session_id = session_id

    # ─── Ollama ───────────────────────────────────────────────────

    def instrument_ollama(self, base_url: str = "http://localhost:11434") -> "OllamaTracedClient":
        """Returns a traced Ollama client wrapper.

        Usage:
            ollama = instrumentor.instrument_ollama()
            response = ollama.chat(model="llama3", messages=[{"role": "user", "content": "Hi"}])
        """
        return OllamaTracedClient(
            base_url=base_url,
            telemetry_client=self.telemetry_client,
            agent_id=self.agent_id,
            session_id=self.session_id,
        )

    # ─── vLLM ─────────────────────────────────────────────────────

    def instrument_vllm(self, base_url: str = "http://localhost:8000") -> "VLLMTracedClient":
        """Returns a traced vLLM client wrapper (OpenAI-compatible API).

        Usage:
            vllm = instrumentor.instrument_vllm()
            response = vllm.chat(model="mistral-7b", messages=[...])
        """
        return VLLMTracedClient(
            base_url=base_url,
            telemetry_client=self.telemetry_client,
            agent_id=self.agent_id,
            session_id=self.session_id,
        )

    # ─── HuggingFace Transformers ─────────────────────────────────

    def instrument_huggingface(self) -> None:
        """Patches HuggingFace transformers.pipeline to emit telemetry on each call."""
        try:
            import transformers

            if hasattr(transformers.Pipeline, "_aiops_patched"):
                return

            original_call = transformers.Pipeline.__call__

            handler = self

            @functools.wraps(original_call)
            def patched_call(pipeline_self, *args, **kwargs):
                trace_id = str(uuid.uuid4())
                span_id = str(uuid.uuid4())
                model_name = getattr(pipeline_self, "model", None)
                if model_name and hasattr(model_name, "config"):
                    model_name = getattr(model_name.config, "_name_or_path", "hf-unknown")
                else:
                    model_name = "hf-unknown"

                start_time = time.time()
                try:
                    result = original_call(pipeline_self, *args, **kwargs)
                    latency_ms = int((time.time() - start_time) * 1000)

                    # Estimate tokens from input/output text lengths
                    input_text = str(args[0]) if args else str(kwargs.get("inputs", ""))
                    output_text = str(result)
                    est_prompt_tokens = len(input_text) // 4
                    est_completion_tokens = len(output_text) // 4

                    handler.telemetry_client.log_event({
                        "trace_id": trace_id,
                        "span_id": span_id,
                        "session_id": handler.session_id,
                        "agent_id": handler.agent_id,
                        "provider": "huggingface",
                        "model": str(model_name),
                        "prompt_tokens": est_prompt_tokens,
                        "completion_tokens": est_completion_tokens,
                        "total_tokens": est_prompt_tokens + est_completion_tokens,
                        "cost": 0.0,  # local models have zero API cost
                        "latency_ms": latency_ms,
                        "status": "success",
                        "span_type": "llm_call",
                        "metadata": {
                            "task": getattr(pipeline_self, "task", "unknown"),
                            "device": str(getattr(pipeline_self, "device", "cpu")),
                        }
                    })
                    return result
                except Exception as e:
                    latency_ms = int((time.time() - start_time) * 1000)
                    handler.telemetry_client.log_event({
                        "trace_id": trace_id,
                        "span_id": span_id,
                        "session_id": handler.session_id,
                        "agent_id": handler.agent_id,
                        "provider": "huggingface",
                        "model": str(model_name),
                        "latency_ms": latency_ms,
                        "status": "error",
                        "error": str(e),
                        "span_type": "llm_call",
                    })
                    raise

            transformers.Pipeline.__call__ = patched_call
            transformers.Pipeline._aiops_patched = True
            logger.info("HuggingFace Transformers Pipeline auto-instrumented.")
        except ImportError:
            logger.info("transformers not installed; HuggingFace instrumentation skipped.")


class _BaseHTTPTracedClient:
    """Base class for HTTP-based local model clients with telemetry."""

    def __init__(self, base_url: str, telemetry_client, agent_id: str, session_id: str):
        self.base_url = base_url.rstrip("/")
        self.telemetry_client = telemetry_client
        self.agent_id = agent_id
        self.session_id = session_id

    def _post_json(self, path: str, payload: dict, timeout: int = 60) -> dict:
        """Send a POST request and return parsed JSON response."""
        import urllib.request
        import urllib.error

        url = f"{self.base_url}{path}"
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data, method="POST")
        req.add_header("Content-Type", "application/json")

        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def _emit_event(self, trace_id: str, span_id: str, provider: str, model: str,
                    latency_ms: int, status: str, prompt_tokens: int = 0,
                    completion_tokens: int = 0, error: Optional[str] = None,
                    metadata: Optional[dict] = None):
        self.telemetry_client.log_event({
            "trace_id": trace_id,
            "span_id": span_id,
            "session_id": self.session_id,
            "agent_id": self.agent_id,
            "provider": provider,
            "model": model,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": prompt_tokens + completion_tokens,
            "cost": 0.0,
            "latency_ms": latency_ms,
            "status": status,
            "error": error,
            "span_type": "llm_call",
            "metadata": metadata or {},
        })


class OllamaTracedClient(_BaseHTTPTracedClient):
    """Traced wrapper for Ollama HTTP API."""

    def generate(self, model: str, prompt: str, **kwargs) -> dict:
        """Call Ollama /api/generate with telemetry."""
        trace_id = str(uuid.uuid4())
        span_id = str(uuid.uuid4())
        payload = {"model": model, "prompt": prompt, "stream": False, **kwargs}

        start_time = time.time()
        try:
            response = self._post_json("/api/generate", payload)
            latency_ms = int((time.time() - start_time) * 1000)

            pt = response.get("prompt_eval_count", len(prompt) // 4)
            ct = response.get("eval_count", len(response.get("response", "")) // 4)

            self._emit_event(trace_id, span_id, "ollama", model, latency_ms, "success",
                             prompt_tokens=pt, completion_tokens=ct,
                             metadata={"total_duration_ns": response.get("total_duration")})
            return response
        except Exception as e:
            latency_ms = int((time.time() - start_time) * 1000)
            self._emit_event(trace_id, span_id, "ollama", model, latency_ms, "error", error=str(e))
            raise

    def chat(self, model: str, messages: list, **kwargs) -> dict:
        """Call Ollama /api/chat with telemetry."""
        trace_id = str(uuid.uuid4())
        span_id = str(uuid.uuid4())
        payload = {"model": model, "messages": messages, "stream": False, **kwargs}

        start_time = time.time()
        try:
            response = self._post_json("/api/chat", payload)
            latency_ms = int((time.time() - start_time) * 1000)

            pt = response.get("prompt_eval_count", 0)
            ct = response.get("eval_count", 0)

            self._emit_event(trace_id, span_id, "ollama", model, latency_ms, "success",
                             prompt_tokens=pt, completion_tokens=ct,
                             metadata={"num_messages": len(messages)})
            return response
        except Exception as e:
            latency_ms = int((time.time() - start_time) * 1000)
            self._emit_event(trace_id, span_id, "ollama", model, latency_ms, "error", error=str(e))
            raise


class VLLMTracedClient(_BaseHTTPTracedClient):
    """Traced wrapper for vLLM's OpenAI-compatible API."""

    def chat(self, model: str, messages: list, **kwargs) -> dict:
        """Call vLLM /v1/chat/completions with telemetry."""
        trace_id = str(uuid.uuid4())
        span_id = str(uuid.uuid4())
        payload = {"model": model, "messages": messages, **kwargs}

        start_time = time.time()
        try:
            response = self._post_json("/v1/chat/completions", payload)
            latency_ms = int((time.time() - start_time) * 1000)

            usage = response.get("usage", {})
            pt = usage.get("prompt_tokens", 0)
            ct = usage.get("completion_tokens", 0)

            self._emit_event(trace_id, span_id, "vllm", model, latency_ms, "success",
                             prompt_tokens=pt, completion_tokens=ct)
            return response
        except Exception as e:
            latency_ms = int((time.time() - start_time) * 1000)
            self._emit_event(trace_id, span_id, "vllm", model, latency_ms, "error", error=str(e))
            raise

    def completions(self, model: str, prompt: str, **kwargs) -> dict:
        """Call vLLM /v1/completions with telemetry."""
        trace_id = str(uuid.uuid4())
        span_id = str(uuid.uuid4())
        payload = {"model": model, "prompt": prompt, **kwargs}

        start_time = time.time()
        try:
            response = self._post_json("/v1/completions", payload)
            latency_ms = int((time.time() - start_time) * 1000)

            usage = response.get("usage", {})
            pt = usage.get("prompt_tokens", 0)
            ct = usage.get("completion_tokens", 0)

            self._emit_event(trace_id, span_id, "vllm", model, latency_ms, "success",
                             prompt_tokens=pt, completion_tokens=ct)
            return response
        except Exception as e:
            latency_ms = int((time.time() - start_time) * 1000)
            self._emit_event(trace_id, span_id, "vllm", model, latency_ms, "error", error=str(e))
            raise
