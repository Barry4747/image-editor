import os
import logging
import requests
from urllib.parse import urljoin
from celery import shared_task
from django.conf import settings
from .models import Job
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
import PIL
import numpy as np

logger = logging.getLogger(__name__)

from dotenv import load_dotenv

load_dotenv()

BASE_MEDIA_ROOT = os.getenv("MEDIA_ROOT", "media")
MEDIA_ROOT = os.path.join(BASE_MEDIA_ROOT, "outputs")
MEDIA_URL = "/media/"
MASKS_DIR = os.path.join(MEDIA_ROOT, "masks")


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


def update_job_status(job, status, session_id=None, masks=None, **kwargs):
    job.status = status
    if masks:
        job.masks = masks
    
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


def save_masks_as_pngs(masks, job_id):
    os.makedirs(MASKS_DIR, exist_ok=True)
    mask_paths = []

    for i, mask_dict in enumerate(masks):
        mask_array = np.array(mask_dict['segmentation'], dtype=np.float32)
        img = PIL.Image.fromarray((mask_array * 255).astype(np.uint8))
        img = img.convert("L")  
        rgba = PIL.Image.new("RGBA", img.size, (0, 0, 0, 0))
        rgba.putalpha(img)
        mask_path = os.path.join(MASKS_DIR, f"job_{job_id}_mask_{i}.png")
        rgba.save(mask_path)
        mask_paths.append(format_output_url(mask_path))
    return mask_paths


@shared_task(bind=True, max_retries=3)
def process_job(
    self, job_id, strength=None, guidance_scale=None, steps=None, passes=None, seed=None, finish_model=None
):
    try:
        job = Job.objects.get(id=job_id)
        logger.info(f"Starting processing for job {job_id}")
        
        update_job_status(job, 'processing', job.session_id)
        send_progress(job.session_id, "created", job_id=job.id)

        files = {}
        file_handles = []
        
        try:
            # przygotowanie input image
            if job.image:
                try:
                    f = job.image.open('rb')
                    files["image"] = (os.path.basename(job.image.name), f, "image/png")
                    file_handles.append(f)
                except Exception as e:
                    logger.error(f"Failed to open image file: {str(e)}")
                    raise

            # przygotowanie mask
            if job.mask:
                try:
                    f = job.mask.open('rb')
                    files["mask"] = (os.path.basename(job.mask.name), f, "image/png")
                    file_handles.append(f)
                except Exception as e:
                    logger.error(f"Failed to open mask file: {str(e)}")
                    raise

            send_progress(job.session_id, "progress", job_id=job.id, progress=20)

            # dane dla modelu
            data = {
                "prompt": job.prompt,
                "job_id": job.id,
                "model": job.model,
                "strength": strength,
                "guidance_scale": guidance_scale,
                "steps": steps,
                "passes": passes,
                "seed": seed,
                "finish_model": finish_model,
            }
            data = {k: v for k, v in data.items() if v is not None}

            response = requests.post(
                f"{settings.MODEL_SERVICE_URL}/process-image",
                files=files,
                data=data,
                timeout=120,
            )
            
            if response.status_code != 200:
                error_msg = f"Model error: {response.status_code} {response.text}"
                logger.error(error_msg)
                raise requests.HTTPError(error_msg)

            result = response.json()
            output_url = result.get("output_url")
            
            if not output_url:
                raise ValueError("Missing output_url in response")

            formatted_url = format_output_url(output_url)
            relative_path = formatted_url.replace(settings.MEDIA_URL, "", 1).lstrip("/")
            job.output.name = relative_path
            job.save(update_fields=["output"])

            # teraz status upscaling
            logger.info(f"Image processed for job {job_id}, starting upscaling...")
            send_progress(job.session_id, "upscaling", job_id=job.id, progress=80)

            output_image_path = os.path.join(settings.MEDIA_ROOT, job.output.name)
            
            if not os.path.exists(output_image_path):
                logger.error(f"Output file not found: {output_image_path}")
                raise FileNotFoundError("Output file not found for upscaling.")

            # upscale request
            with open(output_image_path, 'rb') as f_upscale:
                upscale_files = {
                    'image': (os.path.basename(output_image_path), f_upscale, 'image/png')
                }
                upscale_data = {
                    "scale": job.scale or 4,
                }
                upscale_response = requests.post(
                    f"{settings.MODEL_SERVICE_URL}/upscale",
                    files=upscale_files,
                    data=upscale_data,
                    timeout=300,
                )
                if upscale_response.status_code != 200:
                    logger.error(f"Upscale error {upscale_response.status_code}: {upscale_response.text}")
                    raise requests.HTTPError(f"Upscale error {upscale_response.status_code}")
                try:
                    upscale_result = upscale_response.json()
                except Exception:
                    logger.error(f"Upscale returned non-JSON: {upscale_response.text[:200]}")
                    raise

            upscaled_output_url = upscale_result.get("output_url")
            if not upscaled_output_url:
                raise ValueError("Missing output_url in response from upscaler")

            upscaled_relative_path = upscaled_output_url.replace(settings.MEDIA_URL, "").lstrip("/")
            job.output.name = upscaled_relative_path
            job.save(update_fields=["output"])

            update_job_status(
                job,
                "done",
                job.session_id,
                output_url=upscaled_output_url,
                progress=100,
            )
            send_progress(job.session_id, "done", job_id=job.id, progress=100)
            logger.info(f"Upscaling finished for job {job_id}")

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


@shared_task(bind=True, max_retries=3)
def process_segmentation(self, job_id):
    job = Job.objects.get(id=job_id)
    files = {}
    file_handles = []
    job.status = "processing"
    job.save()
    try:
        if job.image:
            f = job.image.open('rb')
            files["image"] = (os.path.basename(job.image.name), f, "image/png")
            file_handles.append(f)

        data = {"model": job.model, "job_id": job_id}

        response = requests.post(
            f"{settings.MODEL_SERVICE_URL}/auto_segmentation",
            files=files,
            data=data,
            timeout=120
        )

        response.raise_for_status()  

        result = response.json()
        masks = result.get("masks")

        if masks is None:
            raise ValueError("Missing masks in response")
        
        mask_paths = save_masks_as_pngs(masks, job_id=job_id)

        update_job_status(
            job, 
            "done", 
            job.session_id, 
            masks=mask_paths,
        )
        job.refresh_from_db()
        return mask_paths

    finally:
        for f in file_handles:
            f.close()