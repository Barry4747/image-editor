from django.urls import path, include
from .views import (
    CreateJobView, 
    job_progress, 
    get_models, 
    get_masks, 
    get_masks_status, 
    get_t2i_models, 
    get_upscalers,
    session_history,
    clear_session_history_view,
    claim_session_jobs,
    GalleryViewSet,
)
from django.conf import settings
from django.conf.urls.static import static
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework.routers import DefaultRouter

router = DefaultRouter()
router.register(r'my-gallery', GalleryViewSet, basename='my-gallery')

urlpatterns = [
    path('jobs', CreateJobView.as_view(), name='create_job'),
    path('api/job-progress/', job_progress, name='job_progress'),
    path('api/models/', get_models, name='get_models'),
    path('api/t2i-models/', get_t2i_models, name='get_t2i-models'),
    path('api/upscalers/', get_upscalers, name='get_upscalers'),
    path('api/get_masks', get_masks, name='get_masks'),               
    path('api/get_masks_status/<int:job_id>', get_masks_status, name='get_masks_status'),  
    path("history", session_history),
    path("history/clear", clear_session_history_view),
    path("jobs/claim", claim_session_jobs),
    path("auth/token", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("auth/token/refresh", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/", include(router.urls)),

] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
