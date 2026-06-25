import time
import uuid
import logging
from typing import Callable, Any

logger = logging.getLogger("aiops.sdk.patcher")

# Simple pricing coefficient map for common models (cost per 1M tokens)
MODEL_PRICING = {
    "gpt-4o": {"prompt": 5.00, "completion": 15.00},
    "gpt-4o-mini": {"prompt": 0.15, "completion": 0.60},
    "claude-3-5-sonnet": {"prompt": 3.00, "completion": 15.00},
    "claude-3-haiku": {"prompt": 0.25, "completion": 1.25}
}

def calculate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    # Fallback to a default coefficient if model is not recognized
    pricing = MODEL_PRICING.get(model, {"prompt": 1.5, "completion": 5.0})
    prompt_cost = (prompt_tokens / 1_000_000) * pricing["prompt"]
    completion_cost = (completion_tokens / 1_000_000) * pricing["completion"]
    return prompt_cost + completion_cost

class LLMAutoInstrumentor:
    def __init__(self, telemetry_client):
        self.telemetry_client = telemetry_client
        self.original_openai_create = None
        self.original_openai_async_create = None
        self.original_anthropic_create = None
        self.original_anthropic_async_create = None

    def instrument(self):
        self._instrument_openai()
        self._instrument_openai_async()
        self._instrument_anthropic()
        self._instrument_anthropic_async()


    def _instrument_openai(self):
        try:
            import openai
            # Patch sync ChatCompletion
            from openai.resources.chat.completions import Completions
            
            if not hasattr(Completions, "_aiops_patched"):
                self.original_openai_create = Completions.create
                
                def patched_create(completions_self, *args, **kwargs):
                    trace_id = kwargs.pop("aiops_trace_id", str(uuid.uuid4()))
                    span_id = str(uuid.uuid4())
                    session_id = kwargs.pop("aiops_session_id", "default-session")
                    agent_id = kwargs.pop("aiops_agent_id", "openai-agent")
                    
                    start_time = time.time()
                    try:
                        response = self.original_openai_create(completions_self, *args, **kwargs)
                        latency_ms = int((time.time() - start_time) * 1000)
                        
                        # Extract usage
                        prompt_tokens = 0
                        completion_tokens = 0
                        total_tokens = 0
                        model = kwargs.get("model", "unknown-openai")
                        
                        if hasattr(response, "usage") and response.usage:
                            prompt_tokens = response.usage.prompt_tokens
                            completion_tokens = response.usage.completion_tokens
                            total_tokens = response.usage.total_tokens
                            
                        cost = calculate_cost(model, prompt_tokens, completion_tokens)
                        
                        self.telemetry_client.log_event({
                            "trace_id": trace_id,
                            "span_id": span_id,
                            "session_id": session_id,
                            "agent_id": agent_id,
                            "provider": "openai",
                            "model": model,
                            "prompt_tokens": prompt_tokens,
                            "completion_tokens": completion_tokens,
                            "total_tokens": total_tokens,
                            "cost": cost,
                            "latency_ms": latency_ms,
                            "status": "success",
                            "span_type": "llm_call",
                            "metadata": {
                                "temperature": kwargs.get("temperature", 1.0),
                                "max_tokens": kwargs.get("max_tokens")
                            }
                        })
                        return response
                    except Exception as e:
                        latency_ms = int((time.time() - start_time) * 1000)
                        self.telemetry_client.log_event({
                            "trace_id": trace_id,
                            "span_id": span_id,
                            "session_id": session_id,
                            "agent_id": agent_id,
                            "provider": "openai",
                            "model": kwargs.get("model", "unknown-openai"),
                            "latency_ms": latency_ms,
                            "status": "error",
                            "error": str(e),
                            "span_type": "llm_call"
                        })
                        raise e
                
                Completions.create = patched_create
                Completions._aiops_patched = True
                logger.info("OpenAI ChatCompletions auto-instrumented.")
        except ImportError:
            pass  # OpenAI is not installed in the target environment

    def _instrument_anthropic(self):
        try:
            import anthropic
            from anthropic.resources.messages import Messages
            
            if not hasattr(Messages, "_aiops_patched"):
                self.original_anthropic_create = Messages.create
                
                def patched_create(messages_self, *args, **kwargs):
                    trace_id = kwargs.pop("aiops_trace_id", str(uuid.uuid4()))
                    span_id = str(uuid.uuid4())
                    session_id = kwargs.pop("aiops_session_id", "default-session")
                    agent_id = kwargs.pop("aiops_agent_id", "anthropic-agent")
                    
                    start_time = time.time()
                    try:
                        response = self.original_anthropic_create(messages_self, *args, **kwargs)
                        latency_ms = int((time.time() - start_time) * 1000)
                        
                        prompt_tokens = 0
                        completion_tokens = 0
                        total_tokens = 0
                        model = kwargs.get("model", "unknown-anthropic")
                        
                        if hasattr(response, "usage") and response.usage:
                            prompt_tokens = response.usage.input_tokens
                            completion_tokens = response.usage.output_tokens
                            total_tokens = prompt_tokens + completion_tokens
                            
                        cost = calculate_cost(model, prompt_tokens, completion_tokens)
                        
                        self.telemetry_client.log_event({
                            "trace_id": trace_id,
                            "span_id": span_id,
                            "session_id": session_id,
                            "agent_id": agent_id,
                            "provider": "anthropic",
                            "model": model,
                            "prompt_tokens": prompt_tokens,
                            "completion_tokens": completion_tokens,
                            "total_tokens": total_tokens,
                            "cost": cost,
                            "latency_ms": latency_ms,
                            "status": "success",
                            "span_type": "llm_call",
                            "metadata": {
                                "temperature": kwargs.get("temperature", 1.0),
                                "max_tokens": kwargs.get("max_tokens")
                            }
                        })
                        return response
                    except Exception as e:
                        latency_ms = int((time.time() - start_time) * 1000)
                        self.telemetry_client.log_event({
                            "trace_id": trace_id,
                            "span_id": span_id,
                            "session_id": session_id,
                            "agent_id": agent_id,
                            "provider": "anthropic",
                            "model": kwargs.get("model", "unknown-anthropic"),
                            "latency_ms": latency_ms,
                            "status": "error",
                            "error": str(e),
                            "span_type": "llm_call"
                        })
                        raise e
                
                Messages.create = patched_create
                Messages._aiops_patched = True
                logger.info("Anthropic Messages auto-instrumented.")
        except ImportError:
            pass

    def _instrument_openai_async(self):
        """Patch OpenAI async client: AsyncCompletions.create"""
        try:
            from openai.resources.chat.completions import AsyncCompletions

            if not hasattr(AsyncCompletions, "_aiops_patched"):
                self.original_openai_async_create = AsyncCompletions.create

                async def patched_async_create(completions_self, *args, **kwargs):
                    trace_id = kwargs.pop("aiops_trace_id", str(uuid.uuid4()))
                    span_id = str(uuid.uuid4())
                    session_id = kwargs.pop("aiops_session_id", "default-session")
                    agent_id = kwargs.pop("aiops_agent_id", "openai-agent")

                    start_time = time.time()
                    try:
                        response = await self.original_openai_async_create(completions_self, *args, **kwargs)
                        latency_ms = int((time.time() - start_time) * 1000)

                        prompt_tokens = 0
                        completion_tokens = 0
                        total_tokens = 0
                        model = kwargs.get("model", "unknown-openai")

                        if hasattr(response, "usage") and response.usage:
                            prompt_tokens = response.usage.prompt_tokens
                            completion_tokens = response.usage.completion_tokens
                            total_tokens = response.usage.total_tokens

                        cost = calculate_cost(model, prompt_tokens, completion_tokens)

                        self.telemetry_client.log_event({
                            "trace_id": trace_id,
                            "span_id": span_id,
                            "session_id": session_id,
                            "agent_id": agent_id,
                            "provider": "openai",
                            "model": model,
                            "prompt_tokens": prompt_tokens,
                            "completion_tokens": completion_tokens,
                            "total_tokens": total_tokens,
                            "cost": cost,
                            "latency_ms": latency_ms,
                            "status": "success",
                            "span_type": "llm_call",
                            "metadata": {
                                "temperature": kwargs.get("temperature", 1.0),
                                "max_tokens": kwargs.get("max_tokens"),
                                "async": True
                            }
                        })
                        return response
                    except Exception as e:
                        latency_ms = int((time.time() - start_time) * 1000)
                        self.telemetry_client.log_event({
                            "trace_id": trace_id,
                            "span_id": span_id,
                            "session_id": session_id,
                            "agent_id": agent_id,
                            "provider": "openai",
                            "model": kwargs.get("model", "unknown-openai"),
                            "latency_ms": latency_ms,
                            "status": "error",
                            "error": str(e),
                            "span_type": "llm_call"
                        })
                        raise e

                AsyncCompletions.create = patched_async_create
                AsyncCompletions._aiops_patched = True
                logger.info("OpenAI AsyncCompletions auto-instrumented.")
        except ImportError:
            pass

    def _instrument_anthropic_async(self):
        """Patch Anthropic async client: AsyncMessages.create"""
        try:
            from anthropic.resources.messages import AsyncMessages

            if not hasattr(AsyncMessages, "_aiops_patched"):
                self.original_anthropic_async_create = AsyncMessages.create

                async def patched_async_create(messages_self, *args, **kwargs):
                    trace_id = kwargs.pop("aiops_trace_id", str(uuid.uuid4()))
                    span_id = str(uuid.uuid4())
                    session_id = kwargs.pop("aiops_session_id", "default-session")
                    agent_id = kwargs.pop("aiops_agent_id", "anthropic-agent")

                    start_time = time.time()
                    try:
                        response = await self.original_anthropic_async_create(messages_self, *args, **kwargs)
                        latency_ms = int((time.time() - start_time) * 1000)

                        prompt_tokens = 0
                        completion_tokens = 0
                        total_tokens = 0
                        model = kwargs.get("model", "unknown-anthropic")

                        if hasattr(response, "usage") and response.usage:
                            prompt_tokens = response.usage.input_tokens
                            completion_tokens = response.usage.output_tokens
                            total_tokens = prompt_tokens + completion_tokens

                        cost = calculate_cost(model, prompt_tokens, completion_tokens)

                        self.telemetry_client.log_event({
                            "trace_id": trace_id,
                            "span_id": span_id,
                            "session_id": session_id,
                            "agent_id": agent_id,
                            "provider": "anthropic",
                            "model": model,
                            "prompt_tokens": prompt_tokens,
                            "completion_tokens": completion_tokens,
                            "total_tokens": total_tokens,
                            "cost": cost,
                            "latency_ms": latency_ms,
                            "status": "success",
                            "span_type": "llm_call",
                            "metadata": {
                                "temperature": kwargs.get("temperature", 1.0),
                                "max_tokens": kwargs.get("max_tokens"),
                                "async": True
                            }
                        })
                        return response
                    except Exception as e:
                        latency_ms = int((time.time() - start_time) * 1000)
                        self.telemetry_client.log_event({
                            "trace_id": trace_id,
                            "span_id": span_id,
                            "session_id": session_id,
                            "agent_id": agent_id,
                            "provider": "anthropic",
                            "model": kwargs.get("model", "unknown-anthropic"),
                            "latency_ms": latency_ms,
                            "status": "error",
                            "error": str(e),
                            "span_type": "llm_call"
                        })
                        raise e

                AsyncMessages.create = patched_async_create
                AsyncMessages._aiops_patched = True
                logger.info("Anthropic AsyncMessages auto-instrumented.")
        except ImportError:
            pass
