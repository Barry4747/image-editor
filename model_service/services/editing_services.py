from PIL import Image
import os
import uuid
from dotenv import load_dotenv
import logging
from urllib.parse import urljoin

logging.basicConfig(level=logging.DEBUG, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("my_app")

load_dotenv()

BASE_MEDIA_ROOT = os.getenv("MEDIA_ROOT", "media")  # np. <project_root>/data/media
MEDIA_ROOT = os.path.join(BASE_MEDIA_ROOT, "outputs")  # fizyczne miejsce zapisu
MEDIA_URL = '/media/'  # URL odpowiadający BASE_MEDIA_ROOT

def process_image_file(image_path: str) -> str:
    os.makedirs(MEDIA_ROOT, exist_ok=True)
    logging.debug(f"Ensured MEDIA_ROOT exists: {MEDIA_ROOT}")

    try:
        img = Image.open(image_path).convert("L")
    except FileNotFoundError:
        logging.error(f"File not found: {image_path}")
        raise
    except Exception as e:
        logging.error(f"Error opening image: {e}")
        raise

    output_filename = f"output_{uuid.uuid4().hex}.png"
    output_path = os.path.join(MEDIA_ROOT, output_filename)
    img.save(output_path)
    logging.info(f"Saved processed image to: {output_path}")

    return output_path

def convert_system_path_to_url(system_path: str) -> str:
    """Konwertuje ścieżkę systemową na URL dostępny przez przeglądarkę"""
    normalized_system_path = system_path.replace('\\', '/')
    base_media_root_norm = BASE_MEDIA_ROOT.replace('\\', '/')

    if normalized_system_path.startswith(base_media_root_norm):
        relative_path = normalized_system_path[len(base_media_root_norm):].lstrip('/')
        return urljoin(MEDIA_URL, relative_path)

    raise ValueError(f"Ścieżka {system_path} znajduje się poza BASE_MEDIA_ROOT")
