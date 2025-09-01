from django.shortcuts import render
from rest_framework import views
from .serializers import JobSerializer
from rest_framework.response import Response
from rest_framework import status
from .tasks import process_job, send_progress, process_segmentation, generate_image
from .models import Job
import logging
from rest_framework.decorators import api_view
import requests
from django.conf import settings

class CreateJobView(views.APIView):
    def post(self, request):
        session_id = request.headers.get('X-Session-ID')
        if not session_id:
            return Response({"error": "Session ID is required."}, status=status.HTTP_400_BAD_REQUEST)

        image = request.FILES.get('image')
        mask = request.FILES.get('mask')

        prompt = request.data.get('prompt', '')
        model = request.data.get('model', 'lustify-sdxl')
        strength = float(request.data.get('strength', 0.75))
        guidance_scale = float(request.data.get('guidance_scale', 9.5))
        steps = int(request.data.get('steps', 40))
        passes = int(request.data.get('passes', 4))
        seed = request.data.get('seed')
        finish_model = request.data.get('finish_model', None)

        # upscaler
        scale = request.data.get('scale', 4)
        upscaler_model = request.data.get('upscaler_model', 'realesrgan-x4plus')
        job = Job.objects.create(
            session_id=session_id,
            image=image,
            mask=mask,
            prompt=prompt,
            model=model,
            strength=strength,
            guidance_scale=guidance_scale,
            steps=steps,
            passes=passes,
            seed=seed,
            finish_model=finish_model,
            upscale_model=upscaler_model,
            scale=scale
        )

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
    session_id = request.headers.get('X-Session-ID')
    if not session_id:
        return Response({"error": "Session ID is required."}, status=400)

    image = request.FILES.get('image')
    if not image:
        return Response({"error": "Image file is required."}, status=400)

    model = request.data.get('model', 'sam-vit-h')
    prompt = '!auto_segmentation'

    job = Job.objects.create(
        session_id=session_id,
        image=image,
        prompt=prompt,
        model=model
    )

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