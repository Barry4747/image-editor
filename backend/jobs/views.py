from django.shortcuts import render
from rest_framework import views
from .serializers import JobSerializer
from rest_framework.response import Response
from rest_framework import status
from .tasks import process_job, send_progress
from .models import Job
import logging
from rest_framework.decorators import api_view

class CreateJobView(views.APIView):
    def post(self, request):
        session_id = request.headers.get('X-Session-ID')
        if not session_id:
            return Response({"error": "Session ID is required."}, status=status.HTTP_400_BAD_REQUEST)

        image = request.FILES.get('image')
        mask = request.FILES.get('mask')
        prompt = request.data.get('prompt', '')

        if not image:
            return Response({"error": "Image file is required."}, status=status.HTTP_400_BAD_REQUEST)

        job = Job.objects.create(
            session_id=session_id,
            image=image,
            mask=mask,
            prompt=prompt
        )
        logging.info(f"Created job with ID: {job.id} for session: {session_id}")
        process_job.delay(job.id)
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