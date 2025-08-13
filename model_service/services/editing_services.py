from PIL import Image
import os
import uuid

MEDIA_ROOT = "media/outputs"

def process_image_file(image_path: str) -> str:
    """
    Processes the image and returns the path to the resulting file. 
    """
    os.makedirs(MEDIA_ROOT, exist_ok=True)
    img = Image.open(image_path).convert("L")
    output_filename = f"output_{uuid.uuid4().hex}.png"
    output_path = os.path.join(MEDIA_ROOT, output_filename)
    img.save(output_path)
    return output_path
