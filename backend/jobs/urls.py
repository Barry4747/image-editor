from django.urls import path
from .views import CreateJobView, job_progress, get_models, get_masks, get_masks_status, get_t2i_models
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('jobs', CreateJobView.as_view(), name='create_job'),
    path('api/job-progress/', job_progress, name='job_progress'),
    path('api/models/', get_models, name='get_models'),
    path('api/t2i-models/', get_t2i_models, name='get_t2i-models'),
    path('api/get_masks', get_masks, name='get_masks'),               
    path('api/get_masks_status/<int:job_id>', get_masks_status, name='get_masks_status'),  

] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
