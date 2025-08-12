from django.urls import path
from .views import health_check, MaskView

urlpatterns = [
    path("health/", health_check),
    path('temp-mask/', MaskView.as_view({'post': 'create'}), name='temp-mask'),
]
