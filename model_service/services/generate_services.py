import os
import logging
from dotenv import load_dotenv
from urllib.parse import urljoin
from services.registry import ModelManager
from services.preprocessing import preprocess_canny

logging.basicConfig(level=logging.DEBUG, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("my_app")


load_dotenv()

def generate_image_file(
    prompt: str,
    negative_prompt: str,
    job_id: int,
    model: str,
    guidance_scale: float,
    steps: int,
    seed: int = None,
) -> str:

    BASE_MEDIA_ROOT = os.getenv("MEDIA_ROOT", "/data/media")
    MEDIA_ROOT = os.path.join(BASE_MEDIA_ROOT, "outputs")
    MEDIA_URL = "/media/"


    BACKEND_HOST = os.getenv("BACKEND_HOST", "localhost")
    BACKEND_PORT = os.getenv("BACKEND_PORT", "8000")


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

