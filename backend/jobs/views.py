from django.shortcuts import render
from rest_framework import views
from .serializers import JobSerializer
from rest_framework.response import Response
from rest_framework import status
from .tasks import process_job
from .models import Job


class CreateJobView(views.APIView):
    def post(self, request):
        image = request.FILES.get('image')
        mask = request.FILES.get('mask')
        prompt = request.data.get('prompt', '')

        if not image:
            return Response({"error": "Image file is required."}, status=status.HTTP_400_BAD_REQUEST)

        job = Job.objects.create(
            image=image,
            mask=mask,
            prompt=prompt
        )

        process_job.delay(job.id)

        return Response({"job_id": job.id, "status": job.status})
    