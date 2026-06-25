"""
AIOps AutoGen Handler.

Hooks into Microsoft AutoGen's ConversableAgent to capture:
- Agent message generation (generate_reply)
- Multi-agent conversations
- Tool/function call executions within agents

Usage:
    from aiops_sdk import TelemetryClient
    from aiops_sdk.instrumentation.autogen_handler import AIOpsAutoGenHandler

    client = TelemetryClient(api_key="your-key")
    handler = AIOpsAutoGenHandler(client)
    handler.instrument()
"""

import uuid
import time
import logging
import functools
from typing import Any, Optional, List, Dict, Union

from aiops_sdk.instrumentation.llm_patcher import calculate_cost

logger = logging.getLogger("aiops.sdk.autogen")

try:
    from autogen import ConversableAgent, GroupChat, GroupChatManager
    _AUTOGEN_AVAILABLE = True
except ImportError:
    try:
        from pyautogen import ConversableAgent, GroupChat, GroupChatManager
        _AUTOGEN_AVAILABLE = True
    except ImportError:
        _AUTOGEN_AVAILABLE = False


class AIOpsAutoGenHandler:
    """Instruments AutoGen ConversableAgent.generate_reply and GroupChatManager.run_chat."""

    def __init__(self, telemetry_client, session_id: str = "default-session"):
        self.telemetry_client = telemetry_client
        self.session_id = session_id
        self._original_generate_reply = None
        self._original_run_chat = None

    def instrument(self) -> None:
        if not _AUTOGEN_AVAILABLE:
            logger.info("autogen/pyautogen not installed; AutoGen instrumentation skipped.")
            return

        self._patch_generate_reply()
        self._patch_group_chat()
        logger.info("AutoGen ConversableAgent and GroupChatManager auto-instrumented.")

    def _patch_generate_reply(self) -> None:
        """Patch ConversableAgent.generate_reply to emit a span per reply generation."""
        if hasattr(ConversableAgent, "_aiops_patched"):
            return

        self._original_generate_reply = ConversableAgent.generate_reply

        handler = self

        @functools.wraps(ConversableAgent.generate_reply)
        def patched_generate_reply(
            agent_self,
            messages: Optional[List[Dict[str, Any]]] = None,
            sender: Optional[Any] = None,
            **kwargs: Any,
        ) -> Union[str, Dict, None]:
            trace_id = str(uuid.uuid4())
            span_id = str(uuid.uuid4())
            agent_id = getattr(agent_self, "name", "autogen-agent")

            start_time = time.time()
            try:
                result = handler._original_generate_reply(agent_self, messages, sender, **kwargs)
                latency_ms = int((time.time() - start_time) * 1000)

                # Extract model info from agent config
                llm_config = getattr(agent_self, "llm_config", {}) or {}
                config_list = llm_config.get("config_list", [{}])
                model = config_list[0].get("model", "unknown") if config_list else "unknown"

                # Estimate token usage from message lengths
                input_chars = sum(len(str(m.get("content", ""))) for m in (messages or []))
                output_chars = len(str(result)) if result else 0
                est_prompt_tokens = input_chars // 4
                est_completion_tokens = output_chars // 4

                cost = calculate_cost(model, est_prompt_tokens, est_completion_tokens)

                sender_name = getattr(sender, "name", "unknown") if sender else "user"

                handler.telemetry_client.log_event({
                    "trace_id": trace_id,
                    "span_id": span_id,
                    "session_id": handler.session_id,
                    "agent_id": agent_id,
                    "provider": "autogen",
                    "model": model,
                    "prompt_tokens": est_prompt_tokens,
                    "completion_tokens": est_completion_tokens,
                    "total_tokens": est_prompt_tokens + est_completion_tokens,
                    "cost": cost,
                    "latency_ms": latency_ms,
                    "status": "success",
                    "span_type": "llm_call",
                    "metadata": {
                        "sender": sender_name,
                        "num_messages": len(messages) if messages else 0,
                        "reply_preview": str(result)[:300] if result else None,
                    }
                })
                return result
            except Exception as e:
                latency_ms = int((time.time() - start_time) * 1000)
                handler.telemetry_client.log_event({
                    "trace_id": trace_id,
                    "span_id": span_id,
                    "session_id": handler.session_id,
                    "agent_id": agent_id,
                    "provider": "autogen",
                    "model": "unknown",
                    "latency_ms": latency_ms,
                    "status": "error",
                    "error": str(e),
                    "span_type": "llm_call",
                })
                raise

        ConversableAgent.generate_reply = patched_generate_reply
        ConversableAgent._aiops_patched = True

    def _patch_group_chat(self) -> None:
        """Patch GroupChatManager.run_chat to emit a top-level span for multi-agent conversations."""
        if not hasattr(GroupChatManager, "run_chat"):
            return
        if hasattr(GroupChatManager, "_aiops_patched"):
            return

        self._original_run_chat = GroupChatManager.run_chat

        handler = self

        @functools.wraps(GroupChatManager.run_chat)
        def patched_run_chat(
            manager_self,
            messages: Optional[List[Dict[str, Any]]] = None,
            sender: Optional[Any] = None,
            config: Optional[Any] = None,
        ) -> Any:
            trace_id = str(uuid.uuid4())
            span_id = str(uuid.uuid4())

            start_time = time.time()
            try:
                result = handler._original_run_chat(manager_self, messages, sender, config)
                latency_ms = int((time.time() - start_time) * 1000)

                group_chat = getattr(manager_self, "groupchat", None)
                num_agents = len(getattr(group_chat, "agents", [])) if group_chat else 0

                handler.telemetry_client.log_event({
                    "trace_id": trace_id,
                    "span_id": span_id,
                    "session_id": handler.session_id,
                    "agent_id": "autogen-group-chat",
                    "provider": "autogen",
                    "model": "group-chat-pipeline",
                    "latency_ms": latency_ms,
                    "status": "success",
                    "span_type": "agent_run",
                    "metadata": {
                        "num_agents": num_agents,
                        "max_round": getattr(group_chat, "max_round", None) if group_chat else None,
                    }
                })
                return result
            except Exception as e:
                latency_ms = int((time.time() - start_time) * 1000)
                handler.telemetry_client.log_event({
                    "trace_id": trace_id,
                    "span_id": span_id,
                    "session_id": handler.session_id,
                    "agent_id": "autogen-group-chat",
                    "provider": "autogen",
                    "model": "group-chat-pipeline",
                    "latency_ms": latency_ms,
                    "status": "error",
                    "error": str(e),
                    "span_type": "agent_run",
                })
                raise

        GroupChatManager.run_chat = patched_run_chat
        GroupChatManager._aiops_patched = True
