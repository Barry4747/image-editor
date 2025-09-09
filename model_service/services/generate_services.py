from PIL import Image, ImageFilter
import os
import logging
from dotenv import load_dotenv
from urllib.parse import urljoin
from services.registry import ModelManager
from services.preprocessing import preprocess_canny

logging.basicConfig(level=logging.DEBUG, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("my_app")

load_dotenv()

BASE_MEDIA_ROOT = os.getenv("MEDIA_ROOT", "media")
MEDIA_ROOT = os.path.join(BASE_MEDIA_ROOT, "outputs")
MEDIA_URL = "/media/"

import requests
import os

DJANGO_API_URL = os.getenv("DJANGO_API_URL", "http://localhost:8000")

import os
import numpy as np
from scipy import ndimage
from PIL import Image, ImageFilter

def generate_image_file(
    prompt: str,
    negative_prompt: str,
    job_id: int,
    model: str,
    guidance_scale: float,
    steps: int,
    seed: int = None,
) -> str:
    os.makedirs(MEDIA_ROOT, exist_ok=True)

    model_instance = ModelManager.get_model(model, t2i=True)

    if not negative_prompt:
        negative_prompt = (
            "blurry, cartoon, painting, illustration, drawing, deformed, distorted, "
            "extra limbs, bad anatomy, unrealistic proportions, plastic, doll-like, "
            "airbrushed, overexposed, flat lighting, low contrast, watermark, text, "
            "low quality, noisy, grainy, out of focus"
        )

    current_img = model_instance.generate_image(
        job_id = job_id,
        prompt=prompt,
        negative_prompt=negative_prompt,
        guidance_scale=guidance_scale,
        steps=steps,
        seed=seed,
        )

    output_path = os.path.join(MEDIA_ROOT, f"output_{job_id}_gen.png")
    current_img.save(output_path)
    return output_path



def convert_system_path_to_url(system_path: str) -> str:
    """Converts a system path to a URL relative to MEDIA_URL."""
    normalized_system_path = system_path.replace("\\", "/")
    base_media_root_norm = BASE_MEDIA_ROOT.replace("\\", "/")

    if normalized_system_path.startswith(base_media_root_norm):
        relative_path = normalized_system_path[len(base_media_root_norm) :].lstrip("/")
        return urljoin(MEDIA_URL, relative_path)

    raise ValueError(
        f"Path {system_path} exists outside BASE_MEDIA_ROOT"
    )
