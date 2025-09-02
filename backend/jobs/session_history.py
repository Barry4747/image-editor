from collections import deque
from time import time
from typing import Dict, Any, List
from django.core.cache import cache

MAX_EVENTS = 200           # limit per session
TTL_SECONDS = 24 * 60 * 60 # 24h

def _key(session_id: str) -> str:
    return f"hist:{session_id}"

def add_event(session_id: str, event: Dict[str, Any]) -> int:
    if not session_id:
        return 0
    key = _key(session_id)
    hist = cache.get(key) or deque(maxlen=MAX_EVENTS)
    hist.append({**event, "ts": time()})
    cache.set(key, hist, TTL_SECONDS)
    return len(hist)

def get_history(session_id: str) -> List[Dict[str, Any]]:
    hist = cache.get(_key(session_id)) or deque()
    return list(hist)

def clear_history(session_id: str) -> None:
    cache.delete(_key(session_id))
