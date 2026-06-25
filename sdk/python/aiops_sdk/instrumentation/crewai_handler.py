"""
AIOps CrewAI Handler.

Hooks into CrewAI's event system to capture:
- Agent task executions (reasoning steps, tool calls)
- Crew kickoff lifecycle (start, end, errors)
- LLM calls made within agent reasoning

Usage:
    from aiops_sdk import TelemetryClient
    from aiops_sdk.instrumentation.crewai_handler import AIOpsCrewAIHandler

    client = TelemetryClient(api_key="your-key")
    handler = AIOpsCrewAIHandler(client)
    handler.instrument()
"""

import uuid
import time
import logging
import functools
from typing import Any, Optional

from aiops_sdk.instrumentation.llm_patcher import calculate_cost

logger = logging.getLogger("aiops.sdk.crewai")

try:
    import crewai
    from crewai import Agent, Task, Crew
    _CREWAI_AVAILABLE = True
except ImportError:
    _CREWAI_AVAILABLE = False


class AIOpsCrewAIHandler:
    """Instruments CrewAI Agent.execute_task and Crew.kickoff to emit telemetry spans."""

    def __init__(self, telemetry_client, session_id: str = "default-session"):
        self.telemetry_client = telemetry_client
        self.session_id = session_id
        self._original_execute_task = None
        self._original_kickoff = None

    def instrument(self) -> None:
        if not _CREWAI_AVAILABLE:
            logger.info("crewai not installed; CrewAI instrumentation skipped.")
            return

        self._patch_agent_execute()
        self._patch_crew_kickoff()
        logger.info("CrewAI Agent and Crew auto-instrumented.")

    def _patch_agent_execute(self) -> None:
        """Patch Agent.execute_task to emit a span per task execution."""
        if hasattr(Agent, "_aiops_patched"):
            return

        self._original_execute_task = Agent.execute_task

        handler = self  # capture reference

        @functools.wraps(Agent.execute_task)
        def patched_execute_task(agent_self, task: Any, context: Optional[str] = None, tools: Optional[list] = None) -> str:
            trace_id = str(uuid.uuid4())
            span_id = str(uuid.uuid4())
            agent_id = getattr(agent_self, "role", "crewai-agent")

            start_time = time.time()
            try:
                result = handler._original_execute_task(agent_self, task, context, tools)
                latency_ms = int((time.time() - start_time) * 1000)

                task_description = ""
                if hasattr(task, "description"):
                    task_description = str(task.description)[:200]

                handler.telemetry_client.log_event({
                    "trace_id": trace_id,
                    "span_id": span_id,
                    "session_id": handler.session_id,
                    "agent_id": agent_id,
                    "provider": "crewai",
                    "model": getattr(agent_self, "llm", {}).get("model", "unknown") if isinstance(getattr(agent_self, "llm", None), dict) else str(getattr(agent_self, "llm", "unknown")),
                    "latency_ms": latency_ms,
                    "status": "success",
                    "span_type": "agent_run",
                    "metadata": {
                        "task_description": task_description,
                        "role": getattr(agent_self, "role", "unknown"),
                        "goal": str(getattr(agent_self, "goal", ""))[:200],
                        "result_preview": str(result)[:300] if result else None,
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
                    "provider": "crewai",
                    "model": "unknown",
                    "latency_ms": latency_ms,
                    "status": "error",
                    "error": str(e),
                    "span_type": "agent_run",
                })
                raise

        Agent.execute_task = patched_execute_task
        Agent._aiops_patched = True

    def _patch_crew_kickoff(self) -> None:
        """Patch Crew.kickoff to emit a top-level span for the entire crew run."""
        if hasattr(Crew, "_aiops_patched"):
            return

        self._original_kickoff = Crew.kickoff

        handler = self

        @functools.wraps(Crew.kickoff)
        def patched_kickoff(crew_self, inputs: Optional[dict] = None) -> Any:
            trace_id = str(uuid.uuid4())
            span_id = str(uuid.uuid4())

            start_time = time.time()
            try:
                result = handler._original_kickoff(crew_self, inputs)
                latency_ms = int((time.time() - start_time) * 1000)

                num_agents = len(getattr(crew_self, "agents", []))
                num_tasks = len(getattr(crew_self, "tasks", []))

                handler.telemetry_client.log_event({
                    "trace_id": trace_id,
                    "span_id": span_id,
                    "session_id": handler.session_id,
                    "agent_id": "crewai-orchestrator",
                    "provider": "crewai",
                    "model": "crew-pipeline",
                    "latency_ms": latency_ms,
                    "status": "success",
                    "span_type": "agent_run",
                    "metadata": {
                        "num_agents": num_agents,
                        "num_tasks": num_tasks,
                        "process": str(getattr(crew_self, "process", "sequential")),
                        "result_preview": str(result)[:500] if result else None,
                    }
                })
                return result
            except Exception as e:
                latency_ms = int((time.time() - start_time) * 1000)
                handler.telemetry_client.log_event({
                    "trace_id": trace_id,
                    "span_id": span_id,
                    "session_id": handler.session_id,
                    "agent_id": "crewai-orchestrator",
                    "provider": "crewai",
                    "model": "crew-pipeline",
                    "latency_ms": latency_ms,
                    "status": "error",
                    "error": str(e),
                    "span_type": "agent_run",
                })
                raise

        Crew.kickoff = patched_kickoff
        Crew._aiops_patched = True
