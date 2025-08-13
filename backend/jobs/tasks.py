import time
from celery import shared_task
from PIL import Image
from django.conf import settings
from .models import Job
import os

@shared_task
def process_job(job_id):
    job = Job.objects.get(id=job_id)
    job.status = 'processing'
    job.save()


    # narazie mock
    time.sleep(5)

    input_path = job.image.path
    output_path = os.path.join(settings.MEDIA_ROOT, 'outputs', f'output_{job_id}.png')\
    
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    img = Image.open(input_path).convert('L')
    img.save(output_path)

    job.output.name = f'outputs/output_{job_id}.png'
    job.status = 'done'
    job.save()

    return job.output.url