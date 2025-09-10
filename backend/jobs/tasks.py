import os
import logging
import requests
from urllib.parse import urljoin
from celery import shared_task
from django.conf import settings
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from PIL import Image as PILImage
import numpy as np

from .models import Job, JobEvent
from .serializers import JobSerializer
from .session_history import add_event

logger = logging.getLogger(__name__)

from dotenv import load_dotenv

load_dotenv()

# Configuration
BASE_MEDIA_ROOT = os.getenv("MEDIA_ROOT", "/data/media")
MEDIA_ROOT = os.path.join(BASE_MEDIA_ROOT, "outputs")
MEDIA_URL = "/media/"
MASKS_DIR = os.path.join(MEDIA_ROOT, "masks")


def send_progress(session_id, event_type, **kwargs):
    """Send real-time progress update via WebSocket."""
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
    """Update job status, save event, and broadcast progress."""
    job.status = status
    if 'masks' in kwargs:
        job.masks = kwargs['masks']
    job.save()

    JobEvent.objects.create(job=job, type=status, payload=kwargs)

    if session_id:
        send_progress(session_id, status, job_id=job.id, **kwargs)
        add_event(session_id, {"type": status, "job_id": job.id, **kwargs})


def format_output_url(file_path):
    """Convert file path to accessible URL."""
    if not file_path:
        return None

    if file_path.startswith(('http://', 'https://')):
        return file_path

    if file_path.startswith('/'):
        normalized_path = os.path.normpath(file_path).replace('\\', '/')
        media_root = os.path.normpath(settings.MEDIA_ROOT).replace('\\', '/')
        
        if normalized_path.startswith(media_root):
            relative_path = normalized_path[len(media_root):].lstrip('/')
            return urljoin(settings.MEDIA_URL, relative_path)
        else:
            return file_path

    normalized_path = os.path.normpath(file_path).replace('\\', '/')
    media_root = os.path.normpath(settings.MEDIA_ROOT).replace('\\', '/')

    if normalized_path.startswith(media_root):
        relative_path = normalized_path[len(media_root):].lstrip('/')
        return urljoin(settings.MEDIA_URL, relative_path)

    if not os.path.isabs(file_path):
        return urljoin(settings.MEDIA_URL, file_path.lstrip('/'))

    raise ValueError(f"Path {file_path} is outside MEDIA_ROOT")


def save_masks_as_pngs(masks, job_id):
    """Save segmentation masks as transparent PNGs."""
    os.makedirs(MASKS_DIR, exist_ok=True)
    mask_paths = []

    for i, mask_dict in enumerate(masks):
        mask_array = np.array(mask_dict['segmentation'], dtype=np.float32)
        img = PILImage.fromarray((mask_array * 255).astype(np.uint8))
        img = img.convert("L")
        rgba = PILImage.new("RGBA", img.size, (0, 0, 0, 0))
        rgba.putalpha(img)
        mask_path = os.path.join(MASKS_DIR, f"job_{job_id}_mask_{i}.png")
        rgba.save(mask_path)
        mask_paths.append(format_output_url(mask_path))

    return mask_paths


def post_request_with_files(url, data=None, files=None, timeout=120):
    """Make POST request with files and data, handle errors."""
    try:
        response = requests.post(url, data=data, files=files, timeout=timeout)
        response.raise_for_status()
        return response.json()
    except requests.HTTPError as e:
        logger.error(f"HTTP error {response.status_code}: {response.text}")
        raise
    except requests.RequestException as e:
        logger.error(f"Request failed: {str(e)}")
        raise


def prepare_files_for_job(job):
    """Prepare file payloads for upload."""
    files = {}
    handles = []

    def open_file(field, name):
        f = field.open('rb')
        filename = os.path.basename(field.name)
        files[name] = (filename, f, 'image/png')
        handles.append(f)
        return f

    try:
        if job.image:
            open_file(job.image, "image")
        if job.mask:
            open_file(job.mask, "mask")
        return files, handles
    except Exception as e:
        logger.error(f"Failed to open file: {str(e)}")
        raise


def upscale_image(output_image_path, model):
    """Upscale image via model service."""
    if not os.path.exists(output_image_path):
        raise FileNotFoundError(f"Output file not found: {output_image_path}")

    with open(output_image_path, 'rb') as f:
        files = {'image': (os.path.basename(output_image_path), f, 'image/png')}
        data = {"model": model}
        return post_request_with_files(
            f"{settings.MODEL_SERVICE_URL}/upscale",
            data=data,
            files=files,
            timeout=300
        )


