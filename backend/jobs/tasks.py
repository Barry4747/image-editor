import time
from celery import shared_task
from PIL import Image
from django.conf import settings
from .models import Job
import os
import requests

@shared_task
def process_job(job_id):
    job = Job.objects.get(id=job_id)
    job.status = 'processing'
    job.save()

    files = {
        'image': open(job.image.path, 'rb'),
    }
    if job.mask:
        files['mask'] = open(job.mask.path, 'rb')

    data = {
        'prompt': job.prompt,
        'job_id': job.id  
    }
    
    response = requests.post(f'{settings.MODEL_SERVICE_URL}/process-image', files=files, data=data)
    
    if response.status_code == 200:
        output_url = response.json()['output_url']
        job.output.name = output_url 
        job.status = 'done'
    else:
        job.status = 'failed'

    job.save()