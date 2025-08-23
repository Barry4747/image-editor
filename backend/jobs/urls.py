from django.urls import path
from .views import CreateJobView, job_progress, get_models
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('jobs', CreateJobView.as_view(), name='create_job'),
    path('api/job-progress/', job_progress, name='job_progress'),
    path('api/models/', get_models, name='get_models'),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
