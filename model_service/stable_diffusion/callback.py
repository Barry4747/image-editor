import os
import requests
import threading

BACKEND_HOST = os.getenv("BACKEND_HOST", "localhost")
BACKEND_PORT = os.getenv("BACKEND_PORT", "8000")

DJANGO_API_URL = f"http://{BACKEND_HOST}:{BACKEND_PORT}"

session = requests.Session()

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

def callback(num_steps: int, job_id: int):
    def on_step_end(pipe, step, timestep, callback_kwargs):
        progress = float(step) / float(num_steps)
        send_progress_async(job_id, progress, "step-end")
        return callback_kwargs
    return on_step_end
