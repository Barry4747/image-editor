from django.shortcuts import render
from rest_framework import views, viewsets
from .serializers import GalleryJobSerializer
from rest_framework.response import Response
from rest_framework import status
from .tasks import process_job, send_progress, process_segmentation, generate_image
from .models import Job
import logging
from rest_framework.decorators import api_view
import requests
from django.conf import settings
from .session_history import add_event
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from .session_history import get_history, clear_history
from rest_framework.permissions import IsAuthenticated, AllowAny
from .permissions import IsOwnerOrGuest


class CreateJobView(views.APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        user = request.user if request.user.is_authenticated else None
        session_id = request.headers.get("X-Session-ID")
        logging.info(f"user: {user} id: {session_id}")
        if not session_id:
            return Response({"error": "Session ID is required."}, status=status.HTTP_400_BAD_REQUEST)

        image = request.FILES.get('image')
        mask = request.FILES.get('mask')

        prompt = request.data.get('prompt', '')
        negative_prompt = request.data.get('negative_prompt')
        model = request.data.get('model', 'lustify-sdxl')
        strength = float(request.data.get('strength', 0.75))
        guidance_scale = float(request.data.get('guidance_scale', 9.5))
        steps = int(request.data.get('steps', 40))
        passes = int(request.data.get('passes', 4))
        seed = request.data.get('seed')
        finish_model = request.data.get('finish_model', None)

        # upscaler
        upscaler_model = request.data.get('upscaler_model')
        
        job = Job.objects.create(
            user=user,
            session_id=session_id,
            image=image,
            mask=mask,
            prompt=prompt,
            negative_prompt=negative_prompt,
            model=model,
            strength=strength,
            guidance_scale=guidance_scale,
            steps=steps,
            passes=passes,
            seed=seed,
            finish_model=finish_model,
            upscale_model=upscaler_model,
        )
        add_event(session_id, {"type": "created", "job_id": job.id, "model": job.model})

        logging.info(f"Created job with ID: {job.id} for session: {session_id}")

        if image:
            process_job.delay(
                job.id
            )
        else:
            generate_image.delay(
                job.id
            )

        logging.info(f"Started processing job with ID: {job.id}")
        return Response({"job_id": job.id, "status": job.status})

    

@api_view(['POST'])
def job_progress(request):
    job_id = request.data.get('job_id')
    progress = request.data.get('progress')
    output_url = request.data.get('output_url')

    job = Job.objects.filter(id=job_id).first()
    if not job:
        return Response({"error": "Job not found."}, status=status.HTTP_404_NOT_FOUND)
    
    send_progress(job.session_id, "progress", job_id=job.id, progress=progress, preview_url=output_url)

    return Response({"message": "Progress updated successfully."}, status=status.HTTP_200_OK)

@api_view(['GET'])
def get_models(request):
    models = requests.get(f"{settings.MODEL_SERVICE_URL}/models")
    return Response(models.json(), status=models.status_code)

@api_view(['GET'])
def get_t2i_models(request):
    models = requests.get(f"{settings.MODEL_SERVICE_URL}/t2i-models")
    return Response(models.json(), status=models.status_code)

@api_view(['GET'])
def get_upscalers(request):
    upscalers = requests.get(f"{settings.MODEL_SERVICE_URL}/upscalers")
    return Response(upscalers.json(), status=upscalers.status_code)


@api_view(['POST'])
def get_masks(request):
    user = request.user if request.user.is_authenticated else None
    session_id = request.headers.get("X-Session-ID") if not user else ""
    if not session_id:
        return Response({"error": "Session ID is required."}, status=400)

    image = request.FILES.get('image')
    if not image:
        return Response({"error": "Image file is required."}, status=400)

    model = request.data.get('model', 'sam-vit-h')
    prompt = '!auto_segmentation'

    job = Job.objects.create(
        user=user,
        session_id=session_id,
        image=image,
        prompt=prompt,
        model=model
    )
    add_event(session_id, {"type": "created", "job_id": job.id, "model": job.model})


    process_segmentation.delay(job.id)

    return Response({"job_id": job.id, "status": "processing"}, status=202)

@api_view(['GET'])
def get_masks_status(request, job_id):
    try:
        job = Job.objects.get(id=job_id)
    except Job.DoesNotExist:
        return Response({"error": "Job not found"}, status=404)

    if job.status == 'done':
        return Response({"status": "done", "masks": job.masks})
    else:
        return Response({"status": "processing"}, status=202)
    

def _require_session(request):
    sid = request.headers.get("X-Session-ID")
    if not sid:
        return None, Response({"error": "Session ID is required."}, status=400)
    return sid, None

@api_view(["GET"])
def session_history(request):
    session_id, err = _require_session(request)
    if err:
        return err
    return Response({"events": get_history(session_id)})

@api_view(["DELETE"])
def clear_session_history_view(request):
    session_id, err = _require_session(request)
    if err:
        return err
    clear_history(session_id)
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([IsOwnerOrGuest])
def claim_session_jobs(request):
    session_id = request.data.get("session_id")
    if not session_id:
        return Response({"error": "session_id required"}, status=400)
    updated = Job.objects.filter(session_id=session_id, user__isnull=True).update(user=request.user)
    return Response({"moved": updated})


# gallery views

class GalleryViewSet(viewsets.ModelViewSet):
    serializer_class = GalleryJobSerializer
    permission_classes = [IsOwnerOrGuest]

    def get_queryset(self):
        user = self.request.user
        session_id = self.request.headers.get("X-Session-ID")
        logging.info(f"user: {user}, session: {session_id}")
        if user.is_authenticated:
            logging.info("User authenticated")
            return Job.objects.filter(user=user, output__isnull=False).order_by("-created_at")
        elif session_id:
            return Job.objects.filter(session_id=session_id, output__isnull=False).order_by("-created_at")
        return Job.objects.none()

    def perform_create(self, serializer):
        """
        Allow manual creation of a Job (not always needed if Jobs powstają w backendzie pipeline).
        """
        if self.request.user.is_authenticated:
            serializer.save(user=self.request.user)
        else:
            session_id = self.request.headers.get("X-Session-ID")
            serializer.save(session_id=session_id)
