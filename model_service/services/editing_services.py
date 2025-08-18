from PIL import Image
import os
import logging
from dotenv import load_dotenv
from urllib.parse import urljoin
from stable_diffusion.registry import ModelManager
from services.preprocessing import preprocess_canny

logging.basicConfig(level=logging.DEBUG, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("my_app")

load_dotenv()

BASE_MEDIA_ROOT = os.getenv("MEDIA_ROOT", "media")
MEDIA_ROOT = os.path.join(BASE_MEDIA_ROOT, "outputs")
MEDIA_URL = "/media/"


def process_image_file(
    input_img: Image.Image,
    mask_img: Image.Image,
    prompt: str,
    job_id: int,
    model: str,
    strength: float,
    guidance_scale: float,
    steps: int,
    seed: int = None,
) -> str:
    os.makedirs(MEDIA_ROOT, exist_ok=True)

    model_instance = ModelManager.get_model(model)

    PREPROCESSORS = {
        "sd1.5-controlnet-canny": preprocess_canny,
    }

    if model in PREPROCESSORS:
        control_img = PREPROCESSORS[model](input_img)
    else:
        control_img = input_img  

    output_img = model_instance.generate_image(
        control_image=control_img,
        init_image=input_img,  
        mask_image=mask_img,  
        prompt=prompt,
        strength=strength,
        guidance_scale=guidance_scale,
        steps=steps,
        seed=seed,
    )

    output_path = os.path.join(MEDIA_ROOT, f"output_{job_id}.png")
    output_img.save(output_path)

    return output_path



def convert_system_path_to_url(system_path: str) -> str:
    """Converts a system path to a URL relative to MEDIA_URL."""
    normalized_system_path = system_path.replace("\\", "/")
    base_media_root_norm = BASE_MEDIA_ROOT.replace("\\", "/")

    if normalized_system_path.startswith(base_media_root_norm):
        relative_path = normalized_system_path[len(base_media_root_norm) :].lstrip("/")
        return urljoin(MEDIA_URL, relative_path)

    raise ValueError(
        f"Ścieżka {system_path} znajduje się poza BASE_MEDIA_ROOT"
    )
