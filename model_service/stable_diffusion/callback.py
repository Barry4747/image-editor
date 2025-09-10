import os
import requests
import threading
import time

BACKEND_HOST = os.getenv("BACKEND_HOST", "localhost")
BACKEND_PORT = os.getenv("BACKEND_PORT", "8000")

DJANGO_API_URL = f"http://{BACKEND_HOST}:{BACKEND_PORT}"

session = requests.Session()

_last_sent = {}  

def send_progress_async(job_id: int, progress: float, event: str):
    """Sends progress in separate thread."""
    def _send():
        try:
            session.post(
                f"{DJANGO_API_URL}/api/job-progress/",
                json={
                    "job_id": job_id,
                    "progress": progress,
                    "event": event,
                },
                timeout=1,
            )
        except Exception as e:
            print(f"[WARN] Failed to notify Django about progress {progress}: {e}")
    threading.Thread(target=_send, daemon=True).start()

def callback(num_steps: int, job_id: int, min_interval: float = 0.3):
    """
    Returns a callback that throttles progress updates.
    :param num_steps: Total number of steps.
    :param job_id: Job identifier.
    :param min_interval: Minimum time (in seconds) between progress updates.
    """
    def on_step_end(pipe, step_index: int, timestep, callback_kwargs):
        current_step = step_index + 1
        progress = (current_step / num_steps)

        now = time.time()
        last_sent = _last_sent.get(job_id, 0)

        if now - last_sent >= min_interval or current_step == num_steps:
            _last_sent[job_id] = now
            send_progress_async(job_id, progress, "step-end")

        return callback_kwargs

    return on_step_end