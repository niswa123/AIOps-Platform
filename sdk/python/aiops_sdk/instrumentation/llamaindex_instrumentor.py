"""
AIOps LlamaIndex Instrumentor.

Hooks into LlamaIndex's instrumentation system to capture:
- LLM calls (prompt tokens, completion tokens, latency, cost)
- Embedding calls
- Query pipeline events (retrieval, synthesis)

Usage:
    from aiops_sdk import TelemetryClient
    from aiops_sdk.instrumentation.llamaindex_instrumentor import AIOpsLlamaIndexInstrumentor

    client = TelemetryClient(api_key="your-key")
    instrumentor = AIOpsLlamaIndexInstrumentor(client, agent_id="rag-pipeline")
    instrumentor.instrument()
"""

import uuid
import time
import logging
from typing import Any, Optional, Dict

from aiops_sdk.instrumentation.llm_patcher import calculate_cost

logger = logging.getLogger("aiops.sdk.llamaindex")

try:
    from llama_index.core.instrumentation import get_dispatcher
    from llama_index.core.instrumentation.span_handlers import BaseSpanHandler
    from llama_index.core.instrumentation.span import BaseSpan
    from llama_index.core.instrumentation.events import BaseEvent
    from llama_index.core.instrumentation.events.llm import (
        LLMCompletionStartEvent,
        LLMCompletionEndEvent,
        LLMChatStartEvent,
        LLMChatEndEvent,
    )
    from llama_index.core.instrumentation.events.embedding import (
        EmbeddingStartEvent,
        EmbeddingEndEvent,
    )
    from llama_index.core.instrumentation.events.retrieval import (
        RetrievalStartEvent,
        RetrievalEndEvent,
    )

    _LLAMAINDEX_AVAILABLE = True
except ImportError:
    _LLAMAINDEX_AVAILABLE = False

    # Stub classes for import safety
    class BaseSpanHandler:  # type: ignore[no-redef]
        pass

    class BaseSpan:  # type: ignore[no-redef]
        pass


class _AIOpsSpan:
    """Internal span tracking object."""
    def __init__(self, span_id: str, trace_id: str, parent_span_id: Optional[str] = None):
        self.span_id = span_id
        self.trace_id = trace_id
        self.parent_span_id = parent_span_id
        self.start_time = time.time()
        self.attributes: Dict[str, Any] = {}


class AIOpsLlamaIndexSpanHandler(BaseSpanHandler[_AIOpsSpan]):
    """Span handler that tracks LlamaIndex operation spans and sends telemetry."""

    def __init__(self, telemetry_client, agent_id: str = "llamaindex-agent", session_id: str = "default-session"):
        super().__init__()
        self.telemetry_client = telemetry_client
        self.agent_id = agent_id
        self.session_id = session_id
        self._active_spans: Dict[str, _AIOpsSpan] = {}

    def new_span(
        self,
        id_: str,
        bound_args: Any,
        instance: Optional[Any] = None,
        parent_span_id: Optional[str] = None,
        **kwargs: Any,
    ) -> Optional[_AIOpsSpan]:
        trace_id = str(uuid.uuid4()) if parent_span_id is None else self._get_trace_id(parent_span_id)
        span = _AIOpsSpan(
            span_id=id_,
            trace_id=trace_id,
            parent_span_id=parent_span_id,
        )
        self._active_spans[id_] = span
        return span

    def prepare_to_exit_span(
        self,
        id_: str,
        bound_args: Any,
        instance: Optional[Any] = None,
        result: Optional[Any] = None,
        **kwargs: Any,
    ) -> Optional[_AIOpsSpan]:
        span = self._active_spans.pop(id_, None)
        if span is None:
            return None

        latency_ms = int((time.time() - span.start_time) * 1000)

        # Build telemetry event from accumulated span attributes
        event = {
            "trace_id": span.trace_id,
            "span_id": span.span_id,
            "parent_span_id": span.parent_span_id,
            "session_id": self.session_id,
            "agent_id": self.agent_id,
            "latency_ms": latency_ms,
            "status": "success",
            "span_type": span.attributes.get("span_type", "agent_run"),
            "provider": span.attributes.get("provider", "llamaindex"),
            "model": span.attributes.get("model", "unknown"),
            "prompt_tokens": span.attributes.get("prompt_tokens", 0),
            "completion_tokens": span.attributes.get("completion_tokens", 0),
            "total_tokens": span.attributes.get("total_tokens", 0),
            "cost": span.attributes.get("cost", 0.0),
            "metadata": span.attributes.get("metadata", {}),
        }
        self.telemetry_client.log_event(event)
        return span

    def prepare_to_drop_span(
        self,
        id_: str,
        bound_args: Any,
        instance: Optional[Any] = None,
        err: Optional[BaseException] = None,
        **kwargs: Any,
    ) -> Optional[_AIOpsSpan]:
        span = self._active_spans.pop(id_, None)
        if span is None:
            return None

        latency_ms = int((time.time() - span.start_time) * 1000)
        self.telemetry_client.log_event({
            "trace_id": span.trace_id,
            "span_id": span.span_id,
            "parent_span_id": span.parent_span_id,
            "session_id": self.session_id,
            "agent_id": self.agent_id,
            "latency_ms": latency_ms,
            "status": "error",
            "error": str(err) if err else "Unknown error",
            "span_type": span.attributes.get("span_type", "agent_run"),
            "provider": "llamaindex",
            "model": span.attributes.get("model", "unknown"),
        })
        return span

    def _get_trace_id(self, parent_span_id: str) -> str:
        parent = self._active_spans.get(parent_span_id)
        return parent.trace_id if parent else str(uuid.uuid4())


