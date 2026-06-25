import uuid
import time
from typing import Dict, Any, List, Optional
from aiops_sdk.instrumentation.llm_patcher import calculate_cost

try:
    from langchain_core.callbacks import BaseCallbackHandler
    from langchain_core.outputs import LLMResult
except ImportError:
    # Stand-in class if langchain is not installed
    class BaseCallbackHandler:
        pass
    class LLMResult:
        pass

class AIOpsLangChainCallbackHandler(BaseCallbackHandler):
    def __init__(self, telemetry_client, agent_id: str = "langchain-agent", session_id: str = "default-session"):
        self.telemetry_client = telemetry_client
        self.agent_id = agent_id
        self.session_id = session_id
        
        # Track active spans
        self.run_spans = {}
        self.run_times = {}

    def on_llm_start(
        self, serialized: Dict[str, Any], prompts: List[str], *, run_id: uuid.UUID, parent_run_id: Optional[uuid.UUID] = None, **kwargs: Any
    ) -> None:
        trace_id = str(parent_run_id) if parent_run_id else str(run_id)
        span_id = str(run_id)
        
        self.run_times[run_id] = time.time()
        self.run_spans[run_id] = {
            "trace_id": trace_id,
            "span_id": span_id,
            "parent_span_id": str(parent_run_id) if parent_run_id else None
        }

    def on_llm_end(self, response: LLMResult, *, run_id: uuid.UUID, **kwargs: Any) -> None:
        if run_id not in self.run_times or run_id not in self.run_spans:
            return
            
        latency_ms = int((time.time() - self.run_times.pop(run_id)) * 1000)
        span = self.run_spans.pop(run_id)
        
        # Parse output model & usage
        model = "unknown-model"
        prompt_tokens = 0
        completion_tokens = 0
        total_tokens = 0
        
        # Attempt to extract model and usage tokens from response LLMResult
        if response.llm_output:
            model = response.llm_output.get("model_name", model)
            token_usage = response.llm_output.get("token_usage", {})
            if token_usage:
                prompt_tokens = token_usage.get("prompt_tokens", 0)
                completion_tokens = token_usage.get("completion_tokens", 0)
                total_tokens = token_usage.get("total_tokens", prompt_tokens + completion_tokens)
                
        # Parse generation texts
        generations_text = ""
        if response.generations:
            generations_text = "\n".join([gen[0].text for gen in response.generations if gen])

        cost = calculate_cost(model, prompt_tokens, completion_tokens)

        self.telemetry_client.log_event({
            "trace_id": span["trace_id"],
            "span_id": span["span_id"],
            "parent_span_id": span["parent_span_id"],
            "session_id": self.session_id,
            "agent_id": self.agent_id,
            "provider": "langchain-llm",
            "model": model,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
            "cost": cost,
            "latency_ms": latency_ms,
            "status": "success",
            "span_type": "llm_call",
            "metadata": {
                "generations_preview": generations_text[:200] if generations_text else None
            }
        })

    def on_llm_error(self, error: BaseException, *, run_id: uuid.UUID, **kwargs: Any) -> None:
        if run_id not in self.run_times or run_id not in self.run_spans:
            return
            
        latency_ms = int((time.time() - self.run_times.pop(run_id)) * 1000)
        span = self.run_spans.pop(run_id)
        
        self.telemetry_client.log_event({
            "trace_id": span["trace_id"],
            "span_id": span["span_id"],
            "parent_span_id": span["parent_span_id"],
            "session_id": self.session_id,
            "agent_id": self.agent_id,
            "provider": "langchain-llm",
            "model": "unknown-error-model",
            "latency_ms": latency_ms,
            "status": "error",
            "error": str(error),
            "span_type": "llm_call"
        })

    def on_tool_start(
        self, serialized: Dict[str, Any], input_str: str, *, run_id: uuid.UUID, parent_run_id: Optional[uuid.UUID] = None, **kwargs: Any
    ) -> None:
        trace_id = str(parent_run_id) if parent_run_id else str(run_id)
        self.run_times[run_id] = time.time()
        self.run_spans[run_id] = {
            "trace_id": trace_id,
            "span_id": str(run_id),
            "parent_span_id": str(parent_run_id) if parent_run_id else None,
            "tool_name": serialized.get("name", "unknown_tool")
        }

    def on_tool_end(self, output: Any, *, run_id: uuid.UUID, **kwargs: Any) -> None:
        if run_id not in self.run_times or run_id not in self.run_spans:
            return
            
        latency_ms = int((time.time() - self.run_times.pop(run_id)) * 1000)
        span = self.run_spans.pop(run_id)
        
        self.telemetry_client.log_event({
            "trace_id": span["trace_id"],
            "span_id": span["span_id"],
            "parent_span_id": span["parent_span_id"],
            "session_id": self.session_id,
            "agent_id": self.agent_id,
            "provider": "langchain-tool",
            "model": span["tool_name"],
            "latency_ms": latency_ms,
            "status": "success",
            "span_type": "tool_call",
            "metadata": {
                "output_preview": str(output)[:200]
            }
        })

    def on_tool_error(self, error: BaseException, *, run_id: uuid.UUID, **kwargs: Any) -> None:
        if run_id not in self.run_times or run_id not in self.run_spans:
            return
            
        latency_ms = int((time.time() - self.run_times.pop(run_id)) * 1000)
        span = self.run_spans.pop(run_id)
        
        self.telemetry_client.log_event({
            "trace_id": span["trace_id"],
            "span_id": span["span_id"],
            "parent_span_id": span["parent_span_id"],
            "session_id": self.session_id,
            "agent_id": self.agent_id,
            "provider": "langchain-tool",
            "model": span.get("tool_name", "unknown_tool"),
            "latency_ms": latency_ms,
            "status": "error",
            "error": str(error),
            "span_type": "tool_call"
        })
