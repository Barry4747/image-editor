from django.shortcuts import render
from rest_framework import views
from .serializers import JobSerializer
from rest_framework.response import Response
from rest_framework import status
from .tasks import process_job
from .models import Job
import logging

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
    