class AIOpsLlamaIndexEventHandler:
    """Event handler that enriches active spans with LLM/embedding event data."""

    def __init__(self, span_handler: AIOpsLlamaIndexSpanHandler):
        self.span_handler = span_handler

    def handle(self, event: Any, **kwargs: Any) -> None:
        span_id = getattr(event, "span_id", None)
        if span_id is None or span_id not in self.span_handler._active_spans:
            return

        span = self.span_handler._active_spans[span_id]

        if not _LLAMAINDEX_AVAILABLE:
            return

        # LLM completion events
        if isinstance(event, (LLMCompletionStartEvent, LLMChatStartEvent)):
            span.attributes["span_type"] = "llm_call"
            model_name = getattr(event, "model_dict", {}).get("model", "unknown")
            span.attributes["model"] = model_name

        elif isinstance(event, (LLMCompletionEndEvent, LLMChatEndEvent)):
            span.attributes["span_type"] = "llm_call"
            response = getattr(event, "response", None)
            if response:
                raw = getattr(response, "raw", None)
                if raw and hasattr(raw, "usage"):
                    usage = raw.usage
                    pt = getattr(usage, "prompt_tokens", 0) or getattr(usage, "input_tokens", 0)
                    ct = getattr(usage, "completion_tokens", 0) or getattr(usage, "output_tokens", 0)
                    span.attributes["prompt_tokens"] = pt
                    span.attributes["completion_tokens"] = ct
                    span.attributes["total_tokens"] = pt + ct
                    span.attributes["cost"] = calculate_cost(
                        span.attributes.get("model", "unknown"), pt, ct
                    )

        # Embedding events
        elif isinstance(event, EmbeddingStartEvent):
            span.attributes["span_type"] = "tool_call"
            span.attributes["provider"] = "llamaindex-embedding"
            span.attributes["model"] = getattr(event, "model_dict", {}).get("model_name", "unknown-embedding")

        elif isinstance(event, EmbeddingEndEvent):
            chunks = getattr(event, "chunks", [])
            span.attributes["metadata"] = {"num_chunks": len(chunks) if chunks else 0}

        # Retrieval events
        elif isinstance(event, RetrievalStartEvent):
            span.attributes["span_type"] = "tool_call"
            span.attributes["provider"] = "llamaindex-retriever"

        elif isinstance(event, RetrievalEndEvent):
            nodes = getattr(event, "nodes", [])
            span.attributes["metadata"] = {"num_retrieved_nodes": len(nodes) if nodes else 0}


class AIOpsLlamaIndexInstrumentor:
    """Top-level instrumentor that registers span and event handlers with LlamaIndex."""

    def __init__(self, telemetry_client, agent_id: str = "llamaindex-agent", session_id: str = "default-session"):
        self.telemetry_client = telemetry_client
        self.agent_id = agent_id
        self.session_id = session_id

    def instrument(self) -> None:
        if not _LLAMAINDEX_AVAILABLE:
            logger.info("llama-index-core not installed; LlamaIndex instrumentation skipped.")
            return

        span_handler = AIOpsLlamaIndexSpanHandler(
            telemetry_client=self.telemetry_client,
            agent_id=self.agent_id,
            session_id=self.session_id,
        )

        dispatcher = get_dispatcher()
        dispatcher.add_span_handler(span_handler)
        logger.info("LlamaIndex span handler registered with AIOps telemetry.")
