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

models_to_blur = [
    "lustify-sdxl",
]

def notify_progress(job_id: int, progress: int, output_path: str):
    try:
        requests.post(
            f"{DJANGO_API_URL}/api/job-progress/",
            json={
                "job_id": job_id,
                "progress": progress,
                "output_url": output_path,
            },
            timeout=10
        )
    except Exception as e:
        print(f"[WARN] Failed to notify Django about progress {progress}: {e}")


import os
import numpy as np
from scipy import ndimage
from PIL import Image, ImageFilter

def dilate_mask(mask: Image.Image, kernel_size: int = 3, iterations: int = 1) -> Image.Image:
    """Expands the mask so the model can better process edges."""
    mask_np = np.array(mask.convert("L")) / 255.0
    struct = np.ones((kernel_size, kernel_size))
    mask_np = ndimage.binary_dilation(mask_np, structure=struct, iterations=iterations)
    return Image.fromarray((mask_np * 255).astype(np.uint8), mode="L")


def feather_mask(mask: Image.Image, radius: int = 5) -> Image.Image:
    """Applies blur to the mask for smoother transitions."""
    return mask.filter(ImageFilter.GaussianBlur(radius=radius))


def process_image_file(
    input_img: Image.Image,
    mask_img: Image.Image,
    prompt: str,
    negative_prompt: str,
    job_id: int,
    model: str,
    strength: float,
    guidance_scale: float,
    steps: int,
    seed: int = None,
    passes: int = 4,
    finish_model: str = None,
) -> str:
    os.makedirs(MEDIA_ROOT, exist_ok=True)

    if not finish_model:
        finish_model = model

    output_path = os.path.join(MEDIA_ROOT, f"output_{job_id}_iter{0}.png")
    input_img.save(output_path)
    notify_progress(job_id, 0, convert_system_path_to_url(output_path))

    model_instance = ModelManager.get_model(model)

    PREPROCESSORS = {
        "sd1.5-controlnet-canny": preprocess_canny,
    }

    prompt_sequence = [
        f"realistic base, correct proportions, natural pose, {prompt}",
        f"detailed textures, skin pores, fabric weave, realistic lighting, {prompt}",
        f"fine details, subtle imperfections, lifelike eyes, natural skin, {prompt}",
        f"ultra-realistic, 8K, cinematic, perfect anatomy, hyper-detailed, {prompt}"
    ]
    if not negative_prompt:
        negative_prompt = (
            "blurry, cartoon, painting, illustration, drawing, deformed, distorted, "
            "extra limbs, bad anatomy, unrealistic proportions, plastic, doll-like, "
            "airbrushed, overexposed, flat lighting, low contrast, watermark, text, "
            "low quality, noisy, grainy, out of focus"
        )

    extra_kwargs = {}
    if model in PREPROCESSORS:
        extra_kwargs["control_img"] = PREPROCESSORS[model](input_img)

    current_img = input_img

    for i in range(passes):
        if model not in PREPROCESSORS:
            extra_kwargs = {}
            if model in PREPROCESSORS:
                extra_kwargs["control_img"] = PREPROCESSORS[model](current_img)

        last_pass = (i == passes - 1)

        mask_to_use = mask_img.copy()

        if i < passes - 1:
            mask_to_use = dilate_mask(mask_to_use, kernel_size=3, iterations=1)

        feather_radius = max(2, 6 - i)
        mask_to_use = feather_mask(mask_to_use, radius=feather_radius)

        if last_pass and model != finish_model:
            model_instance = ModelManager.switch_model(old_model=model, new_model=finish_model)
            if finish_model in PREPROCESSORS:
                extra_kwargs["control_img"] = PREPROCESSORS[finish_model](current_img)
            elif model in PREPROCESSORS:
                extra_kwargs.pop("control_img", None)

        cur_prompt = prompt_sequence[i] if i < len(prompt_sequence) else prompt

        cur_strength = strength * (0.9 - 0.4 * i / (passes - 1))
        cur_strength = max(0.25, cur_strength)

        cur_steps = steps + i * 5
        iter_seed = seed + i if seed is not None else None

        current_img = model_instance.generate_image(
            init_image=current_img,
            mask_image=mask_to_use,
            prompt=cur_prompt,
            negative_prompt=negative_prompt,
            strength=cur_strength,
            guidance_scale=guidance_scale,
            steps=cur_steps,
            seed=iter_seed,
            **extra_kwargs
        )

        output_path = os.path.join(MEDIA_ROOT, f"output_{job_id}_iter{i+1}.png")
        current_img.save(output_path)
        notify_progress(job_id, (i+1)/(passes+1), convert_system_path_to_url(output_path))

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