def handle_output_and_upscale(job, output_url, progress_step=0.99):
    """Save output, optionally upscale, and update job."""
    formatted_url = format_output_url(output_url)
    relative_path = formatted_url.replace(settings.MEDIA_URL, "", 1).lstrip("/")
    logger.info(f"relative: {relative_path}")
    job.output.name = relative_path
    job.save(update_fields=["output"])

    output_image_path = os.path.join(settings.MEDIA_ROOT, job.output.name)

    # Broadcast preview
    update_job_status(
        job,
        "progress",
        job.session_id,
        preview_url=formatted_url,
        progress=progress_step
    )
    send_progress(job.session_id, "upscaling", job_id=job.id, progress=progress_step, preview_url=formatted_url)

    # Upscale if needed
    upscaled_output_url = formatted_url
    if job.upscale_model:
        try:
            upscale_result = upscale_image(output_image_path, job.upscale_model)
            upscaled_output_url = format_output_url(upscale_result.get("output_url"))
            upscaled_relative_path = upscaled_output_url.replace(settings.MEDIA_URL, "").lstrip("/")
            job.output.name = upscaled_relative_path
            job.save(update_fields=["output"])
        except Exception as e:
            logger.warning(f"Upscaling failed, falling back to original: {str(e)}")

    # Finalize
    serializer = JobSerializer(job)
    update_job_status(
        job,
        "done",
        job.session_id,
        preview_url=upscaled_output_url,
        progress=100,
        job_data=serializer.data
    )
    send_progress(job.session_id, "done", job_id=job.id, progress=100)
    logger.info(f"Processing completed for job {job.id}")


@shared_task(bind=True, max_retries=3)
def process_job(self, job_id):
    """Process an image with optional mask and upscaling."""
    try:
        job = Job.objects.get(id=job_id)
        logger.info(f"Starting processing for job {job_id}")
        update_job_status(job, 'processing', job.session_id)
        send_progress(job.session_id, "created", job_id=job.id)

        files, handles = {}, []
        try:
            files, handles = prepare_files_for_job(job)
            send_progress(job.session_id, "progress", job_id=job.id, progress=20)

            data = {
                "prompt": job.prompt,
                "negative_prompt": job.negative_prompt,
                "job_id": job.id,
                "model": job.model,
                "strength": job.strength,
                "guidance_scale": job.guidance_scale,
                "steps": job.steps,
                "passes": job.passes,
                "seed": job.seed,
                "finish_model": job.finish_model,
            }
            data = {k: v for k, v in data.items() if v is not None}

            result = post_request_with_files(
                f"{settings.MODEL_SERVICE_URL}/process-image",
                data=data,
                files=files,
                timeout=120
            )

            output_url = result.get("output_url")
            if not output_url:
                raise ValueError("Missing output_url in response")

            handle_output_and_upscale(job, output_url, progress_step=50)

        finally:
            for f in handles:
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
            logger.error(f"Job {job_id} does not exist")
            return
        job.refresh_from_db()
        update_job_status(job, "failed", job.session_id)
        raise


@shared_task(bind=True, max_retries=3)
def generate_image(self, job_id):
    """Generate image from prompt and optionally upscale."""
    try:
        job = Job.objects.get(id=job_id)
        logger.info(f"Starting image generation for job {job_id}")
        update_job_status(job, 'processing', job.session_id)
        send_progress(job.session_id, "created", job_id=job.id)

        data = {
            "prompt": job.prompt,
            "negative_prompt": job.negative_prompt,
            "job_id": job.id,
            "model": job.model,
            "guidance_scale": job.guidance_scale,
            "steps": job.steps,
            "seed": job.seed,
        }
        data = {k: v for k, v in data.items() if v is not None}

        result = post_request_with_files(
            f"{settings.MODEL_SERVICE_URL}/generate-image",
            data=data,
            timeout=120
        )

        output_url = result.get("output_url")
        if not output_url:
            raise ValueError("Missing output_url in response")

        handle_output_and_upscale(job, output_url, progress_step=80)

    except requests.RequestException as e:
        logger.error(f"API error: {str(e)}")
        update_job_status(job, "failed", job.session_id)
        raise self.retry(exc=e, countdown=60)
    except Exception as e:
        logger.error(f"Generation error: {str(e)}")
        if not Job.objects.filter(id=job_id).exists():
            logger.error(f"Job {job_id} does not exist")
            return
        job.refresh_from_db()
        update_job_status(job, "failed", job.session_id)
        raise


@shared_task(bind=True, max_retries=3)
def process_segmentation(self, job_id):
    """Run auto-segmentation and save masks."""
    try:
        job = Job.objects.get(id=job_id)
        logger.info(f"Starting segmentation for job {job_id}")
        update_job_status(job, "processing", job.session_id)

        files, handles = {}, []
        try:
            files, handles = prepare_files_for_job(job)
            data = {"model": job.model, "job_id": job_id}

            result = post_request_with_files(
                f"{settings.MODEL_SERVICE_URL}/auto_segmentation",
                data=data,
                files=files,
                timeout=120
            )

            masks = result.get("masks")
            if not masks:
                raise ValueError("Missing masks in response")

            mask_paths = save_masks_as_pngs(masks, job_id)
            update_job_status(job, "done", job.session_id, masks=mask_paths)
            return mask_paths

        finally:
            for f in handles:
                try:
                    f.close()
                except Exception as e:
                    logger.error(f"Error closing file: {str(e)}")

    except requests.RequestException as e:
        logger.error(f"API error: {str(e)}")
        update_job_status(job, "failed", job.session_id)
        raise self.retry(exc=e, countdown=60)
    except Exception as e:
        logger.error(f"Segmentation error: {str(e)}")
        if not Job.objects.filter(id=job_id).exists():
            logger.error(f"Job {job_id} does not exist")
            return
        job.refresh_from_db()
        update_job_status(job, "failed", job.session_id)
        raise