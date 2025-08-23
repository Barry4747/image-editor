import os
import logging
import requests
from urllib.parse import urljoin
from celery import shared_task
from django.conf import settings
from .models import Job
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)

def send_progress(session_id, event_type, **kwargs):
    try:
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"progress_{session_id}",
            {
                "type": "job.progress",
                "event": event_type,
                **kwargs
            }
        )
    except Exception as e:
        logger.error(f"Failed to send progress update: {str(e)}")

def update_job_status(job, status, session_id=None, **kwargs):
    job.status = status
    job.save()
    if session_id:
        send_progress(session_id, status, job_id=job.id, **kwargs)

def format_output_url(file_path):
    if not file_path:
        return None
    
    if file_path.startswith(('http://', 'https://', '/')):
        return file_path
    
    normalized_path = file_path.replace('\\', '/')
    media_root = settings.MEDIA_ROOT.replace('\\', '/')
    
    if normalized_path.startswith(media_root):
        relative_path = normalized_path[len(media_root):].lstrip('/')
        return urljoin(settings.MEDIA_URL, relative_path)
    
    if not os.path.isabs(file_path):
        return urljoin(settings.MEDIA_URL, file_path)
    
    raise ValueError(f"Path {file_path} is outside MEDIA_ROOT")

@shared_task(bind=True, max_retries=3)
def process_job(self, job_id):
    try:
        job = Job.objects.get(id=job_id)
        logger.info(f"Starting processing for job {job_id}")
        
        update_job_status(job, 'processing', job.session_id)
        send_progress(job.session_id, "created", job_id=job.id)

        files = {}
        file_handles = []
        
        try:
            if job.image:
                try:
                    f = job.image.open('rb')
                    files["image"] = (os.path.basename(job.image.name), f, "image/png")
                    file_handles.append(f)
                except Exception as e:
                    logger.error(f"Failed to open image file: {str(e)}")
                    raise

            if job.mask:
                try:
                    f = job.mask.open('rb')
                    files["mask"] = (os.path.basename(job.mask.name), f, "image/png")
                    file_handles.append(f)
                except Exception as e:
                    logger.error(f"Failed to open mask file: {str(e)}")
                    raise

            send_progress(job.session_id, "progress", job_id=job.id, progress=20)

            data = {"prompt": job.prompt, "job_id": job.id, "model": job.model}
            response = requests.post(
                f"{settings.MODEL_SERVICE_URL}/process-image",
                files=files,
                data=data,
                timeout=120
            )
            
            if response.status_code == 200:
                result = response.json()
                output_url = result.get("output_url")
                
                if output_url:
                    formatted_url = format_output_url(output_url)
                    relative_path = formatted_url.replace(settings.MEDIA_URL, "", 1).lstrip("/")
                    job.output.name = relative_path
                    
                    update_job_status(
                        job, 
                        "done", 
                        job.session_id, 
                        output_url=formatted_url,
                        progress=100
                    )
                else:
                    raise ValueError("Missing output_url in response")
            else:
                error_msg = f"Model error: {response.status_code}"
                logger.error(error_msg)
                raise requests.HTTPError(error_msg)

        finally:
            for f in file_handles:
                try:
                    f.close()
                except Exception as e:
                    logger.error(f"Error closing file: {str(e)}")

    except (IOError, OSError) as e:
        logger.error(f"File error: {str(e)}")
        update_job_status(job, "failed", job.session_id)
        raise
    except requests.RequestException as e:
        logger.error(f"API error: {str(e)}")
        update_job_status(job, "failed", job.session_id)
        raise self.retry(exc=e, countdown=60)
    except Exception as e:
        logger.error(f"Processing error: {str(e)}")
        if not Job.objects.filter(id=job_id).exists():
            logger.error(f"Job {job_id} doesn't exist")
            return
        
        job.refresh_from_db()
        update_job_status(job, "failed", job.session_id)
        raise