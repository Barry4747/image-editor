from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r"ws/progress/(?P<session_id>[-\w]+)/$", consumers.JobProgressConsumer.as_asgi())
]
