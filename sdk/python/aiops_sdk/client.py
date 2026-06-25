import queue
import threading
import time
import json
import urllib.request
import urllib.error
import os
import uuid
import logging

logger = logging.getLogger("aiops.sdk")

class TelemetryClient:
    def __init__(self, api_key: str, collector_url: str = "http://localhost:8000", batch_size: int = 20, flush_interval_secs: float = 1.0):
        self.api_key = api_key
        self.collector_url = collector_url.rstrip("/")
        self.batch_size = batch_size
        self.flush_interval_secs = flush_interval_secs
        
        self.queue = queue.Queue()
        self.running = True
        
        # Local fallback log path
        self.fallback_file = ".aiops_fallback_telemetry.jsonl"
        
        # Start background thread
        self.thread = threading.Thread(target=self._worker, daemon=True)
        self.thread.start()
        logger.info("AIOps TelemetryClient background worker started.")

    def log_event(self, event_data: dict):
        """Put event data to thread-safe queue."""
        # Ensure mandatory telemetry fields are populated
        if "trace_id" not in event_data:
            event_data["trace_id"] = str(uuid.uuid4())
        if "span_id" not in event_data:
            event_data["span_id"] = str(uuid.uuid4())
            
        self.queue.put(event_data)

    def _worker(self):
        """Worker thread that polls the queue, batches events, and sends them."""
        while self.running:
            batch = []
            start_time = time.time()
            
            while len(batch) < self.batch_size and (time.time() - start_time) < self.flush_interval_secs:
                try:
                    # Timeout to check check running status periodically
                    timeout = max(0.1, self.flush_interval_secs - (time.time() - start_time))
                    event = self.queue.get(timeout=timeout)
                    batch.append(event)
                    self.queue.task_done()
                except queue.Empty:
                    break
            
            if batch:
                self._send_batch(batch)
                
        # Flush remaining events before stopping
        remaining = []
        while not self.queue.empty():
            try:
                remaining.append(self.queue.get_nowait())
                self.queue.task_done()
            except queue.Empty:
                break
        if remaining:
            self._send_batch(remaining)

    def _send_batch(self, batch: list, max_retries: int = 3):
        """Sends a batch of events as a JSON array with exponential backoff.
        Falls back to local storage on persistent failure."""
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}"
        }
        
        # Try batch endpoint first
        batch_url = f"{self.collector_url}/v1/telemetry/batch"
        data = json.dumps(batch).encode("utf-8")
        req = urllib.request.Request(batch_url, data=data, headers=headers, method="POST")
        
        backoff = 0.5
        for attempt in range(max_retries):
            try:
                with urllib.request.urlopen(req, timeout=10) as response:
                    if response.status in (200, 201, 202):
                        logger.debug(f"Batch of {len(batch)} events sent successfully.")
                        return
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    # Batch endpoint not available, fall back to single-event sends
                    logger.info("Batch endpoint not found, falling back to single-event mode.")
                    self._send_individually(batch, headers, max_retries)
                    return
                logger.warning(f"Batch send failed (attempt {attempt+1}/{max_retries}): HTTP {e.code}")
                time.sleep(backoff)
                backoff *= 2
            except urllib.error.URLError as e:
                logger.warning(f"Batch send failed (attempt {attempt+1}/{max_retries}): {e}")
                time.sleep(backoff)
                backoff *= 2
            except Exception as e:
                logger.warning(f"Unexpected error during batch send: {e}")
                break
                
        # All retries failed: save to local fallback
        for event in batch:
            self._write_to_fallback(event)

    def _send_individually(self, events: list, headers: dict, max_retries: int = 3):
        """Fallback: send events one at a time to the single-event endpoint."""
        single_url = f"{self.collector_url}/v1/telemetry"
        for event in events:
            data = json.dumps(event).encode("utf-8")
            req = urllib.request.Request(single_url, data=data, headers=headers, method="POST")
            backoff = 0.5
            sent = False
            for attempt in range(max_retries):
                try:
                    with urllib.request.urlopen(req, timeout=5) as response:
                        if response.status in (200, 201, 202):
                            sent = True
                            break
                except (urllib.error.URLError, Exception) as e:
                    logger.warning(f"Single send failed (attempt {attempt+1}/{max_retries}): {e}")
                    time.sleep(backoff)
                    backoff *= 2
            if not sent:
                self._write_to_fallback(event)

    def _write_to_fallback(self, event: dict):
        try:
            with open(self.fallback_file, "a") as f:
                f.write(json.dumps(event) + "\n")
            logger.info("Saved telemetry event to local fallback file due to connection failure.")
        except Exception as e:
            logger.error(f"Failed writing fallback telemetry: {e}")

    def shutdown(self):
        """Signal background thread to finish and wait for it."""
        self.running = False
        self.thread.join(timeout=3)
        logger.info("AIOps TelemetryClient background worker stopped.")
