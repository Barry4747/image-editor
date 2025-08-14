from django.urls import path
from .views import CreateJobView
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('jobs', CreateJobView.as_view(), name='create_job'),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
